#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  parseMrUrl,
  parseProjectUrl,
  getMergeRequest,
  getMRDiffs,
  getMRDiscussions,
  getMRVersions,
  getMRCommits,
  createDiffNote,
  replyToDiscussion,
  resolveDiscussion,
  approveMR,
  unapproveMR,
  addMRLabels,
  updateMR,
  getFileContent,
  getFileBlame,
  getMRPipelines,
  getPipelineJobs,
  getJobLog,
  listOpenMRs,
  compareBranches,
  searchProjectCode,
} from "./gitlab-client.js";

const server = new McpServer({
  name: "gitlab-mr-review",
  version: "2.1.0",
});

/** Normalize escaped newlines/tabs from agent output to real characters */
function normalizeText(text: string): string {
  return text.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

// ─── Tool 1: Get MR Info ──────────────────────────────────────────────────────

server.tool(
  "get_mr_info",
  "Get metadata about a GitLab Merge Request (title, description, author, state, branches, labels, conflicts)",
  {
    mr_url: z.string().url().describe("Full GitLab MR URL, e.g. https://gitlab.com/group/project/-/merge_requests/123"),
  },
  async ({ mr_url }) => {
    const { projectPath, mrIid } = parseMrUrl(mr_url);
    const mr = await getMergeRequest(projectPath, mrIid);

    const info = [
      `**${mr.title}** (${mr.state}${mr.draft ? ", draft" : ""})`,
      ``,
      `- **Author:** ${mr.author.name} (@${mr.author.username})`,
      `- **Source:** \`${mr.source_branch}\` → **Target:** \`${mr.target_branch}\``,
      `- **Labels:** ${mr.labels.length > 0 ? mr.labels.join(", ") : "none"}`,
      `- **Merge status:** ${mr.merge_status}${mr.has_conflicts ? " ⚠️ HAS CONFLICTS" : ""}`,
      `- **Created:** ${mr.created_at}`,
      `- **Updated:** ${mr.updated_at}`,
      `- **URL:** ${mr.web_url}`,
      ``,
      `### Description`,
      mr.description || "_No description_",
    ].join("\n");

    return { content: [{ type: "text", text: info }] };
  }
);

// ─── Tool 2: Get MR Diffs ────────────────────────────────────────────────────

server.tool(
  "get_mr_diffs",
  "Get all file diffs/changes in a GitLab Merge Request. Returns the full diff content for each changed file.",
  {
    mr_url: z.string().url().describe("Full GitLab MR URL"),
  },
  async ({ mr_url }) => {
    const { projectPath, mrIid } = parseMrUrl(mr_url);
    const diffs = await getMRDiffs(projectPath, mrIid);

    const output = diffs.map((file) => {
      const status = file.new_file
        ? "[NEW]"
        : file.deleted_file
        ? "[DELETED]"
        : file.renamed_file
        ? `[RENAMED from ${file.old_path}]`
        : "[MODIFIED]";

      return `## ${status} ${file.new_path}\n\n\`\`\`diff\n${file.diff}\n\`\`\``;
    });

    return {
      content: [{ type: "text", text: `# MR Diffs (${diffs.length} files changed)\n\n${output.join("\n\n---\n\n")}` }],
    };
  }
);

// ─── Tool 3: Get MR Discussions ──────────────────────────────────────────────

server.tool(
  "get_mr_discussions",
  "Get all discussions and comments on a GitLab Merge Request, including line-level comments with file and line information",
  {
    mr_url: z.string().url().describe("Full GitLab MR URL"),
  },
  async ({ mr_url }) => {
    const { projectPath, mrIid } = parseMrUrl(mr_url);
    const discussions = await getMRDiscussions(projectPath, mrIid);

    if (discussions.length === 0) {
      return { content: [{ type: "text", text: "No discussions found on this MR." }] };
    }

    const output = discussions.map((discussion) => {
      const notes = discussion.notes.map((note) => {
        let location = "";
        if (note.position) {
          const file = note.position.new_path || note.position.old_path || "unknown";
          const line = note.position.new_line || note.position.old_line || "?";
          location = ` 📍 \`${file}:${line}\``;
        }

        const resolved = note.resolved ? " ✅ resolved" : note.resolvable ? " ⏳ unresolved" : "";
        return `- **${note.author.name}** (@${note.author.username}) _${note.created_at}_${location}${resolved}\n  > ${note.body.replace(/\n/g, "\n  > ")}`;
      });

      return `**Discussion ${discussion.id}**\n${notes.join("\n\n")}`;
    });

    return {
      content: [{ type: "text", text: `# MR Discussions (${discussions.length} threads)\n\n${output.join("\n\n---\n\n")}` }],
    };
  }
);

// ─── Tool 4: Create MR Comment ───────────────────────────────────────────────

server.tool(
  "create_mr_comment",
  "Create a line-level review comment on a specific file and line in a GitLab Merge Request diff. Use new_line for added/unchanged lines, old_line for removed lines.",
  {
    mr_url: z.string().url().describe("Full GitLab MR URL"),
    file_path: z.string().describe("Path of the file to comment on (as shown in the diff)"),
    new_line: z.number().optional().describe("Line number in the new version of the file (for added or unchanged lines)"),
    old_line: z.number().optional().describe("Line number in the old version of the file (for removed lines)"),
    comment: z.string().describe("The review comment text (supports Markdown)"),
  },
  async ({ mr_url, file_path, new_line, old_line, comment }) => {
    if (!new_line && !old_line) {
      return { content: [{ type: "text", text: "Error: At least one of new_line or old_line must be provided." }], isError: true };
    }

    const normalizedComment = normalizeText(comment);
    const { projectPath, mrIid } = parseMrUrl(mr_url);

    const versions = await getMRVersions(projectPath, mrIid);
    if (versions.length === 0) {
      return { content: [{ type: "text", text: "Error: No diff versions found for this MR." }], isError: true };
    }

    const v = versions[0];
    const position: any = {
      position_type: "text",
      base_sha: v.base_commit_sha,
      head_sha: v.head_commit_sha,
      start_sha: v.start_commit_sha,
      old_path: file_path,
      new_path: file_path,
    };
    if (new_line) position.new_line = new_line;
    if (old_line) position.old_line = old_line;

    await createDiffNote(projectPath, mrIid, normalizedComment, position);

    return { content: [{ type: "text", text: `✅ Comment posted on \`${file_path}\` line ${new_line || old_line}` }] };
  }
);

// ─── Tool 5: Get MR File Content ─────────────────────────────────────────────

server.tool(
  "get_mr_file_content",
  "Get the full content of a file from the MR source branch. Useful for understanding full context around changed lines.",
  {
    mr_url: z.string().url().describe("Full GitLab MR URL"),
    file_path: z.string().describe("Path of the file to retrieve"),
  },
  async ({ mr_url, file_path }) => {
    const { projectPath, mrIid } = parseMrUrl(mr_url);
    const mr = await getMergeRequest(projectPath, mrIid);
    const file = await getFileContent(projectPath, file_path, mr.source_branch);

    const decoded = Buffer.from(file.content, "base64").toString("utf-8");
    return { content: [{ type: "text", text: `# ${file.file_path} (${mr.source_branch})\n\n\`\`\`\n${decoded}\n\`\`\`` }] };
  }
);

// ─── Tool 6: Resolve Discussion ──────────────────────────────────────────────

server.tool(
  "update_mr",
  "Update Merge Request metadata such as title, description, target branch, assignees, reviewers, labels, milestone, and squash preference.",
  {
    mr_url: z.string().url().describe("Full GitLab MR URL"),
    title: z.string().optional().describe("New MR title"),
    description: z.string().optional().describe("New MR description"),
    target_branch: z.string().optional().describe("New target branch"),
    assignee_ids: z.array(z.number()).optional().describe("User IDs to set as assignees"),
    reviewer_ids: z.array(z.number()).optional().describe("User IDs to set as reviewers"),
    labels: z.array(z.string()).optional().describe("Replace labels with this exact set"),
    add_labels: z.array(z.string()).optional().describe("Add labels without replacing existing labels"),
    remove_labels: z.array(z.string()).optional().describe("Remove labels from MR"),
    milestone_id: z.number().optional().describe("Milestone ID"),
    squash: z.boolean().optional().describe("Set squash option for merge"),
  },
  async ({ mr_url, title, description, target_branch, assignee_ids, reviewer_ids, labels, add_labels, remove_labels, milestone_id, squash }) => {
    const hasUpdate = [title, description, target_branch, assignee_ids, reviewer_ids, labels, add_labels, remove_labels, milestone_id, squash]
      .some((v) => v !== undefined);

    if (!hasUpdate) {
      return { content: [{ type: "text", text: "Error: Provide at least one field to update." }], isError: true };
    }

    const { projectPath, mrIid } = parseMrUrl(mr_url);
    const payload: any = {
      title,
      description,
      target_branch,
      assignee_ids,
      reviewer_ids,
      milestone_id,
      squash,
    };
    if (labels) payload.labels = labels.join(",");
    if (add_labels) payload.add_labels = add_labels.join(",");
    if (remove_labels) payload.remove_labels = remove_labels.join(",");

    const updated = await updateMR(projectPath, mrIid, payload);
    return {
      content: [{
        type: "text",
        text: `✅ MR updated: **${updated.title}**\n\n- Target: \`${updated.target_branch}\`\n- Labels: ${updated.labels.length > 0 ? updated.labels.join(", ") : "none"}`,
      }],
    };
  }
);

// ─── Tool 7: Resolve Discussion ──────────────────────────────────────────────

server.tool(
  "resolve_discussion",
  "Resolve or unresolve a discussion thread on a GitLab Merge Request",
  {
    mr_url: z.string().url().describe("Full GitLab MR URL"),
    discussion_id: z.string().describe("The discussion ID (from get_mr_discussions output)"),
    resolved: z.boolean().default(true).describe("true to resolve, false to unresolve"),
  },
  async ({ mr_url, discussion_id, resolved }) => {
    const { projectPath, mrIid } = parseMrUrl(mr_url);
    await resolveDiscussion(projectPath, mrIid, discussion_id, resolved);
    return { content: [{ type: "text", text: `✅ Discussion ${discussion_id} ${resolved ? "resolved" : "unresolved"}` }] };
  }
);

// ─── Tool 8: Reply to Discussion ─────────────────────────────────────────────

server.tool(
  "reply_to_discussion",
  "Reply to an existing discussion thread on a GitLab Merge Request",
  {
    mr_url: z.string().url().describe("Full GitLab MR URL"),
    discussion_id: z.string().describe("The discussion ID to reply to"),
    comment: z.string().describe("Reply text (supports Markdown)"),
  },
  async ({ mr_url, discussion_id, comment }) => {
    const normalizedComment = normalizeText(comment);
    const { projectPath, mrIid } = parseMrUrl(mr_url);
    await replyToDiscussion(projectPath, mrIid, discussion_id, normalizedComment);
    return { content: [{ type: "text", text: `✅ Reply posted to discussion ${discussion_id}` }] };
  }
);

// ─── Tool 9: Create MR Suggestion ────────────────────────────────────────────

server.tool(
  "create_mr_suggestion",
  "Create an applicable code suggestion on a specific line. GitLab will show an 'Apply suggestion' button that directly commits the change.",
  {
    mr_url: z.string().url().describe("Full GitLab MR URL"),
    file_path: z.string().describe("Path of the file"),
    new_line: z.number().describe("Line number in the new file version to suggest a replacement for"),
    suggestion: z.string().describe("The replacement code (what the line should become). Do NOT include the suggestion markdown wrapper."),
    comment: z.string().optional().describe("Optional explanation text above the suggestion"),
  },
  async ({ mr_url, file_path, new_line, suggestion, comment }) => {
    const normalizedSuggestion = normalizeText(suggestion);
    const body = `${comment ? normalizeText(comment) + "\n\n" : ""}\`\`\`suggestion:-0+0\n${normalizedSuggestion}\n\`\`\``;

    const { projectPath, mrIid } = parseMrUrl(mr_url);
    const versions = await getMRVersions(projectPath, mrIid);
    if (versions.length === 0) {
      return { content: [{ type: "text", text: "Error: No diff versions found." }], isError: true };
    }

    const v = versions[0];
    const position: any = {
      position_type: "text",
      base_sha: v.base_commit_sha,
      head_sha: v.head_commit_sha,
      start_sha: v.start_commit_sha,
      old_path: file_path,
      new_path: file_path,
      new_line,
    };

    await createDiffNote(projectPath, mrIid, body, position);
    return { content: [{ type: "text", text: `✅ Suggestion posted on \`${file_path}\` line ${new_line}` }] };
  }
);

// ─── Tool 10: Approve MR ─────────────────────────────────────────────────────

server.tool(
  "approve_mr",
  "Approve a GitLab Merge Request",
  {
    mr_url: z.string().url().describe("Full GitLab MR URL"),
  },
  async ({ mr_url }) => {
    const { projectPath, mrIid } = parseMrUrl(mr_url);
    await approveMR(projectPath, mrIid);
    return { content: [{ type: "text", text: "✅ MR approved" }] };
  }
);

// ─── Tool 11: Unapprove MR ───────────────────────────────────────────────────

server.tool(
  "unapprove_mr",
  "Remove your approval from a GitLab Merge Request",
  {
    mr_url: z.string().url().describe("Full GitLab MR URL"),
  },
  async ({ mr_url }) => {
    const { projectPath, mrIid } = parseMrUrl(mr_url);
    await unapproveMR(projectPath, mrIid);
    return { content: [{ type: "text", text: "✅ MR approval removed" }] };
  }
);

// ─── Tool 12: List MR Pipelines ──────────────────────────────────────────────

server.tool(
  "list_mr_pipelines",
  "List CI/CD pipelines associated with a Merge Request, showing their status",
  {
    mr_url: z.string().url().describe("Full GitLab MR URL"),
  },
  async ({ mr_url }) => {
    const { projectPath, mrIid } = parseMrUrl(mr_url);
    const pipelines = await getMRPipelines(projectPath, mrIid);

    if (pipelines.length === 0) {
      return { content: [{ type: "text", text: "No pipelines found for this MR." }] };
    }

    const rows = pipelines.map((p) => {
      const icon = p.status === "success" ? "✅" : p.status === "failed" ? "❌" : p.status === "running" ? "🔄" : "⏸️";
      return `| ${icon} ${p.status} | #${p.id} | \`${p.ref}\` | [link](${p.web_url}) | ${p.updated_at} |`;
    });

    const table = `| Status | Pipeline | Ref | URL | Updated |\n|--------|----------|-----|-----|----------|\n${rows.join("\n")}`;
    return { content: [{ type: "text", text: `# MR Pipelines\n\n${table}` }] };
  }
);

// ─── Tool 13: Get Pipeline Job Log ───────────────────────────────────────────

server.tool(
  "get_pipeline_job_log",
  "Get the log output of a specific CI/CD job. Useful for diagnosing failed pipeline jobs. Returns last 200 lines.",
  {
    mr_url: z.string().url().describe("Full GitLab MR URL (used to identify the project)"),
    job_id: z.number().describe("The job ID (get from pipeline details or list_mr_pipelines)"),
  },
  async ({ mr_url, job_id }) => {
    const { projectPath } = parseMrUrl(mr_url);
    const log = await getJobLog(projectPath, job_id);

    const lines = log.split("\n");
    const truncated = lines.length > 200 ? lines.slice(-200).join("\n") : log;
    const header = lines.length > 200 ? `_Showing last 200 of ${lines.length} lines_\n\n` : "";

    return { content: [{ type: "text", text: `# Job #${job_id} Log\n\n${header}\`\`\`\n${truncated}\n\`\`\`` }] };
  }
);

// ─── Tool 14: List Open MRs ──────────────────────────────────────────────────

server.tool(
  "list_open_mrs",
  "List open Merge Requests in a GitLab project. Can filter by author or labels.",
  {
    project_url: z.string().url().describe("GitLab project URL, e.g. https://gitlab.com/group/project"),
    author: z.string().optional().describe("Filter by author username"),
    labels: z.string().optional().describe("Filter by labels (comma-separated)"),
  },
  async ({ project_url, author, labels }) => {
    const projectPath = parseProjectUrl(project_url);
    const mrs = await listOpenMRs(projectPath, { authorUsername: author, labels });

    if (mrs.length === 0) {
      return { content: [{ type: "text", text: "No open MRs found." }] };
    }

    const rows = mrs.map((mr) => {
      const draft = mr.draft ? "📝 " : "";
      return `| ${draft}!${mr.iid} | ${mr.title} | @${mr.author.username} | \`${mr.source_branch}\` | ${mr.labels.join(", ") || "-"} |`;
    });

    const table = `| MR | Title | Author | Branch | Labels |\n|----|-------|--------|--------|--------|\n${rows.join("\n")}`;
    return { content: [{ type: "text", text: `# Open MRs (${mrs.length})\n\n${table}` }] };
  }
);

// ─── Tool 15: Add MR Label ───────────────────────────────────────────────────

server.tool(
  "add_mr_label",
  "Add one or more labels to a GitLab Merge Request",
  {
    mr_url: z.string().url().describe("Full GitLab MR URL"),
    labels: z.array(z.string()).describe("Array of label names to add"),
  },
  async ({ mr_url, labels }) => {
    const { projectPath, mrIid } = parseMrUrl(mr_url);
    await addMRLabels(projectPath, mrIid, labels);
    return { content: [{ type: "text", text: `✅ Labels added: ${labels.join(", ")}` }] };
  }
);

// ─── Tool 16: Get MR Commits ─────────────────────────────────────────────────

server.tool(
  "get_mr_commits",
  "Get the list of commits in a Merge Request",
  {
    mr_url: z.string().url().describe("Full GitLab MR URL"),
  },
  async ({ mr_url }) => {
    const { projectPath, mrIid } = parseMrUrl(mr_url);
    const commits = await getMRCommits(projectPath, mrIid);

    const rows = commits.map((c) => `- **${c.short_id}** ${c.title} — _${c.author_name}_ (${c.created_at})`);
    return { content: [{ type: "text", text: `# MR Commits (${commits.length})\n\n${rows.join("\n")}` }] };
  }
);

// ─── Tool 17: Batch Create Comments ──────────────────────────────────────────

server.tool(
  "batch_create_comments",
  "Create multiple line-level review comments on a Merge Request in one call. More efficient than calling create_mr_comment multiple times.",
  {
    mr_url: z.string().url().describe("Full GitLab MR URL"),
    comments: z.array(z.object({
      file_path: z.string().describe("File path"),
      new_line: z.number().optional().describe("Line in new file version"),
      old_line: z.number().optional().describe("Line in old file version"),
      comment: z.string().describe("Comment text (Markdown)"),
    })).describe("Array of comments to post"),
  },
  async ({ mr_url, comments }) => {
    const { projectPath, mrIid } = parseMrUrl(mr_url);

    const versions = await getMRVersions(projectPath, mrIid);
    if (versions.length === 0) {
      return { content: [{ type: "text", text: "Error: No diff versions found." }], isError: true };
    }
    const v = versions[0];

    const results: string[] = [];
    for (const c of comments) {
      if (!c.new_line && !c.old_line) {
        results.push(`❌ ${c.file_path}: missing line number`);
        continue;
      }
      try {
        const position: any = {
          position_type: "text",
          base_sha: v.base_commit_sha,
          head_sha: v.head_commit_sha,
          start_sha: v.start_commit_sha,
          old_path: c.file_path,
          new_path: c.file_path,
        };
        if (c.new_line) position.new_line = c.new_line;
        if (c.old_line) position.old_line = c.old_line;

        await createDiffNote(projectPath, mrIid, normalizeText(c.comment), position);
        results.push(`✅ ${c.file_path}:${c.new_line || c.old_line}`);
      } catch (err: any) {
        results.push(`❌ ${c.file_path}:${c.new_line || c.old_line} — ${err.message}`);
      }
    }

    return { content: [{ type: "text", text: `# Batch Comments Result\n\n${results.join("\n")}` }] };
  }
);

// ─── Tool 18: Compare Branches ───────────────────────────────────────────────

server.tool(
  "compare_branches",
  "Compare two branches in a GitLab project. Shows commits and file diffs between them.",
  {
    project_url: z.string().url().describe("GitLab project URL"),
    from_branch: z.string().describe("Base branch (e.g. main)"),
    to_branch: z.string().describe("Compare branch (e.g. feature-x)"),
  },
  async ({ project_url, from_branch, to_branch }) => {
    const projectPath = parseProjectUrl(project_url);
    const result = await compareBranches(projectPath, from_branch, to_branch);

    const commits = result.commits.map((c) => `- **${c.short_id}** ${c.title}`).join("\n");
    const diffs = result.diffs.map((d) => {
      const status = d.new_file ? "[NEW]" : d.deleted_file ? "[DEL]" : d.renamed_file ? "[REN]" : "[MOD]";
      return `- ${status} ${d.new_path}`;
    }).join("\n");

    return {
      content: [{ type: "text", text: `# Branch Compare: \`${from_branch}\` → \`${to_branch}\`\n\n## Commits (${result.commits.length})\n${commits}\n\n## Changed Files (${result.diffs.length})\n${diffs}` }],
    };
  }
);

// ─── Tool 19: Search Codebase ────────────────────────────────────────────────

server.tool(
  "search_codebase",
  "Search for code patterns in a GitLab project (grep-style text search). Use to find existing patterns like LaunchedEffect usage, ViewModel communication, dependency injection, etc.",
  {
    project_url: z.string().url().describe("GitLab project URL, e.g. https://gitlab.com/group/project"),
    query: z.string().describe("Search query — code pattern, class name, function call, import, etc."),
    ref: z.string().optional().describe("Branch or tag to search in (default: project default branch)"),
    file_filter: z.string().optional().describe("Filter by filename pattern, e.g. '*.kt' or 'ViewModel'"),
  },
  async ({ project_url, query, ref, file_filter }) => {
    const projectPath = parseProjectUrl(project_url);
    const results = await searchProjectCode(projectPath, query, { ref, filePath: file_filter });

    if (results.length === 0) {
      return { content: [{ type: "text", text: `No results found for \`${query}\`` }] };
    }

    const grouped = new Map<string, typeof results>();
    for (const r of results) {
      const existing = grouped.get(r.path) || [];
      existing.push(r);
      grouped.set(r.path, existing);
    }

    const output: string[] = [];
    for (const [path, hits] of grouped) {
      const snippets = hits.map((h) => {
        const lines = h.data.replace(/\r\n/g, "\n").trimEnd();
        return `  Line ${h.startline}:\n\`\`\`\n${lines}\n\`\`\``;
      }).join("\n\n");
      output.push(`### ${path}\n${snippets}`);
    }

    return {
      content: [{ type: "text", text: `# Search: \`${query}\` (${results.length} matches in ${grouped.size} files)\n\n${output.join("\n\n---\n\n")}` }],
    };
  }
);

// ─── Tool 20: Get File Blame ─────────────────────────────────────────────────

server.tool(
  "get_file_blame",
  "Get Git blame information for a file from the MR source branch (or a custom ref), optionally for a line range.",
  {
    mr_url: z.string().url().describe("Full GitLab MR URL"),
    file_path: z.string().describe("Path of the file to inspect"),
    line_start: z.number().optional().describe("Optional start line for blame range"),
    line_end: z.number().optional().describe("Optional end line for blame range"),
    ref: z.string().optional().describe("Optional branch/tag ref override"),
  },
  async ({ mr_url, file_path, line_start, line_end, ref }) => {
    if (line_start !== undefined && line_end !== undefined && line_start > line_end) {
      return { content: [{ type: "text", text: "Error: line_start must be less than or equal to line_end." }], isError: true };
    }

    const { projectPath, mrIid } = parseMrUrl(mr_url);
    const mr = await getMergeRequest(projectPath, mrIid);
    const blameRef = ref || mr.source_branch;
    const ranges = await getFileBlame(projectPath, file_path, blameRef, { start: line_start, end: line_end });

    if (ranges.length === 0) {
      return { content: [{ type: "text", text: "No blame entries found for this file/range." }] };
    }

    let currentLine = line_start || 1;
    const output = ranges.map((r) => {
      const from = currentLine;
      const to = currentLine + r.lines.length - 1;
      currentLine = to + 1;
      return `- **${r.commit.short_id}** ${r.commit.title}\n  - Author: ${r.commit.author_name}\n  - Date: ${r.commit.authored_date}\n  - Lines: ${from}-${to}`;
    }).join("\n\n");

    return {
      content: [{
        type: "text",
        text: `# Blame for \`${file_path}\` (ref: \`${blameRef}\`)\n\n${output}`,
      }],
    };
  }
);

// ─── Start Server ─────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GitLab MR Review MCP Server v2.1.0 running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
