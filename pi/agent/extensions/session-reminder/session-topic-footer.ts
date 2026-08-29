import { homedir } from "node:os";
import { sep } from "node:path";

import type {
  ExtensionContext,
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const SESSION_TOPIC_FOOTER_ROWS = 3;
const FOOTER_COLUMN_GAP = 2;

/** Handle used to redraw the session topic timeline after a reminder update. */
export type SessionTopicFooterHandle = {
  readonly requestRender: () => void;
};

function formatFooterTokenCount(count: number): string {
  if (count < 1_000) return String(count);
  if (count < 10_000) return `${(count / 1_000).toFixed(1)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1_000)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

function formatFooterWorkingDirectory(cwd: string): string {
  const home = homedir();
  if (cwd === home) return "~";
  return cwd.startsWith(`${home}${sep}`) ? `~${cwd.slice(home.length)}` : cwd;
}

function sanitizeFooterStatus(text: string): string {
  // Preserve ANSI styling while preventing a status from adding footer rows.
  return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

function layoutFooterSides(left: string, right: string, width: number): string {
  const fittedLeft = truncateToWidth(left, width, "");
  const leftWidth = visibleWidth(fittedLeft);
  const availableRightWidth = width - leftWidth - FOOTER_COLUMN_GAP;
  if (right.length === 0 || availableRightWidth <= 0) return fittedLeft;

  const fittedRight = truncateToWidth(right, availableRightWidth, "");
  const rightWidth = visibleWidth(fittedRight);
  return `${fittedLeft}${" ".repeat(Math.max(0, width - leftWidth - rightWidth))}${fittedRight}`;
}

/** Lay out one footer row while keeping a topic centered when all three columns fit. */
export function layoutSessionTopicFooterRow(
  left: string,
  topic: string,
  right: string,
  width: number,
): string {
  if (width <= 0) return "";
  if (topic.length === 0) return layoutFooterSides(left, right, width);

  const fittedLeft = truncateToWidth(left, width, "");
  const fittedRight = truncateToWidth(right, width, "");
  const fittedTopic = truncateToWidth(topic, width, "");
  const leftWidth = visibleWidth(fittedLeft);
  const rightWidth = visibleWidth(fittedRight);
  const topicWidth = visibleWidth(fittedTopic);
  const topicStart = Math.floor((width - topicWidth) / 2);
  const rightStart = width - rightWidth;

  if (
    topicStart < leftWidth + FOOTER_COLUMN_GAP ||
    topicStart + topicWidth + FOOTER_COLUMN_GAP > rightStart
  ) {
    return layoutFooterSides(left, right, width);
  }

  return [
    fittedLeft,
    " ".repeat(topicStart - leftWidth),
    fittedTopic,
    " ".repeat(rightStart - topicStart - topicWidth),
    fittedRight,
  ].join("");
}

function formatSessionTopicRows(topics: readonly string[], theme: Theme): readonly string[] {
  const rows = Array.from({ length: SESSION_TOPIC_FOOTER_ROWS }, () => "");
  const visibleTopics = topics.slice(-SESSION_TOPIC_FOOTER_ROWS);
  const firstTopicRow = SESSION_TOPIC_FOOTER_ROWS - visibleTopics.length;

  for (const [index, topic] of visibleTopics.entries()) {
    const row = firstTopicRow + index;
    const marker = row === SESSION_TOPIC_FOOTER_ROWS - 1 ? "●" : "○";
    const text = `${marker} ${topic}`;
    rows[row] = row === SESSION_TOPIC_FOOTER_ROWS - 1
      ? theme.fg("accent", theme.bold(text))
      : row === SESSION_TOPIC_FOOTER_ROWS - 2
        ? theme.fg("muted", text)
        : theme.fg("dim", text);
  }

  return rows;
}

function formatSessionUsage(ctx: ExtensionContext, theme: Theme): string {
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;

  for (const entry of ctx.sessionManager.getEntries()) {
    const usage = entry.type === "message" &&
        (entry.message.role === "assistant" || entry.message.role === "toolResult")
      ? entry.message.usage
      : entry.type === "compaction" || entry.type === "branch_summary"
        ? entry.usage
        : undefined;
    if (usage === undefined) continue;
    inputTokens += usage.input;
    outputTokens += usage.output;
    cost += usage.cost.total;
  }

  const parts: string[] = [];
  if (inputTokens > 0) parts.push(`↑${formatFooterTokenCount(inputTokens)}`);
  if (outputTokens > 0) parts.push(`↓${formatFooterTokenCount(outputTokens)}`);
  if (cost > 0) parts.push(`$${cost.toFixed(3)}`);

  const contextUsage = ctx.getContextUsage();
  const contextPercent = contextUsage?.percent;
  const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
  const contextText = contextPercent === null || contextPercent === undefined
    ? `?/${formatFooterTokenCount(contextWindow)}`
    : `${contextPercent.toFixed(1)}%/${formatFooterTokenCount(contextWindow)}`;
  parts.push(contextPercent !== null && contextPercent !== undefined && contextPercent > 90
    ? theme.fg("error", contextText)
    : contextPercent !== null && contextPercent !== undefined && contextPercent > 70
      ? theme.fg("warning", contextText)
      : contextText);

  return theme.fg("dim", parts.join(" "));
}

function formatFooterStatuses(footerData: ReadonlyFooterDataProvider): string {
  return Array.from(footerData.getExtensionStatuses().entries())
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([, text]) => sanitizeFooterStatus(text))
    .filter((text) => text.length > 0)
    .join(" ");
}

/** Install the three-row Pi footer with recent topics ordered oldest to newest. */
export function installSessionTopicFooter(
  ctx: ExtensionContext,
  getTopics: () => readonly string[],
): SessionTopicFooterHandle {
  let requestRender = (): void => {};

  if (ctx.mode !== "tui") return { requestRender };

  ctx.ui.setFooter((tui, theme, footerData) => {
    requestRender = () => tui.requestRender();
    const unsubscribeFromBranchChanges = footerData.onBranchChange(requestRender);

    return {
      dispose: unsubscribeFromBranchChanges,
      invalidate() {},
      render(width: number): string[] {
        const branch = footerData.getGitBranch();
        const workingDirectory = formatFooterWorkingDirectory(ctx.cwd);
        const leftRows = [
          theme.fg("dim", branch === null ? workingDirectory : `${workingDirectory} (${branch})`),
          formatSessionUsage(ctx, theme),
          formatFooterStatuses(footerData),
        ];
        const model = ctx.model;
        const modelText = model === undefined
          ? "no-model"
          : model.reasoning
            ? `${model.id} • ${ctx.thinkingLevel}`
            : model.id;
        const rightRows = ["", theme.fg("dim", modelText), ""];
        const topicRows = formatSessionTopicRows(getTopics(), theme);

        return leftRows.map((left, index) => layoutSessionTopicFooterRow(
          left,
          topicRows[index] ?? "",
          rightRows[index] ?? "",
          width,
        ));
      },
    };
  });

  return { requestRender: () => requestRender() };
}
