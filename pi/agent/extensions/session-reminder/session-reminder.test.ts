import assert from "node:assert/strict";
import test from "node:test";

import type { AssistantMessage, UserMessage } from "@earendil-works/pi-ai";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";

import {
  buildSessionReminderPrompt,
  buildSessionReminderUpdate,
  findLatestSessionReminder,
  findRecentSessionTopics,
  parseSessionReminderResponse,
  sanitizeSessionReminderTitle,
  SESSION_REMINDER_CUSTOM_ENTRY_TYPE,
} from "./session-reminder.ts";

function userMessage(text: string, id: string, parentId: string | null): SessionEntry {
  const message: UserMessage = { role: "user", content: text, timestamp: 1 };
  return { type: "message", id, parentId, timestamp: "2026-01-01T00:00:00.000Z", message };
}

function assistantMessage(text: string, id: string, parentId: string): SessionEntry {
  const message: AssistantMessage = {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai-responses",
    provider: "openai",
    model: "test",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: 2,
  };
  return { type: "message", id, parentId, timestamp: "2026-01-01T00:00:01.000Z", message };
}

function reminderEntry(parentId: string, title = "Auth token refresh", id = "reminder"): SessionEntry {
  return {
    type: "custom",
    id,
    parentId,
    timestamp: "2026-01-01T00:00:02.000Z",
    customType: SESSION_REMINDER_CUSTOM_ENTRY_TYPE,
    data: {
      title,
      summary: "**Objective:** Repair token refresh.\n\n**Next:** Add expiry tests.",
      sourceConversationEntryId: parentId,
    },
  };
}

test("builds the first reminder from conversation activity", () => {
  const update = buildSessionReminderUpdate([
    userMessage("Fix auth refresh", "user-1", null),
    assistantMessage("I found the expiry bug.", "assistant-1", "user-1"),
  ]);

  assert.deepEqual(update, {
    previousReminder: undefined,
    activity: "User: Fix auth refresh\n\nAssistant: I found the expiry bug.",
    sourceConversationEntryId: "assistant-1",
  });
});

test("evolves from the latest reminder using only newer activity", () => {
  const existingReminder = reminderEntry("assistant-1");
  const entries = [
    userMessage("Fix auth refresh", "user-1", null),
    assistantMessage("I found the expiry bug.", "assistant-1", "user-1"),
    existingReminder,
    userMessage("Add the regression test", "user-2", "reminder"),
    assistantMessage("The test now passes.", "assistant-2", "user-2"),
  ];

  const update = buildSessionReminderUpdate(entries);
  assert.ok(update);
  assert.equal(update.previousReminder?.title, "Auth token refresh");
  assert.equal(update.activity, "User: Add the regression test\n\nAssistant: The test now passes.");
  assert.equal(update.sourceConversationEntryId, "assistant-2");
  const prompt = buildSessionReminderPrompt(update);
  assert.match(prompt, /Previous title: Auth token refresh/);
  assert.match(prompt, /title is the session's current objective/);
  assert.match(prompt, /Do not repeat the objective in the summary/);
  assert.match(prompt, /Preserve the previous title exactly/);
});

test("returns the three most recent topic changes from oldest to newest", () => {
  const entries = [
    reminderEntry("assistant-1", "Initial investigation", "reminder-1"),
    reminderEntry("reminder-1", "Initial investigation", "reminder-2"),
    reminderEntry("reminder-2", "Implement footer timeline", "reminder-3"),
    reminderEntry("reminder-3", "Implement footer timeline", "reminder-4"),
    reminderEntry("reminder-4", "Polish topic rendering", "reminder-5"),
    reminderEntry("reminder-5", "Verify footer behavior", "reminder-6"),
  ];

  assert.deepEqual(findRecentSessionTopics(entries), [
    "Implement footer timeline",
    "Polish topic rendering",
    "Verify footer behavior",
  ]);
});

test("restores the latest valid reminder and ignores malformed persisted entries", () => {
  const valid = reminderEntry("assistant-1");
  const malformed: SessionEntry = {
    type: "custom",
    id: "bad-reminder",
    parentId: valid.id,
    timestamp: "2026-01-01T00:00:03.000Z",
    customType: SESSION_REMINDER_CUSTOM_ENTRY_TYPE,
    data: { title: 123, summary: null },
  };

  assert.equal(findLatestSessionReminder([valid, malformed])?.title, "Auth token refresh");
});

test("parses fenced model JSON and constrains terminal tab titles", () => {
  const response = parseSessionReminderResponse(
    '```json\n{"title":"  Auth\\nrefresh   regression coverage that is much too long", "summary":" **Progress:** fixed  "}\n```',
    "assistant-2",
  );

  assert.deepEqual(response, {
    title: "Auth refresh regression coverage that is m",
    summary: "**Progress:** fixed",
    sourceConversationEntryId: "assistant-2",
  });
  assert.ok(response);
  assert.equal(Array.from(response.title).length, 42);
});

test("rejects invalid model responses and normalizes whitespace", () => {
  assert.equal(parseSessionReminderResponse("not json", "assistant-2"), undefined);
  assert.equal(sanitizeSessionReminderTitle("  one\n\t\u001b[31m two  "), "one two");
});
