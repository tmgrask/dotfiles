import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import {
  discoverAndLoadExtensions,
  ExtensionRunner,
  ModelRegistry,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const extensionPath = join(dirname(fileURLToPath(import.meta.url)), "index.ts");

test("automatic reminder refresh runs in the background after the agent settles", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-session-reminder-"));
  try {
    const loaded = await discoverAndLoadExtensions([extensionPath], cwd, join(cwd, ".agent"));
    assert.deepEqual(loaded.errors, []);

    const faux = fauxProvider();
    const responseGate = Promise.withResolvers<void>();
    faux.setResponses([
      async () => {
        await responseGate.promise;
        return fauxAssistantMessage(JSON.stringify({
          title: "Background reminders",
          summary: "**Progress:** Refresh completed without blocking input.",
        }));
      },
    ]);

    const modelRuntime = await ModelRuntime.create({
      credentials: new InMemoryCredentialStore(),
      modelsPath: null,
      allowModelNetwork: false,
    });
    modelRuntime.registerNativeProvider(faux.provider);
    const sessionManager = SessionManager.inMemory(cwd);
    sessionManager.appendMessage({
      role: "user",
      content: "Keep reminder updates out of the prompt path",
      timestamp: Date.now(),
    });
    const runner = new ExtensionRunner(
      loaded.extensions,
      loaded.runtime,
      cwd,
      sessionManager,
      new ModelRegistry(modelRuntime),
    );
    let sessionName: string | undefined;
    loaded.runtime.appendEntry = (customType, data) => sessionManager.appendCustomEntry(customType, data);
    loaded.runtime.setSessionName = (name) => {
      sessionName = name;
    };
    loaded.runtime.getSessionName = () => sessionName;
    runner.bindCore(loaded.runtime, {
      getModel: () => faux.getModel(),
      getScopedModels: () => [],
      isIdle: () => true,
      isProjectTrusted: () => true,
      getSignal: () => undefined,
      abort: () => undefined,
      hasPendingMessages: () => false,
      shutdown: () => undefined,
      getContextUsage: () => undefined,
      compact: () => undefined,
      getSystemPrompt: () => "",
    });

    await runner.emit({ type: "session_start", reason: "startup" });
    const settledEvent = runner.emit({ type: "agent_settled" });
    const outcome = await Promise.race([
      settledEvent.then(() => "settled" as const),
      delay(100, "blocked" as const),
    ]);

    responseGate.resolve();
    await settledEvent;
    assert.equal(outcome, "settled", "agent_settled waited for the reminder model response");

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const reminder = sessionManager.getBranch().find(
        (entry) => entry.type === "custom" && entry.customType === "session-reminder",
      );
      if (reminder !== undefined) break;
      await delay(10);
    }
    assert.ok(sessionManager.getBranch().some(
      (entry) => entry.type === "custom" && entry.customType === "session-reminder",
    ));

    await runner.emit({ type: "session_shutdown", reason: "quit" });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("/remind-me reports when a new session has nothing to summarize", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-session-reminder-"));
  try {
    const loaded = await discoverAndLoadExtensions([extensionPath], cwd, join(cwd, ".agent"));
    assert.deepEqual(loaded.errors, []);
    const modelRuntime = await ModelRuntime.create({
      credentials: new InMemoryCredentialStore(),
      modelsPath: null,
      allowModelNetwork: false,
    });
    const runner = new ExtensionRunner(
      loaded.extensions,
      loaded.runtime,
      cwd,
      SessionManager.inMemory(cwd),
      new ModelRegistry(modelRuntime),
    );
    const notifications: Array<{
      readonly message: string;
      readonly type: "info" | "warning" | "error" | undefined;
    }> = [];
    const reminderStatuses: Array<string | undefined> = [];
    runner.setUIContext({
      ...runner.getUIContext(),
      notify: (message, type) => notifications.push({ message, type }),
      setStatus: (key, text) => {
        if (key === "session-reminder") reminderStatuses.push(text);
      },
    });

    await runner.emit({ type: "session_start", reason: "startup" });
    const command = runner.getCommand("remind-me");
    assert.ok(command, "/remind-me should be registered");
    await command.handler("", runner.createCommandContext());

    assert.deepEqual(notifications, [
      { message: "No session reminder is available yet", type: "warning" },
    ]);
    assert.equal(reminderStatuses.length, 2);
    assert.match(reminderStatuses[0] ?? "", /Preparing session summary/);
    assert.equal(reminderStatuses[1], undefined);
    assert.ok(runner.getShortcuts({}).has("ctrl+shift+r"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
