import { StringEnum } from "@earendil-works/pi-ai";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";

const KAGI_SEARCH_ENDPOINT = "https://kagi.com/api/v1/search";
const KAGI_SEARCH_TIMEOUT_MS = 30_000;
const KAGI_RESPONSE_MAX_BYTES = 1024 * 1024;
const KAGI_SEARCH_RESULT_LIMIT = { minimum: 1, maximum: 20, default: 8 } as const;
const SEARCH_DEPTHS = ["auto", "fast", "deep"] as const;

const kagiWebSearchSchema = Type.Object({
  query: Type.String({ description: "Search query." }),
  maxResults: Type.Optional(
    Type.Number({
      description: "Maximum number of results to return, from 1 to 20.",
    }),
  ),
  depth: Type.Optional(
    StringEnum([...SEARCH_DEPTHS], {
      description: "Search depth compatibility setting. Kagi currently uses its standard search quality for every value.",
    }),
  ),
});

type SearchDepth = (typeof SEARCH_DEPTHS)[number];

type KagiSearchFetch = (input: string | URL, init: RequestInit) => Promise<Response>;

type Result<T, E> =
  | { readonly _tag: "ok"; readonly value: T }
  | { readonly _tag: "err"; readonly error: E };

interface KagiSearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet?: string;
  readonly publishedAt?: string;
}

interface KagiWebSearchDetails {
  readonly query: string;
  readonly depth: SearchDepth;
  readonly maxResults: number;
  readonly provider: "kagi";
  readonly resultCount: number;
  readonly results: readonly KagiSearchResult[];
  readonly truncated?: boolean;
  readonly fullOutputPath?: string;
}

interface KagiWebSearchOptions {
  readonly fetchSearch?: KagiSearchFetch;
  readonly endpoint?: string;
  readonly timeoutMs?: number;
}

type KagiSearchError =
  | { readonly _tag: "KagiSearchCancelled" }
  | { readonly _tag: "KagiSearchTimedOut"; readonly timeoutMs: number }
  | { readonly _tag: "KagiSearchRequestFailed"; readonly cause: unknown }
  | { readonly _tag: "KagiSearchRejected"; readonly status: number }
  | { readonly _tag: "KagiSearchResponseTooLarge"; readonly maximumBytes: number }
  | { readonly _tag: "KagiSearchResponseInvalid"; readonly cause?: unknown }
  | { readonly _tag: "KagiSearchOutputWriteFailed"; readonly cause: unknown };

class RedactedKagiApiToken {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  authorizationHeader(): string {
    return `Bearer ${this.#value}`;
  }

  toString(): string {
    return "[REDACTED KAGI API TOKEN]";
  }

  toJSON(): string {
    return this.toString();
  }
}

/** Create a Pi websearch tool backed by Kagi's paid v1 Search API. */
export function createKagiWebSearchTool(
  apiToken: string,
  options: KagiWebSearchOptions = {},
): ToolDefinition<typeof kagiWebSearchSchema, KagiWebSearchDetails> {
  const token = new RedactedKagiApiToken(apiToken);
  const fetchSearch = options.fetchSearch ?? fetch;
  const endpoint = options.endpoint ?? KAGI_SEARCH_ENDPOINT;
  const timeoutMs = options.timeoutMs ?? KAGI_SEARCH_TIMEOUT_MS;

  return {
    name: "websearch",
    label: "Kagi Web Search",
    description: "Search the public web with Kagi for current information and candidate URLs to inspect with webfetch.",
    promptSnippet: "Search the public web with Kagi for current information and relevant URLs",
    promptGuidelines: [
      "Use websearch when the user needs current public-web information or when the right URL is not yet known.",
      "After picking a promising result, use webfetch on that URL for deeper inspection.",
    ],
    parameters: kagiWebSearchSchema,

    async execute(_toolCallId, params, signal, onUpdate) {
      const query = params.query.trim();
      if (query.length === 0) {
        throw new Error("Kagi web search query cannot be empty");
      }

      const maxResults = clampSearchResultLimit(params.maxResults);
      const depth = params.depth ?? "auto";
      onUpdate?.({
        content: [{ type: "text", text: `Searching Kagi for ${JSON.stringify(query)}...` }],
        details: {
          query,
          depth,
          maxResults,
          provider: "kagi",
          resultCount: 0,
          results: [],
        },
      });

      const result = await searchKagiWeb(
        { query, maxResults },
        { endpoint, fetchSearch, signal, timeoutMs, token },
      );
      if (result._tag === "err") {
        throw renderKagiSearchError(result.error);
      }

      const output = formatKagiSearchResults(query, result.value);
      const projected = await projectKagiSearchOutput(output);
      if (projected._tag === "err") {
        throw renderKagiSearchError(projected.error);
      }

      return {
        content: [{ type: "text", text: projected.value.text }],
        details: {
          query,
          depth,
          maxResults,
          provider: "kagi",
          resultCount: result.value.length,
          results: result.value,
          ...(projected.value.truncated ? { truncated: true } : {}),
          ...(projected.value.fullOutputPath ? { fullOutputPath: projected.value.fullOutputPath } : {}),
        },
      };
    },

    renderCall(args, theme) {
      return new Text(
        `${theme.fg("toolTitle", theme.bold("websearch "))}${theme.fg("accent", JSON.stringify(args.query))}`,
        0,
        0,
      );
    },

    renderResult(result, renderOptions, theme) {
      if (renderOptions.isPartial) {
        return new Text(theme.fg("warning", "Searching Kagi..."), 0, 0);
      }
      return new Text(theme.fg("success", `✓ ${result.details?.resultCount ?? 0} results (kagi)`), 0, 0);
    },
  };
}

function clampSearchResultLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return KAGI_SEARCH_RESULT_LIMIT.default;
  }
  return Math.min(
    KAGI_SEARCH_RESULT_LIMIT.maximum,
    Math.max(KAGI_SEARCH_RESULT_LIMIT.minimum, Math.trunc(value)),
  );
}

async function searchKagiWeb(
  input: { readonly query: string; readonly maxResults: number },
  dependencies: {
    readonly endpoint: string;
    readonly fetchSearch: KagiSearchFetch;
    readonly signal: AbortSignal | undefined;
    readonly timeoutMs: number;
    readonly token: RedactedKagiApiToken;
  },
): Promise<Result<readonly KagiSearchResult[], KagiSearchError>> {
  const timeoutSignal = AbortSignal.timeout(dependencies.timeoutMs);
  const operationSignal = dependencies.signal
    ? AbortSignal.any([dependencies.signal, timeoutSignal])
    : timeoutSignal;

  let response: Response;
  try {
    response = await dependencies.fetchSearch(dependencies.endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: dependencies.token.authorizationHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: input.query,
        workflow: "search",
        format: "json",
        limit: input.maxResults,
        safe_search: true,
      }),
      signal: operationSignal,
    });
  } catch (cause: unknown) {
    if (dependencies.signal?.aborted) {
      return err({ _tag: "KagiSearchCancelled" });
    }
    if (timeoutSignal.aborted) {
      return err({ _tag: "KagiSearchTimedOut", timeoutMs: dependencies.timeoutMs });
    }
    return err({ _tag: "KagiSearchRequestFailed", cause });
  }

  if (!response.ok) {
    return err({ _tag: "KagiSearchRejected", status: response.status });
  }

  const body = await readBoundedResponseText(response, KAGI_RESPONSE_MAX_BYTES);
  if (body._tag === "err") {
    return body;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body.value);
  } catch (cause: unknown) {
    return err({ _tag: "KagiSearchResponseInvalid", cause });
  }
  return parseKagiSearchResponse(payload, input.maxResults);
}

async function readBoundedResponseText(
  response: Response,
  maximumBytes: number,
): Promise<Result<string, KagiSearchError>> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > maximumBytes) {
      return err({ _tag: "KagiSearchResponseTooLarge", maximumBytes });
    }
  }

  if (!response.body) {
    return err({ _tag: "KagiSearchResponseInvalid" });
  }

  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > maximumBytes) {
        await reader.cancel();
        return err({ _tag: "KagiSearchResponseTooLarge", maximumBytes });
      }
      chunks.push(chunk.value);
    }
  } catch (cause: unknown) {
    return err({ _tag: "KagiSearchRequestFailed", cause });
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return ok(new TextDecoder().decode(bytes));
}

