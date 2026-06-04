# gitlab-mr-review-mcp

An MCP (Model Context Protocol) server that provides 17 tools for interacting with GitLab Merge Requests. Use it with VS Code Copilot, Claude Desktop, or any MCP-compatible client to review code, post comments, approve MRs, and inspect CI pipelines — all through natural language.

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

## Available Tools (17)

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

### Writing & Actions

| Tool | Description |
|------|-------------|
| `create_mr_comment` | Post a line-level review comment |
| `batch_create_comments` | Post multiple comments in one call |
| `create_mr_suggestion` | Post an applicable code suggestion (Apply button) |
| `reply_to_discussion` | Reply to an existing discussion thread |
| `resolve_discussion` | Resolve or unresolve a discussion |
| `approve_mr` | Approve the MR |
| `unapprove_mr` | Remove your approval |
| `add_mr_label` | Add labels to the MR |

## Usage Examples

Once configured, ask your AI assistant:

- *"Review the MR at https://gitlab.com/mygroup/project/-/merge_requests/42"*
- *"What's failing in the CI pipeline for this MR?"*
- *"Post a comment on line 15 of src/auth.ts suggesting we use a constant"*
- *"Approve the MR and add the 'reviewed' label"*
- *"List all open MRs in the project"*

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
