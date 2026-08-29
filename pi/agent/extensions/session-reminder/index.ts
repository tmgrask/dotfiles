import { uuidv7 } from "@earendil-works/pi-ai";
import {
  getMarkdownTheme,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  Markdown,
  matchesKey,
  Text,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";

import {
  buildSessionReminderPrompt,
  buildSessionReminderUpdate,
  findLatestSessionReminder,
  findRecentSessionTopics,
  parseSessionReminderResponse,
  SESSION_REMINDER_CUSTOM_ENTRY_TYPE,
  type SessionReminder,
} from "./session-reminder.ts";
import { installSessionTopicFooter } from "./session-topic-footer.ts";

const SESSION_REMINDER_SHORTCUT = "ctrl+shift+r";

type HerdrTabConfiguration =
  | { readonly enabled: false }
  | { readonly enabled: true; readonly tabId: string };

function readHerdrTabConfiguration(environment: NodeJS.ProcessEnv): HerdrTabConfiguration {
  const tabId = environment.HERDR_TAB_ID;
  return environment.HERDR_ENV === "1" && typeof tabId === "string" && tabId.length > 0
    ? { enabled: true, tabId }
    : { enabled: false };
}

function assistantResponseText(content: readonly unknown[]): string {
  const parts: string[] = [];
  for (const value of content) {
    if (typeof value !== "object" || value === null || !("type" in value) || value.type !== "text") continue;
    if (!("text" in value) || typeof value.text !== "string") continue;
    parts.push(value.text);
  }
  return parts.join("\n");
}

async function showSessionReminderOverlay(
  reminder: SessionReminder,
  ctx: ExtensionContext,
): Promise<void> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify(`${reminder.title}\n${reminder.summary}`, "info");
    return;
  }

  await ctx.ui.custom<void>(
    (_tui, theme, _keybindings, done) => {
      const content = new Container();
      content.addChild(new Text(theme.fg("accent", theme.bold(reminder.title)), 1, 1));
      content.addChild(new Markdown(reminder.summary, 1, 1, getMarkdownTheme()));
      content.addChild(new Text(theme.fg("dim", "Enter or Esc to close"), 1, 0));

      return {
        render: (width: number) => {
          if (width < 3) return content.render(width);
          const interiorWidth = width - 2;
          const border = theme.fg("accent", `+${"-".repeat(interiorWidth)}+`);
          const contentLines = content.render(interiorWidth).map((line) => {
            const fittedLine = truncateToWidth(line, interiorWidth, "");
            const padding = " ".repeat(Math.max(0, interiorWidth - visibleWidth(fittedLine)));
            return `${theme.fg("accent", "|")}${fittedLine}${padding}${theme.fg("accent", "|")}`;
          });
          return [border, ...contentLines, border];
        },
        invalidate: () => content.invalidate(),
        handleInput: (data: string) => {
          if (matchesKey(data, "enter") || matchesKey(data, "escape")) done(undefined);
        },
      };
    },
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        width: "62%",
        minWidth: 48,
        maxHeight: "70%",
        margin: 1,
      },
    },
  );
}

