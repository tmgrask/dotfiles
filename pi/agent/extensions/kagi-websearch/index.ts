import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createWebFetchTool } from "pi-web-tools/webfetch.ts";
import { createWebSearchTool } from "pi-web-tools/websearch.ts";
import { createKagiWebSearchTool } from "./kagi-websearch.ts";

const KAGI_API_TOKEN_FILE = join(homedir(), ".config", "kagi", "api-token");

export default function kagiWebToolsExtension(pi: ExtensionAPI): void {
  pi.registerTool(createWebFetchTool());

  const kagiApiToken = readKagiApiToken();
  if (kagiApiToken) {
    pi.registerTool(createKagiWebSearchTool(kagiApiToken));
  } else {
    pi.registerTool(createWebSearchTool());
  }
}

function readKagiApiToken(): string | undefined {
  const environmentToken = process.env["KAGI_API_TOKEN"]?.trim();
  if (environmentToken) {
    return environmentToken;
  }

  try {
    const fileToken = readFileSync(KAGI_API_TOKEN_FILE, "utf8").trim();
    return fileToken || undefined;
  } catch {
    return undefined;
  }
}
