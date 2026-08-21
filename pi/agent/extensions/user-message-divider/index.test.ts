import assert from "node:assert/strict";
import test from "node:test";

import { addUserMessageTopDivider } from "./index.ts";

test("adds only a top divider without rewriting user Markdown", () => {
  const markdown = "Fix **this** please.\n\n- Keep the list";

  assert.equal(
    addUserMessageTopDivider(markdown),
    `⟢-----------⟢\n\n${markdown}`,
  );
});

test("leaves empty user messages unchanged", () => {
  assert.equal(addUserMessageTopDivider("  "), "  ");
});
