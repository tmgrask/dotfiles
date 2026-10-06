---
name: worktrees
description: Manage Git worktrees beside a normal primary checkout under ~/checkout. Use when creating, reusing, listing, removing, or repairing worktrees, or when migrating a repository to this layout.
---

# Git worktrees

Keep the repository's normal primary checkout under `~/checkout` and create
additional worktrees beside it:

```text
~/checkout/<org>/<repo>/            # normal primary checkout, normally main
~/checkout/<org>/<repo>-<topic>/    # linked topic worktree
```

The primary checkout owns the shared `.git` directory. A machine may instead
keep linked worktrees on an external drive by setting
`WORKTREE_EXTERNAL_VOLUME` (see `scripts/new-worktree.sh --help`).

## Create or reuse a worktree

1. From the primary checkout or any linked worktree, run
   [`scripts/new-worktree.sh`](scripts/new-worktree.sh):

   ```bash
   scripts/new-worktree.sh <local-dir> <branch> [base]
   ```

2. Set `WORKTREE_REMOTE` when the desired branch is not on `origin`:

   ```bash
   WORKTREE_REMOTE=upstream scripts/new-worktree.sh db-v2 db-v2
   ```

3. Change to the physical path printed by the script and verify it:

   ```bash
   git status --short --branch
   ```

The helper fetches and prunes, reuses an existing local branch, tracks a
matching remote branch, or creates a new branch from `[base]`.

## List worktrees

Run this from any checkout:

```bash
git worktree list --verbose
```

## Remove a worktree

1. Account for every staged, unstaged, and untracked change:

   ```bash
   git -C <worktree-path> status --short --branch
   ```

2. Remove the checkout through Git:

   ```bash
   git -C <primary-checkout> worktree remove <worktree-path>
   ```

3. Delete the local branch only when its commits are integrated or intentionally
   discarded:

   ```bash
   git -C <primary-checkout> branch -d <branch>
   ```

Removal is complete when the path is absent from both the filesystem and
`git worktree list`.

## Setup and recovery

Read [`references/primary-checkout.md`](references/primary-checkout.md) when
migrating a repository, validating layout invariants, cleaning stale
registrations, or repairing moved worktrees.
