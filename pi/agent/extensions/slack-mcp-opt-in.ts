import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const SLACK_MCP_APPROVAL_REQUEST_EVENT =
  "pi-mcp-adapter:tool-approval-request";
const SLACK_MCP_SERVER_NAME = "slack";
const SLACK_EXPLICIT_MENTION_PATTERN = /\bslack\b/i;

interface McpToolApprovalRequest {
  readonly serverName: string;
  claim(decide: () => Promise<"deny">): void;
}

/** Identifies MCP approval requests without trusting extension event data. */
function isMcpToolApprovalRequest(
  data: unknown,
): data is McpToolApprovalRequest {
  if (typeof data !== "object" || data === null) return false;

  const candidate = data as Partial<McpToolApprovalRequest>;
  return (
    typeof candidate.serverName === "string" &&
    typeof candidate.claim === "function"
  );
}

/** Keeps Slack MCP unavailable unless the current user request names Slack. */
export default function slackMcpOptIn(pi: ExtensionAPI) {
  let slackMcpAllowedForCurrentRun = false;

  pi.on("before_agent_start", (event) => {
    slackMcpAllowedForCurrentRun = SLACK_EXPLICIT_MENTION_PATTERN.test(
      event.prompt,
    );

    const policy = slackMcpAllowedForCurrentRun
      ? "The user explicitly mentioned Slack in this request, so Slack MCP may be used when relevant."
      : "Do not search or call Slack MCP: the user did not explicitly mention Slack in this request.";

    return {
      systemPrompt: `${event.systemPrompt}\n\nSlack MCP opt-in policy: ${policy}`,
    };
  });

  pi.events.on(SLACK_MCP_APPROVAL_REQUEST_EVENT, (data) => {
    if (slackMcpAllowedForCurrentRun) return;
    if (!isMcpToolApprovalRequest(data)) return;
    if (data.serverName !== SLACK_MCP_SERVER_NAME) return;

    data.claim(async () => "deny");
  });

  pi.on("agent_settled", () => {
    slackMcpAllowedForCurrentRun = false;
  });
}