/** Register dynamic session names and the `/remind-me` glanceable summary shortcut. */
export default function registerSessionReminderExtension(pi: ExtensionAPI): void {
  const herdrTab = readHerdrTabConfiguration(process.env);
  let currentReminder: SessionReminder | undefined;
  let refreshInFlight: Promise<SessionReminder | undefined> | undefined;
  let refreshAbortController: AbortController | undefined;
  let backgroundRefreshRequested = false;
  let backgroundRefreshDrain: Promise<void> | undefined;
  let sessionActive = false;
  let requestSessionTopicFooterRender = (): void => {};

  const renameHerdrTab = async (title: string): Promise<void> => {
    if (!herdrTab.enabled) return;
    const result = await pi.exec("herdr", ["tab", "rename", herdrTab.tabId, title], {
      timeout: 2_000,
    });
    if (result.code !== 0) {
      throw new Error(`Session reminder Herdr tab rename failed: ${result.stderr.trim()}`);
    }
  };

  const applySessionReminderTitle = async (reminder: SessionReminder): Promise<void> => {
    if (pi.getSessionName() !== reminder.title) pi.setSessionName(reminder.title);
    await renameHerdrTab(reminder.title);
  };

  const generateSessionReminder = async (
    ctx: ExtensionContext,
    notifyOnFailure: boolean,
    signal: AbortSignal,
  ): Promise<SessionReminder | undefined> => {
    const update = buildSessionReminderUpdate(ctx.sessionManager.getBranch());
    if (update === undefined) return currentReminder;
    const modelRegistry = ctx.modelRegistry;
    const ui = ctx.ui;
    const model = ctx.model;
    if (model === undefined) {
      if (notifyOnFailure) ui.notify("Session reminder requires a selected model", "warning");
      return currentReminder;
    }

    try {
      const authentication = await modelRegistry.getProviderAuth(model.provider);
      if (authentication === undefined) {
        if (notifyOnFailure) ui.notify("Session reminder requires model authentication", "warning");
        return currentReminder;
      }

      const response = await modelRegistry.complete(
        model,
        {
          messages: [{
            role: "user",
            content: [{ type: "text", text: buildSessionReminderPrompt(update) }],
            timestamp: Date.now(),
          }],
        },
        { cacheRetention: "none", sessionId: uuidv7(), signal },
      );
      if (signal.aborted || !sessionActive) return currentReminder;

      const reminder = parseSessionReminderResponse(
        assistantResponseText(response.content),
        update.sourceConversationEntryId,
      );
      if (reminder === undefined) {
        if (notifyOnFailure) ui.notify("Session reminder model returned invalid JSON", "warning");
        return currentReminder;
      }

      currentReminder = reminder;
      pi.appendEntry(SESSION_REMINDER_CUSTOM_ENTRY_TYPE, reminder);
      requestSessionTopicFooterRender();
      await applySessionReminderTitle(reminder);
      return reminder;
    } catch (error) {
      if (signal.aborted || !sessionActive) return currentReminder;
      if (notifyOnFailure) {
        const message = error instanceof Error ? error.message : String(error);
        ui.notify(`Session reminder update failed: ${message}`, "warning");
      }
      return currentReminder;
    }
  };

  const refreshSessionReminder = (
    ctx: ExtensionContext,
    notifyOnFailure: boolean,
  ): Promise<SessionReminder | undefined> => {
    if (refreshInFlight !== undefined) return refreshInFlight;

    const ui = ctx.ui;
    const abortController = new AbortController();
    refreshAbortController = abortController;
    ui.setStatus("session-reminder", "◌ Preparing session summary…");

    const refreshPromise = generateSessionReminder(
      ctx,
      notifyOnFailure,
      abortController.signal,
    ).finally(() => {
      if (refreshAbortController === abortController) refreshAbortController = undefined;
      if (refreshInFlight === refreshPromise) refreshInFlight = undefined;
      if (sessionActive) ui.setStatus("session-reminder", undefined);
    });
    refreshInFlight = refreshPromise;
    return refreshPromise;
  };

  const requestBackgroundSessionReminderRefresh = (ctx: ExtensionContext): void => {
    if (!sessionActive) return;

    backgroundRefreshRequested = true;
    if (backgroundRefreshDrain !== undefined) return;

    const ui = ctx.ui;
    const drainBackgroundRefreshes = async (): Promise<void> => {
      while (sessionActive && backgroundRefreshRequested) {
        backgroundRefreshRequested = false;
        await refreshSessionReminder(ctx, false);
      }
    };

    backgroundRefreshDrain = drainBackgroundRefreshes()
      .catch((error: unknown) => {
        if (!sessionActive) return;
        const message = error instanceof Error ? error.message : String(error);
        ui.notify(`Session reminder background refresh failed: ${message}`, "warning");
      })
      .finally(() => {
        backgroundRefreshDrain = undefined;
        if (sessionActive && backgroundRefreshRequested) {
          requestBackgroundSessionReminderRefresh(ctx);
        }
      });
  };

  const remindMe = async (ctx: ExtensionContext): Promise<void> => {
    const reminder = ctx.isIdle()
      ? await refreshSessionReminder(ctx, true)
      : currentReminder;
    if (reminder === undefined) {
      ctx.ui.notify("No session reminder is available yet", "warning");
      return;
    }
    await showSessionReminderOverlay(reminder, ctx);
  };

  pi.on("session_start", async (_event, ctx) => {
    sessionActive = true;
    currentReminder = findLatestSessionReminder(ctx.sessionManager.getBranch());
    requestSessionTopicFooterRender = installSessionTopicFooter(
      ctx,
      () => findRecentSessionTopics(ctx.sessionManager.getBranch()),
    ).requestRender;
    if (currentReminder !== undefined) {
      try {
        await applySessionReminderTitle(currentReminder);
      } catch {
        // A missing or stale Herdr session must not prevent Pi from restoring its reminder.
      }
    }
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (ctx.isIdle()) requestBackgroundSessionReminderRefresh(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    sessionActive = false;
    backgroundRefreshRequested = false;
    refreshAbortController?.abort();
    refreshAbortController = undefined;
    ctx.ui.setStatus("session-reminder", undefined);
  });

  pi.registerCommand("remind-me", {
    description: "Show and refresh a concise reminder of this session's work",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      await remindMe(ctx);
    },
  });

  pi.registerShortcut(SESSION_REMINDER_SHORTCUT, {
    description: "Show a concise reminder of this session's work",
    handler: remindMe,
  });
}
