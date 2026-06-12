#!/usr/bin/env bash
#
# Installs the GitLab Reviewer custom agent into your VS Code user profile,
# so @gitlab-reviewer is available in every workspace (not just this repo).
#
# Usage (one-liner):
#   curl -fsSL https://raw.githubusercontent.com/gokhandiker/gitlab-mr-review-mcp/main/scripts/install-agent.sh | bash
#
# Or, after cloning the repo:
#   bash scripts/install-agent.sh
#
# Options (env vars):
#   INSIDERS=1   Install into VS Code - Insiders instead of stable.

set -euo pipefail

AGENT_FILE="gitlab-reviewer.agent.md"
RAW_URL="https://raw.githubusercontent.com/gokhandiker/gitlab-mr-review-mcp/main/.github/agents/${AGENT_FILE}"

# --- Resolve the VS Code User directory for this OS -------------------------
app_dir="Code"
if [[ "${INSIDERS:-0}" == "1" ]]; then
  app_dir="Code - Insiders"
fi

case "$(uname -s)" in
  Darwin)
    user_dir="$HOME/Library/Application Support/${app_dir}/User"
    ;;
  Linux)
    user_dir="${XDG_CONFIG_HOME:-$HOME/.config}/${app_dir}/User"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    user_dir="${APPDATA:-$HOME/AppData/Roaming}/${app_dir}/User"
    ;;
  *)
    echo "Unsupported OS: $(uname -s)" >&2
    echo "Manually copy ${AGENT_FILE} into your VS Code 'User/prompts' folder." >&2
    exit 1
    ;;
esac

dest_dir="${user_dir}/prompts"
dest_file="${dest_dir}/${AGENT_FILE}"

mkdir -p "$dest_dir"

# --- Fetch the agent file ----------------------------------------------------
# Prefer a local copy (when run from a clone); otherwise download from GitHub.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" >/dev/null 2>&1 && pwd)"
local_copy="${script_dir}/../.github/agents/${AGENT_FILE}"

if [[ -f "$local_copy" ]]; then
  cp "$local_copy" "$dest_file"
  echo "Copied local agent file."
elif command -v curl >/dev/null 2>&1; then
  curl -fsSL "$RAW_URL" -o "$dest_file"
  echo "Downloaded agent file from GitHub."
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$dest_file" "$RAW_URL"
  echo "Downloaded agent file from GitHub."
else
  echo "Neither curl nor wget found, and no local copy available." >&2
  exit 1
fi

echo ""
echo "✓ GitLab Reviewer agent installed:"
echo "  $dest_file"
echo ""
echo "Next steps:"
echo "  1. Make sure the 'gitlab-mr-review' MCP server is configured"
echo "     (MCP: Open User Configuration → add the server from the README)."
echo "  2. Reload VS Code (Developer: Reload Window)."
echo "  3. In Chat, pick 'GitLab Reviewer' from the agent selector and paste an MR URL."
