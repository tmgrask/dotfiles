# Primary checkout with sibling worktrees

## Create the primary checkout

Clone the repository normally into `~/checkout` and keep that checkout on the
default branch. `~/checkout` may be a directory or a symlink to another volume:

```bash
mkdir -p ~/checkout/<org>
git clone <url> ~/checkout/<org>/<repo>
git -C ~/checkout/<org>/<repo> switch main
```

When the primary remote is a fork, add the authoritative repository as
`upstream` and track its default branch explicitly when desired:

```bash
git -C ~/checkout/<org>/<repo> remote add upstream <upstream-url>
git -C ~/checkout/<org>/<repo> fetch --prune upstream
git -C ~/checkout/<org>/<repo> branch --set-upstream-to=upstream/main main
```

Create every additional checkout with `new-worktree.sh`. By default its path is:

```text
~/checkout/<org>/<repo>-<local-dir>
```

When `WORKTREE_EXTERNAL_VOLUME` is set, it is
`<external-base>/<org>/<repo>/<local-dir>` instead.

## Invariants

Run from the primary checkout:

```bash
git rev-parse --is-bare-repository
git rev-parse --show-toplevel
git rev-parse --path-format=absolute --git-common-dir
git worktree list --verbose
```

The primary checkout must be non-bare, its common directory must be the
resolved physical `<primary-checkout>/.git`, and every additional worktree must
be at one of the paths above.

## Migrate an existing repository

Before deleting or rearranging any checkout:

1. Inspect every registered worktree with `git worktree list --porcelain` and
   `git -C <path> status --short --branch`.
2. Inspect stashes and commits not reachable from remotes.
3. Create a verified `git bundle create <backup> --all` when any local refs may
   matter.
4. Preserve required untracked files separately.
5. Establish the normal primary checkout, then recreate clean topic worktrees
   with `new-worktree.sh`.
6. Remove old registrations and directories only after the new checkout and
   backup both verify.

## Stale registrations

Inspect before pruning:

```bash
git worktree prune --dry-run --verbose
```

Run `git worktree prune --verbose` only after every reported registration is
confirmed stale.

## Moved worktrees

After moving a registered worktree or its primary checkout, run:

```bash
git worktree repair
```

Then verify every path with `git worktree list --verbose` and
`git -C <path> status --short --branch`.
