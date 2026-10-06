#!/usr/bin/env bash
set -euo pipefail

HELPER=$(cd "$(dirname "$0")" && pwd)/new-worktree.sh
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/new-worktree-test.XXXXXX")
trap 'rm -rf "$TEST_ROOT"' EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

create_test_repository() {
  local repository_path=$1
  mkdir -p "$repository_path"
  git init -q -b main "$repository_path"
  git -C "$repository_path" config user.name "Worktree Helper Test"
  git -C "$repository_path" config user.email "worktree-helper-test@example.invalid"
  printf 'fixture\n' > "$repository_path/README.md"
  git -C "$repository_path" add README.md
  git -C "$repository_path" commit -q -m fixture
}

assert_external_worktree_path() {
  local home_path=$1
  local repository_path=$2
  local external_base=$3
  local expected_path=$4
  local branch=$5

  (
    cd "$repository_path"
    HOME="$home_path" \
      WORKTREE_EXTERNAL_VOLUME=/ \
      WORKTREE_EXTERNAL_BASE="$external_base" \
      "$HELPER" topic "$branch" main >/dev/null 2>&1
  )

  if [[ ! -d $expected_path ]]; then
    actual_git_file=$(find "$external_base" -type f -name .git -print -quit 2>/dev/null || true)
    actual_path=${actual_git_file%/.git}
    fail "expected target $expected_path, got ${actual_path:-no worktree}"
  fi
}

# A physical checkout reached through ~/checkout must retain its org/repo path.
symlink_home="$TEST_ROOT/symlink-home"
symlink_checkout="$TEST_ROOT/volume/checkout"
symlink_external_base="$TEST_ROOT/volume/worktrees"
mkdir -p "$symlink_home" "$symlink_checkout/tmgrask"
create_test_repository "$symlink_checkout/tmgrask/example"
ln -s "$symlink_checkout" "$symlink_home/checkout"
assert_external_worktree_path \
  "$symlink_home" \
  "$symlink_home/checkout/tmgrask/example" \
  "$symlink_external_base" \
  "$symlink_external_base/tmgrask/example/topic" \
  test/symlink-checkout

# A checkout physically stored below ~/checkout must retain the same layout.
direct_home="$TEST_ROOT/direct-home"
direct_external_base="$TEST_ROOT/direct-volume/worktrees"
create_test_repository "$direct_home/checkout/z-tasker/example"
assert_external_worktree_path \
  "$direct_home" \
  "$direct_home/checkout/z-tasker/example" \
  "$direct_external_base" \
  "$direct_external_base/z-tasker/example/topic" \
  test/direct-checkout

# Without an external volume, the worktree is created beside the primary checkout.
internal_home="$TEST_ROOT/internal-home"
create_test_repository "$internal_home/checkout/tmgrask/example"
(
  cd "$internal_home/checkout/tmgrask/example"
  HOME="$internal_home" WORKTREE_EXTERNAL_VOLUME='' \
    "$HELPER" topic test/internal-default main >/dev/null 2>&1
)
[[ -d "$internal_home/checkout/tmgrask/example-topic" ]] ||
  fail "expected internal target $internal_home/checkout/tmgrask/example-topic"

printf 'PASS: new-worktree target layout\n'
