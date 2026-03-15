#!/usr/bin/env bash
set -euo pipefail

OPENCLAW_ROOT="${1:-${OPENCLAW_ROOT:-}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH_FILES=(
  "$SCRIPT_DIR/../patches/hiveping-openclaw-message-sending-common.patch"
  "$SCRIPT_DIR/../patches/hiveping-openclaw-reply-delivery.patch"
  "$SCRIPT_DIR/../patches/hiveping-openclaw-slack-replies-message-hook.patch"
  "$SCRIPT_DIR/../patches/hiveping-openclaw-message-hook-mention-metadata.patch"
)

if [[ -z "$OPENCLAW_ROOT" ]]; then
  echo "Usage: $0 /path/to/openclaw-repo" >&2
  echo "Or set OPENCLAW_ROOT=/path/to/openclaw-repo" >&2
  exit 1
fi

if [[ ! -d "$OPENCLAW_ROOT/.git" ]]; then
  echo "Error: not a git repo: $OPENCLAW_ROOT" >&2
  exit 1
fi

echo "Target repo: $OPENCLAW_ROOT"

for patch_file in "${PATCH_FILES[@]}"; do
  if [[ ! -f "$patch_file" ]]; then
    echo "Error: patch file not found: $patch_file" >&2
    exit 1
  fi

  echo "Checking patch: $patch_file"
  if git -C "$OPENCLAW_ROOT" apply --check "$patch_file" >/dev/null 2>&1; then
    echo "Applying patch: $patch_file"
    git -C "$OPENCLAW_ROOT" apply --3way "$patch_file"
    continue
  fi

  if git -C "$OPENCLAW_ROOT" apply --reverse --check "$patch_file" >/dev/null 2>&1; then
    echo "Patch already applied: $patch_file"
    continue
  fi

  echo "Error: patch cannot be applied cleanly: $patch_file" >&2
  exit 1
done

echo "All patches applied successfully."
