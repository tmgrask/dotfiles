import assert from "node:assert/strict";
import test from "node:test";

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createKagiWebSearchTool } from "./kagi-websearch.ts";

// SAFETY: The Kagi tool does not read ExtensionContext. This inert value only satisfies Pi's tool interface in focused tests.
const unusedExtensionContext = Object.freeze({}) as ExtensionContext;

test("Kagi websearch sends an authenticated v1 request and returns normalized results", async () => {
  let capturedAuthorization: string | null = null;
  let capturedRequest: unknown;
  const fetchSearch = async (_input: string | URL, init: RequestInit): Promise<Response> => {
    capturedAuthorization = new Headers(init.headers).get("authorization");
    if (typeof init.body !== "string") {
      throw new Error("Expected Kagi test request body to be a string");
    }
    capturedRequest = JSON.parse(init.body);
    return Response.json({
      meta: { trace: "test-trace" },
      data: {
        search: [
          {
            title: "Kagi Search",
            url: "https://kagi.com/search",
            snippet: "A paid search engine.",
            time: "2026-08-28T12:00:00Z",
          },
        ],
      },
    });
  };

  const tool = createKagiWebSearchTool("test-token", { fetchSearch });
  const result = await tool.execute(
    "test-call",
    { query: "best search engine", maxResults: 3, depth: "deep" },
    undefined,
    undefined,
    unusedExtensionContext,
  );

  assert.equal(capturedAuthorization, "Bearer test-token");
  assert.deepEqual(capturedRequest, {
    query: "best search engine",
    workflow: "search",
    format: "json",
    limit: 3,
    safe_search: true,
  });
  assert.equal(result.details?.provider, "kagi");
  assert.equal(result.details?.resultCount, 1);
  assert.match(result.content[0]?.type === "text" ? result.content[0].text : "", /Kagi Search/);
  assert.match(result.content[0]?.type === "text" ? result.content[0].text : "", /https:\/\/kagi\.com\/search/);
});

test("Kagi websearch clamps result limits and ignores unsafe result URLs", async () => {
  let capturedLimit: number | undefined;
  const fetchSearch = async (_input: string | URL, init: RequestInit): Promise<Response> => {
    if (typeof init.body !== "string") {
      throw new Error("Expected Kagi test request body to be a string");
    }
    const body: unknown = JSON.parse(init.body);
    assert.ok(isRecord(body));
    capturedLimit = typeof body["limit"] === "number" ? body["limit"] : undefined;
    return Response.json({
      data: {
        search: [
          { title: "Unsafe", url: "javascript:alert(1)" },
          { title: "Safe", url: "https://example.com/result" },
        ],
      },
    });
  };

  const tool = createKagiWebSearchTool("test-token", { fetchSearch });
  const result = await tool.execute(
    "test-call",
    { query: "result", maxResults: 1_000 },
    undefined,
    undefined,
    unusedExtensionContext,
  );

  assert.equal(capturedLimit, 20);
  assert.equal(result.details?.resultCount, 1);
  assert.equal(result.details?.results[0]?.url, "https://example.com/result");
});

test("Kagi websearch reports depleted API credits without exposing its token", async () => {
  const secretToken = "must-not-appear";
  const fetchSearch = async (): Promise<Response> => new Response(null, { status: 402 });
  const tool = createKagiWebSearchTool(secretToken, { fetchSearch });

  await assert.rejects(
    tool.execute(
      "test-call",
      { query: "billing" },
      undefined,
      undefined,
      unusedExtensionContext,
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /credits exhausted/);
      assert.doesNotMatch(error.message, new RegExp(secretToken));
      return true;
    },
  );
});

test("Kagi websearch rejects malformed API responses", async () => {
  const fetchSearch = async (): Promise<Response> => Response.json({ data: [] });
  const tool = createKagiWebSearchTool("test-token", { fetchSearch });

  await assert.rejects(
    tool.execute(
      "test-call",
      { query: "malformed" },
      undefined,
      undefined,
      unusedExtensionContext,
    ),
    /Kagi web search returned an invalid response/,
  );
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
