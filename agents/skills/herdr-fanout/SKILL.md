---
name: herdr-fanout
description: Fan work out to parallel Herdr-managed pi sub-agents in git worktrees, each driven by a written brief and returning a report file. Use for large multi-chunk implementation or review tasks that decompose into independent workstreams, or when the user says "spawn subagents", "fan out", or "delegate chunks". Requires HERDR_ENV=1.
---

# Herdr fan-out

Decompose a large task into independent chunks, run each chunk in its own pi
sub-agent inside its own git worktree, then integrate the results. Requires the
`herdr` skill's basics (read it if unfamiliar) and `test "${HERDR_ENV:-}" = 1`.

## When to use (and not)

Use when chunks are **file-disjoint** (different directories/modules) and each
chunk is completable from a written brief without mid-flight coordination.
Don't use for work with tight sequential coupling (e.g. history rewriting) —
do that yourself while agents run the parallel chunks.

## Model selection

Default sub-agents to the caller's own model so quality is uniform:

```bash
MODEL="${SUBAGENT_MODEL:-$PI_PROVIDER/$PI_MODEL:high}"
```

Honor an explicit user request ("use fable", "use gpt-X for the subagents") by
setting the `--model` argument accordingly; the `provider/id:<thinking>` suffix
sets the reasoning level. Never silently downgrade: if the user complained
about a weak model once, treat the caller's model as the floor.

## The loop

### 1. Write one brief file per chunk

A file (e.g. `.scratch/chunkB-<topic>-prompt.md`), not an inline prompt. The
briefs that work contain, in order:

- **Context**: one paragraph on the larger effort and where this chunk fits.
- **Anchor**: "Work exclusively in your worktree (current directory), commit on
  your current branch (`chunk/<name>`). Complete the work directly; do not
  spawn sub-agents."
- **The golden rule**: name the in-repo reference implementation to mirror
  ("match the existing server patterns exactly") and list the exact files to
  read first, in full.
- **Deliverables**: numbered, concrete, with file paths.
- **Constraints**: an explicit do-NOT-touch list naming the directories other
  chunks own; required project validation commands; commit granularity and
  message expectations.
- **Escape hatch**: "if you find a genuine bug in an off-limits module, STOP
  that path and document it prominently in the report instead of fixing it."
- **Report contract**: "Write a summary of decisions/omissions/uncertainties to
  /tmp/chunk<X>-report.md and reply only with that path." Reports are how
  cross-chunk coordination points surface — require them.

### 2. One worktree + branch per chunk

```bash
git worktree add /tmp/project-chunkB -b chunk/bundle <base-sha>
```

All chunks branch from the same base. Never point two agents at the same tree.

### 3. Spawn one named tab per agent

Create each throwaway agent in a dedicated, task-named tab in the caller's
workspace. Record both tab and root-pane IDs from each response; the tab IDs
are required for cleanup.

```bash
herdr tab create --workspace "$HERDR_WORKSPACE_ID" --cwd /tmp/project-chunkB --label bundle --no-focus   # -> tab + root pane
herdr tab create --workspace "$HERDR_WORKSPACE_ID" --cwd /tmp/project-chunkC --label plumbing --no-focus # -> tab + root pane
herdr agent start bundle   --kind pi --pane <bundle-root-pane-id> -- --model "$MODEL"
herdr agent start plumbing --kind pi --pane <plumbing-root-pane-id> -- --model "$MODEL"
```

Give tabs and agents the same task-named identity (`bundle`, `plumbing`,
`spec`, `standards`). Dedicated tabs make parallel work visible without
crowding the caller's layout and make completed agents safe to clean up. If
`agent start` returns `agent_pane_busy` right after tab creation, sleep a few
seconds and retry. To restart an agent on a different model: two rounds of
`herdr agent send-keys <name> ctrl+c ctrl+c`, confirm the pane returned to a
shell, then `agent start` again.

### 4. Prompt with a pointer, not a payload

```bash
herdr agent prompt bundle "Read /abs/path/.scratch/chunkB-prompt.md and carry out the brief exactly. Your worktree is /tmp/project-chunkB (already on branch chunk/bundle)." >/dev/null
```

For a follow-up task to an idle agent, say which worktree to `cd` into and that
prior worktrees are gone.

### 5. Work while they work

Do the sequential chunk (history surgery, integration prep) in the main
checkout. Poll cheaply or block:

```bash
herdr agent get bundle | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['agent']['agent_status'])"
herdr agent wait bundle --timeout 3600000
```

### 6. Read the report before the diff

Read `/tmp/chunk<X>-report.md` first — good agents surface cross-chunk
coordination points ("chunk C must set X to match"), deliberate deviations, and
bugs found in off-limits modules. Reconcile the coordination points *yourself*
at integration; that seam is where the bugs live (configuration mismatches,
name contracts between chunks).

### 7. Integrate

Cherry-pick each chunk's commits onto the integration branch (disjoint files
pick cleanly), apply the cross-chunk alignment fixes as `git commit --fixup`
into the owning commits, autosquash, and revalidate per-commit.

### 8. Close accepted agents and remove worktrees

Once a chunk's report and output are satisfactory, its commits are preserved
or integrated, and no immediate follow-up is needed, close the dedicated tab
that the caller created. Closing the tab terminates the throwaway agent and
reclaims UI space. Do not retain accepted idle agents "just in case."

```bash
herdr tab close <bundle-tab-id>
git worktree remove /tmp/project-chunkB --force
git branch -D chunk/bundle
```

Before closing, verify the report was read and any required commit exists.
Keep a tab open only while its result is unresolved or a concrete follow-up is
imminent. Never close a pre-existing tab or pane that this fan-out did not
create.

## Iterating

When a chunk's report exposes blockers that were out of its scope, fix them
yourself. If the follow-up is immediate, reuse the still-open agent with a
fresh worktree from the updated branch and a brief that lists what changed
("blockers 1–3 are now fixed: …") and the new goal. If its accepted tab was
already cleaned up, create a new named tab and agent instead.
