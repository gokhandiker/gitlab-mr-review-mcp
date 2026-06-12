# gitlab-mr-review-mcp

An MCP (Model Context Protocol) server that provides 21 tools for interacting with GitLab Merge Requests. Use it with VS Code Copilot, Claude Desktop, or any MCP-compatible client to review code, post comments, approve MRs, inspect CI pipelines, and manage MR metadata — all through natural language.

## Features

- **Read** MR metadata, diffs, discussions, file content, commits, pipelines
- **Write** line-level comments, code suggestions (with Apply button), replies
- **Actions** approve/unapprove, add labels, resolve discussions
- **Batch** post multiple review comments in a single call
- **CI/CD** inspect pipeline status and read job logs

## Installation

### Option 1: Install from GitHub (npx)

```bash
npx github:gokhandiker/gitlab-mr-review-mcp
```

### Option 2: Clone and build locally

```bash
git clone https://github.com/gokhandiker/gitlab-mr-review-mcp.git
cd gitlab-mr-review-mcp
npm install
npm run build
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITLAB_TOKEN` | Yes | — | Personal Access Token with `api` scope |
| `GITLAB_URL` | No | `https://gitlab.com` | GitLab instance URL |

### VS Code Copilot (settings.json)

```json
{
  "mcp": {
    "servers": {
      "gitlab-mr-review": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "github:gokhandiker/gitlab-mr-review-mcp"],
        "env": {
          "GITLAB_TOKEN": "${input:gitlabToken}",
          "GITLAB_URL": "${input:gitlabUrl}"
        }
      }
    }
  }
}
```

Or if you cloned locally:

```json
{
  "mcp": {
    "servers": {
      "gitlab-mr-review": {
        "type": "stdio",
        "command": "node",
        "args": ["/path/to/gitlab-mr-review-mcp/build/index.js"],
        "env": {
          "GITLAB_TOKEN": "${input:gitlabToken}",
          "GITLAB_URL": "${input:gitlabUrl}"
        }
      }
    }
  }
}
```

### Claude Desktop (claude_desktop_config.json)

```json
{
  "mcpServers": {
    "gitlab-mr-review": {
      "command": "npx",
      "args": ["-y", "github:gokhandiker/gitlab-mr-review-mcp"],
      "env": {
        "GITLAB_TOKEN": "your-gitlab-pat-here",
        "GITLAB_URL": "https://gitlab.com"
      }
    }
  }
}
```

## Available Tools (21)

### Reading & Inspection

| Tool | Description |
|------|-------------|
| `get_mr_info` | MR metadata (title, author, branches, labels, conflicts) |
| `get_mr_diffs` | Full diff content for all changed files |
| `get_mr_discussions` | All discussion threads with file/line positions |
| `get_mr_file_content` | Full source file from the MR's source branch |
| `get_mr_commits` | List of commits in the MR |
| `list_mr_pipelines` | CI/CD pipeline statuses |
| `get_pipeline_job_log` | Log output from a specific CI job (last 200 lines) |
| `list_open_mrs` | List open MRs in a project (filterable by author/labels) |
| `compare_branches` | Diff between any two branches |
| `search_codebase` | Search for code patterns in the project (grep-style) |
| `get_file_blame` | Get git blame ranges for a file (optionally line range) |

### Writing & Actions

| Tool | Description |
|------|-------------|
| `create_mr_comment` | Post a line-level review comment |
| `batch_create_comments` | Post multiple comments in one call |
| `create_mr_suggestion` | Post an applicable code suggestion (Apply button) |
| `reply_to_discussion` | Reply to an existing discussion thread |
| `resolve_discussion` | Resolve or unresolve a discussion |
| `delete_mr_comment` | Delete a comment/note by its note_id |
| `approve_mr` | Approve the MR |
| `unapprove_mr` | Remove your approval |
| `add_mr_label` | Add labels to the MR |
| `update_mr` | Update MR title/description/target/reviewers/labels/milestone |
| `create_mr` | Create a new Merge Request |

## Usage Examples

Once configured, ask your AI assistant:

- *"Review the MR at https://gitlab.com/mygroup/project/-/merge_requests/42"*
- *"What's failing in the CI pipeline for this MR?"*
- *"Post a comment on line 15 of src/auth.ts suggesting we use a constant"*
- *"Approve the MR and add the 'reviewed' label"*
- *"List all open MRs in the project"*

## Custom Review Agent (`@gitlab-reviewer`)

This repo ships a custom VS Code Copilot agent at [.github/agents/gitlab-reviewer.agent.md](.github/agents/gitlab-reviewer.agent.md) so the whole team reviews MRs to the same standard.

### Install the agent globally (one-liner)

The agent lives in this repo's `.github/agents/`, so it only shows up when **this** repo is open. To use `GitLab Reviewer` in **any** workspace, install it into your VS Code user profile:

```bash
curl -fsSL https://raw.githubusercontent.com/gokhandiker/gitlab-mr-review-mcp/main/scripts/install-agent.sh | bash
```

This copies the agent into your VS Code `User/prompts` folder (works on macOS, Linux, and Windows via Git Bash). For VS Code Insiders, prefix with `INSIDERS=1`. After installing, reload VS Code.

> The agent calls tools from the `gitlab-mr-review` MCP server, so make sure that server is configured first (see [Configuration](#configuration)). The server ID **must** be `gitlab-mr-review` to match the agent.

### Usage

In VS Code Chat, pick **GitLab Reviewer** from the agent selector (or type `@`) and paste an MR URL:

```
@gitlab-reviewer Review https://gitlab.com/group/project/-/merge_requests/123
```

The agent:
- Reads the MR info, diffs, and full file context as needed.
- Reviews against a fixed checklist: **Security · Performance · Correctness · Maintainability · Testing**.
- Posts severity-tagged line comments (🔴 Critical / 🟡 Warning / 🔵 Suggestion / ⚪ Nitpick) in a single batch.
- Offers one-click code suggestions where applicable.
- Approves only when there are no Critical findings.

It is restricted to read + comment/approve tools — it never creates or edits merge requests.

## URL Format

Tools that accept `mr_url` expect a full GitLab MR URL:
```
https://gitlab.com/group/subgroup/project/-/merge_requests/123
```

Tools that accept `project_url` expect a project URL:
```
https://gitlab.com/group/subgroup/project
```

## Development

```bash
npm install
npm run build
npm test
npm run test:watch  # watch mode
```

## License

MIT
