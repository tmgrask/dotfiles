import type { Plugin } from "@opencode-ai/plugin"
import { execFile } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const reviewRoot = path.join(homedir(), ".local", "share", "opencode", "neovim-plan-review")

interface PlanReviewComment {
  id: string
  startLine: number
  endLine: number
  excerpt: string
  body: string
  threadSessionIDs: string[]
}

interface PlanReviewResult {
  decision: "approve" | "request_changes"
  comments: PlanReviewComment[]
}

async function waitForReviewResult(resultPath: string): Promise<PlanReviewResult> {
  for (;;) {
    try {
      return JSON.parse(await readFile(resultPath, "utf8")) as PlanReviewResult
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

function formatPlanReviewResult(result: PlanReviewResult): string {
  if (result.decision === "approve" && result.comments.length === 0) return "Plan approved."

  const heading = result.decision === "approve" ? "Plan approved with comments." : "Plan changes requested."
  const comments = result.comments.map((comment) => {
    const range = comment.startLine === comment.endLine
      ? `line ${comment.startLine}`
      : `lines ${comment.startLine}-${comment.endLine}`
    const discussions = comment.threadSessionIDs.length === 0
      ? ""
      : `\nRelated discussion: ${comment.threadSessionIDs.map((id) => `\`${id}\``).join(", ")} (transcript not included)`
    return `### ${comment.id} — ${range}\n\n> ${comment.excerpt.replaceAll("\n", "\n> ")}\n\n${comment.body}${discussions}`
  })
  return `${heading}\n\n${comments.join("\n\n")}`
}

async function openNeovimReview(input: {
  sessionID: string
  directory: string
  plan: string
}): Promise<PlanReviewResult> {
  const paneID = process.env.HERDR_PANE_ID
  if (process.env.HERDR_ENV !== "1" || !paneID) {
    throw new Error("Neovim plan review requires OpenCode to run in a Herdr pane")
  }

  const reviewDirectory = path.join(reviewRoot, `${input.sessionID}-${Date.now()}`)
  const planPath = path.join(reviewDirectory, "plan.md")
  const requestPath = path.join(reviewDirectory, "request.json")
  const resultPath = path.join(reviewDirectory, "result.json")
  await mkdir(reviewDirectory, { recursive: true })
  await writeFile(planPath, input.plan)
  await writeFile(requestPath, JSON.stringify({
    rootSessionID: input.sessionID,
    planPath,
    resultPath,
  }))

  const split = await execFileAsync("herdr", [
    "pane", "split", "--pane", paneID,
    "--direction", "right", "--ratio", "0.55",
    "--cwd", input.directory,
    "--env", `OPENCODE_PLAN_REVIEW_REQUEST=${requestPath}`,
    "--focus",
  ])
  const splitResponse = JSON.parse(split.stdout)
  const reviewPaneID = splitResponse?.result?.pane?.pane_id
  if (typeof reviewPaneID !== "string") throw new Error("Herdr did not return a review pane ID")

  await execFileAsync("herdr", [
    "pane", "run", reviewPaneID,
    `exec nvim -c 'lua require("tasker.plan_review").open(vim.env.OPENCODE_PLAN_REVIEW_REQUEST)'`,
  ])

  const result = await waitForReviewResult(resultPath)
  await execFileAsync("herdr", ["pane", "close", reviewPaneID]).catch(() => undefined)
  return result
}

const neovimPlanReviewPlugin = {
  id: "neovim-plan-review",
  async setup(ctx) {
    await ctx.session.hook("context", (event) => {
      if (event.agent !== "plan") return
      if (event.tools.plan_exit) {
        event.tools.plan_exit.description = "Do not use this tool. Call submit_plan to open the Neovim review instead."
      }
      event.system.push({
        type: "text",
        text: "When your plan is ready, call submit_plan with the complete Markdown plan. Do not begin implementation until the user approves it.",
      })
    })

    await ctx.tool.transform((editor) => {
      editor.add({
        name: "submit_plan",
        description: "Open the complete Markdown plan in Neovim for user review and wait for approval or comments.",
        input: {
          type: "object",
          properties: {
            plan: { type: "string", description: "The complete Markdown plan to review." },
          },
          required: ["plan"],
          additionalProperties: false,
        },
        options: { codemode: false },
        async execute(input, tool) {
          const plan = (input as { plan?: unknown }).plan
          if (typeof plan !== "string" || plan.trim() === "") return { content: "submit_plan requires a non-empty plan." }
          const session = await ctx.session.get({ sessionID: tool.sessionID })
          const result = await openNeovimReview({
            sessionID: tool.sessionID,
            directory: session.location.directory,
            plan,
          })
          if (result.decision === "approve") {
            await ctx.session.switchAgent({ sessionID: tool.sessionID, agent: "build" }).catch(() => undefined)
          }
          return { content: formatPlanReviewResult(result) }
        },
      })
    })
  },
} satisfies Plugin.Plugin

export default neovimPlanReviewPlugin
