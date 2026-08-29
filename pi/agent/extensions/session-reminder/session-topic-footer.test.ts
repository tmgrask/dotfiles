import assert from "node:assert/strict";
import test from "node:test";

import { visibleWidth } from "@earendil-works/pi-tui";

import { layoutSessionTopicFooterRow } from "./session-topic-footer.ts";

test("centers a topic between footer information on a wide screen", () => {
  const row = layoutSessionTopicFooterRow("~/project (main)", "● Current topic", "gpt-5.6 • medium", 100);

  assert.equal(visibleWidth(row), 100);
  assert.equal(row.indexOf("● Current topic"), Math.floor((100 - "● Current topic".length) / 2));
  assert.ok(row.startsWith("~/project (main)"));
  assert.ok(row.endsWith("gpt-5.6 • medium"));
});

test("preserves footer information and omits a topic when columns collide", () => {
  const row = layoutSessionTopicFooterRow("~/long-project", "● A topic that cannot fit", "gpt-5.6", 28);

  assert.equal(visibleWidth(row), 28);
  assert.ok(row.startsWith("~/long-project"));
  assert.ok(row.endsWith("gpt-5.6"));
  assert.doesNotMatch(row, /cannot fit/);
});
