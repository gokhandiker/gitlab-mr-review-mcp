# GitLab MR Review MCP Server — Agent Instructions

## Overview

This is a local MCP server that provides 21 tools for interacting with GitLab Merge Requests. It authenticates via a Personal Access Token (PAT) with `api` scope, passed through the `GITLAB_TOKEN` environment variable.

## Available Tools

### Reading & Inspection

| Tool | Purpose |
|------|---------|
| `get_mr_info` | Metadata: title, author, branches, labels, conflicts |
| `get_mr_diffs` | Full diff content for all changed files |
| `get_mr_discussions` | All discussion threads with file/line positions |
| `get_mr_file_content` | Full source file from the MR's source branch |
| `get_mr_commits` | List of commits in the MR |
| `list_mr_pipelines` | CI/CD pipeline statuses |
| `get_pipeline_job_log` | Log output from a specific CI job (last 200 lines) |
| `list_open_mrs` | List open MRs in a project (filterable) |
| `compare_branches` | Diff between any two branches |
| `search_codebase` | Search for code patterns in the project (grep-style) |
| `get_file_blame` | Get git blame ranges for a file (optionally line range) |

### Writing & Actions

| Tool | Purpose |
|------|---------|
| `create_mr_comment` | Post a line-level review comment |
| `batch_create_comments` | Post multiple comments in one call |
| `create_mr_suggestion` | Post an applicable code suggestion (Apply button) |
| `reply_to_discussion` | Reply to an existing discussion thread |
| `resolve_discussion` | Resolve or unresolve a discussion |
| `approve_mr` | Approve the MR |
| `unapprove_mr` | Remove your approval |
| `add_mr_label` | Add labels to the MR |
| `update_mr` | Update MR title/description/target/reviewers/labels/milestone |
| `create_mr` | Create a new Merge Request in a project |

## Common Workflows

### Code Review
1. `get_mr_info` — understand the MR context
2. `get_mr_diffs` — read all changes
3. `get_mr_file_content` — get full file for surrounding context if needed
4. `batch_create_comments` — post all review findings at once
5. `approve_mr` or add labels based on review outcome

### Investigate CI Failure
1. `list_mr_pipelines` — find the failed pipeline
2. `get_pipeline_job_log` — read the failing job's log
3. `create_mr_comment` — comment with diagnosis/fix suggestion

### Apply Code Suggestions
Use `create_mr_suggestion` to post code changes that the MR author can apply with one click. The `suggestion` parameter should contain the replacement code for the target line.

### Batch Operations
Use `batch_create_comments` instead of calling `create_mr_comment` multiple times. It fetches diff versions only once and posts all comments sequentially.

## URL Format

All tools that accept `mr_url` expect a full GitLab MR URL:
```
https://gitlab.com/group/subgroup/project/-/merge_requests/123
```

Tools that accept `project_url` expect a project URL:
```
https://gitlab.com/group/subgroup/project
```

## Line Number Rules

- `new_line`: Line number in the **new** version of the file (for added or unchanged lines — lines starting with `+` or space in the diff)
- `old_line`: Line number in the **old** version of the file (for removed lines — lines starting with `-` in the diff)
- At least one must be provided. Use `new_line` for most comments.

## Error Handling

Tools return `isError: true` when:
- No diff versions exist (MR has no changes)
- Missing required line number
- GitLab API returns an error (auth, not found, etc.)

## Configuration

The server reads from environment variables:
- `GITLAB_TOKEN` — Personal Access Token with `api` scope (required)
- `GITLAB_URL` — GitLab instance URL (defaults to `https://gitlab.com`)
