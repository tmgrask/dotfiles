import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const CONTINUATION_PROMPT = `Compaction has completed. Use the compaction summary as the authoritative history; do not reread the session JSONL.

If the preceding task still has unfinished work, immediately continue with its next step. If the task was already completed, wait for the user without recapping or inventing more work.`;

/**
 * Automatically resumes work after every successful Pi compaction.
 *
 * The continuation is deferred by one event-loop turn so manual compaction can
 * finish reconnecting the agent runtime before a new prompt begins. During an
 * active automatic-compaction recovery, it is delivered as a follow-up.
 */
export default function continueAfterCompaction(pi: ExtensionAPI): void {
	const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

	pi.on("session_compact", () => {
		const timer = setTimeout(() => {
			pendingTimers.delete(timer);
			pi.sendUserMessage(CONTINUATION_PROMPT, { deliverAs: "followUp" });
		}, 0);

		pendingTimers.add(timer);
	});

	pi.on("session_shutdown", () => {
		for (const timer of pendingTimers) {
			clearTimeout(timer);
		}
		pendingTimers.clear();
	});
}