function parseKagiSearchResponse(
  payload: unknown,
  maxResults: number,
): Result<readonly KagiSearchResult[], KagiSearchError> {
  if (!isRecord(payload)) {
    return err({ _tag: "KagiSearchResponseInvalid" });
  }
  const data = payload["data"];
  if (!isRecord(data) || !Array.isArray(data["search"])) {
    return err({ _tag: "KagiSearchResponseInvalid" });
  }

  const parsedResults: KagiSearchResult[] = [];
  for (const candidate of data["search"]) {
    const parsed = parseKagiSearchResult(candidate);
    if (parsed) {
      parsedResults.push(parsed);
    }
    if (parsedResults.length >= maxResults) {
      break;
    }
  }
  return ok(parsedResults);
}

function parseKagiSearchResult(candidate: unknown): KagiSearchResult | undefined {
  if (!isRecord(candidate)) {
    return undefined;
  }
  const title = candidate["title"];
  const rawUrl = candidate["url"];
  if (typeof title !== "string" || typeof rawUrl !== "string") {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return undefined;
  }

  const snippet = candidate["snippet"];
  const publishedAt = candidate["time"];
  return {
    title: title.trim() || rawUrl,
    url: url.toString(),
    ...(typeof snippet === "string" && snippet.trim() ? { snippet: snippet.trim() } : {}),
    ...(typeof publishedAt === "string" && publishedAt.trim()
      ? { publishedAt: publishedAt.trim() }
      : {}),
  };
}

function formatKagiSearchResults(query: string, results: readonly KagiSearchResult[]): string {
  if (results.length === 0) {
    return `Search results for: ${query}\n\nNo results found.`;
  }

  const lines = [`Search results for: ${query}`, ""];
  for (const [index, result] of results.entries()) {
    lines.push(`${index + 1}. ${result.title}`);
    lines.push(`   URL: ${result.url}`);
    if (result.publishedAt) {
      lines.push(`   Published: ${result.publishedAt}`);
    }
    if (result.snippet) {
      lines.push(`   Snippet: ${result.snippet}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

async function projectKagiSearchOutput(
  output: string,
): Promise<
  Result<
    { readonly text: string; readonly truncated: boolean; readonly fullOutputPath?: string },
    KagiSearchError
  >
> {
  const truncation = truncateHead(output, {
    maxBytes: DEFAULT_MAX_BYTES,
    maxLines: DEFAULT_MAX_LINES,
  });
  if (!truncation.truncated) {
    return ok({ text: truncation.content, truncated: false });
  }

  try {
    const outputDirectory = await mkdtemp(join(tmpdir(), "pi-kagi-websearch-"));
    await mkdir(outputDirectory, { recursive: true });
    const fullOutputPath = join(outputDirectory, "output.txt");
    await writeFile(fullOutputPath, output, { encoding: "utf8", mode: 0o600 });
    const text = `${truncation.content}\n\n[Output truncated: showing ${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}. Full output saved to: ${fullOutputPath}]`;
    return ok({ text, truncated: true, fullOutputPath });
  } catch (cause: unknown) {
    return err({ _tag: "KagiSearchOutputWriteFailed", cause });
  }
}

function renderKagiSearchError(error: KagiSearchError): Error {
  switch (error._tag) {
    case "KagiSearchCancelled":
      return new Error("Kagi web search cancelled");
    case "KagiSearchTimedOut":
      return new Error(`Kagi web search timed out after ${Math.ceil(error.timeoutMs / 1000)}s`);
    case "KagiSearchRequestFailed":
      return new Error("Kagi web search request failed");
    case "KagiSearchRejected":
      if (error.status === 401 || error.status === 403) {
        return new Error(`Kagi web search API token rejected (${error.status})`);
      }
      if (error.status === 402) {
        return new Error("Kagi web search API credits exhausted or billing unavailable (402)");
      }
      if (error.status === 429) {
        return new Error("Kagi web search rate limit exceeded (429)");
      }
      return new Error(`Kagi web search request rejected (${error.status})`);
    case "KagiSearchResponseTooLarge":
      return new Error(`Kagi web search response exceeded ${formatSize(error.maximumBytes)}`);
    case "KagiSearchResponseInvalid":
      return new Error("Kagi web search returned an invalid response");
    case "KagiSearchOutputWriteFailed":
      return new Error("Kagi web search failed to save truncated output");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ok<T>(value: T): Result<T, never> {
  return { _tag: "ok", value };
}

function err<E>(error: E): Result<never, E> {
  return { _tag: "err", error };
}
