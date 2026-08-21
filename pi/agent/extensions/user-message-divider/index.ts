import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const USER_MESSAGE_TOP_DIVIDER = "⟢-----------⟢";

/** Add a display-only divider above user-authored Markdown without changing model context. */
export function addUserMessageTopDivider(markdown: string): string {
  return markdown.trim().length === 0
    ? markdown
    : `${USER_MESSAGE_TOP_DIVIDER}\n\n${markdown}`;
}

/** Separate normal user messages from surrounding tool activity in Pi's transcript. */
export default function registerUserMessageDivider(pi: ExtensionAPI): void {
  pi.registerMarkdownTransformer((markdown, context) =>
    context.messageType === "user"
      ? addUserMessageTopDivider(markdown)
      : markdown,
  );
}
