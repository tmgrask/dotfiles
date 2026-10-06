#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: new-worktree.sh <local-dir> <branch> [base]

Create a linked worktree beside a normal primary checkout under ~/checkout:
  ~/checkout/<org>/<repo>/                 primary checkout (normally main)
  ~/checkout/<org>/<repo>-<local-dir>/     linked worktree

The command prints the physical worktree path on completion.

Branch selection:
  1. Reuse <branch> when it exists locally.
  2. Track WORKTREE_REMOTE/<branch> when it exists remotely.
  3. Create <branch> from [base].

The default remote is origin. The default base is the remote's default branch,
then main or master when either exists locally. Set WORKTREE_ROOT to the primary
checkout when root discovery is unavailable. Set WORKTREE_REMOTE to select
another remote.

Machines that keep worktrees on an external drive set WORKTREE_EXTERNAL_VOLUME
(for example in ~/.zshrc_private). The worktree is then created at
<base>/<org>/<repo>/<local-dir>, and the script fails if the volume is not
mounted:
  WORKTREE_EXTERNAL_VOLUME  mount point to require
  WORKTREE_EXTERNAL_BASE    base directory (default <volume>/Development/worktrees)
USAGE
}

if [[ ${1:-} == "-h" || ${1:-} == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 2 || $# -gt 3 ]]; then
  usage
  exit 2
fi

local_dir=$1
branch=$2
base=${3:-}

if [[ -z "$local_dir" || "$local_dir" == "." || "$local_dir" == ".." || "$local_dir" == */* ]]; then
  echo "new-worktree: local-dir must be one directory name: $local_dir" >&2
  exit 2
fi

if ! git check-ref-format --branch "$branch" >/dev/null 2>&1; then
  echo "new-worktree: invalid branch name: $branch" >&2
  exit 2
fi

if [[ -n ${WORKTREE_ROOT:-} ]]; then
  root=$WORKTREE_ROOT
else
  if ! common_dir=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null); then
    echo "new-worktree: run from a primary checkout or one of its linked worktrees" >&2
    exit 1
  fi
  if [[ ${common_dir##*/} != ".git" ]]; then
    echo "new-worktree: shared Git directory is not a primary checkout .git directory: $common_dir" >&2
    echo "new-worktree: set WORKTREE_ROOT or migrate the repository to the primary-checkout layout" >&2
    exit 1
  fi
  root=${common_dir%/.git}
fi

if ! root=$(cd "$root" 2>/dev/null && pwd -P); then
  echo "new-worktree: primary checkout does not exist: $root" >&2
  exit 1
fi
if [[ $(git -C "$root" rev-parse --is-bare-repository 2>/dev/null) != "false" ]]; then
  echo "new-worktree: primary checkout resolves to a bare repository: $root" >&2
  exit 1
fi
if [[ $(git -C "$root" rev-parse --show-toplevel 2>/dev/null) != "$root" ]]; then
  echo "new-worktree: WORKTREE_ROOT is not the primary checkout root: $root" >&2
  exit 1
fi

external_volume=${WORKTREE_EXTERNAL_VOLUME:-}

if [[ -z $external_volume ]]; then
  target=$(dirname "$root")/$(basename "$root")-$local_dir
else
  external_base=${WORKTREE_EXTERNAL_BASE:-$external_volume/Development/worktrees}
  if [[ $(df "$external_volume" 2>/dev/null | awk 'NR==2 {print $NF}') != "$external_volume" ]]; then
    echo "new-worktree: external worktree volume is not mounted: $external_volume" >&2
    echo "new-worktree: attach the drive, or run with WORKTREE_EXTERNAL_VOLUME= to create beside the primary checkout" >&2
    exit 1
  fi
  # Resolve both paths physically before deriving org/repo. This preserves the
  # logical ~/checkout layout when ~/checkout itself is a symlink to CORSAIR.
  checkout_root=$HOME/checkout
  if checkout_root=$(cd "$checkout_root" 2>/dev/null && pwd -P); then
    rel=${root#"$checkout_root"/}
  else
    rel=$root
  fi
  if [[ $rel == "$root" ]]; then
    rel=$(basename "$root")
  fi
  target=$external_base/$rel/$local_dir
  mkdir -p "$(dirname "$target")"
fi

if [[ -e $target || -L $target ]]; then
  echo "new-worktree: destination already exists: $target" >&2
  exit 1
fi

remote=${WORKTREE_REMOTE:-origin}
if git -C "$root" remote get-url "$remote" >/dev/null 2>&1; then
  echo "Fetching $remote..." >&2
  git -C "$root" fetch --prune "$remote"
  has_remote=true
else
  has_remote=false
  if [[ -n ${WORKTREE_REMOTE:-} ]]; then
    echo "new-worktree: remote does not exist: $remote" >&2
    exit 1
  fi
fi

if git -C "$root" show-ref --verify --quiet "refs/heads/$branch"; then
  echo "Adding existing local branch '$branch' at $target" >&2
  git -C "$root" worktree add -- "$target" "$branch"
elif [[ $has_remote == true ]] && git -C "$root" show-ref --verify --quiet "refs/remotes/$remote/$branch"; then
  echo "Creating tracking branch '$branch' from $remote/$branch at $target" >&2
  git -C "$root" worktree add --track -b "$branch" -- "$target" "$remote/$branch"
else
  if [[ -z "$base" && $has_remote == true ]]; then
    base=$(git -C "$root" symbolic-ref --quiet --short "refs/remotes/$remote/HEAD" 2>/dev/null || true)
  fi

  if [[ -z "$base" ]]; then
    if git -C "$root" show-ref --verify --quiet refs/heads/main; then
      base=main
    elif git -C "$root" show-ref --verify --quiet refs/heads/master; then
      base=master
    else
      echo "new-worktree: no default base found; pass [base] explicitly" >&2
      exit 1
    fi
  fi

  if ! git -C "$root" rev-parse --verify --quiet "$base^{commit}" >/dev/null; then
    echo "new-worktree: base does not resolve to a commit: $base" >&2
    exit 1
  fi

  echo "Creating branch '$branch' from $base at $target" >&2
  git -C "$root" worktree add --no-track -b "$branch" -- "$target" "$base"
fi

echo "$target"
echo >&2
git -C "$root" worktree list --verbose
