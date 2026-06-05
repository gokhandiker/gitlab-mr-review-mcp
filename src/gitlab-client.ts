/**
 * GitLab REST API Client
 * Uses Personal Access Token for authentication via PRIVATE-TOKEN header.
 */

const GITLAB_TOKEN = process.env.GITLAB_TOKEN || "";
const GITLAB_URL = (process.env.GITLAB_URL || "https://gitlab.com").replace(/\/$/, "");

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface MergeRequestInfo {
  id: number;
  iid: number;
  title: string;
  description: string;
  state: string;
  author: { name: string; username: string };
  source_branch: string;
  target_branch: string;
  web_url: string;
  created_at: string;
  updated_at: string;
  merged_by?: { name: string; username: string };
  labels: string[];
  draft: boolean;
  merge_status: string;
  has_conflicts: boolean;
}

export interface DiffFile {
  old_path: string;
  new_path: string;
  a_mode: string;
  b_mode: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
  diff: string;
}

export interface DiffVersion {
  id: number;
  head_commit_sha: string;
  base_commit_sha: string;
  start_commit_sha: string;
  created_at: string;
}

export interface DiscussionNote {
  id: number;
  body: string;
  author: { name: string; username: string };
  created_at: string;
  position?: {
    new_path?: string;
    old_path?: string;
    new_line?: number | null;
    old_line?: number | null;
    position_type: string;
  };
  resolvable: boolean;
  resolved?: boolean;
}

export interface Discussion {
  id: string;
  notes: DiscussionNote[];
}

export interface DiffPosition {
  position_type: "text";
  base_sha: string;
  head_sha: string;
  start_sha: string;
  old_path: string;
  new_path: string;
  new_line?: number;
  old_line?: number;
}

export interface Pipeline {
  id: number;
  iid: number;
  status: string;
  ref: string;
  sha: string;
  web_url: string;
  created_at: string;
  updated_at: string;
}

export interface PipelineJob {
  id: number;
  name: string;
  stage: string;
  status: string;
  web_url: string;
  created_at: string;
  finished_at: string | null;
  duration: number | null;
}

export interface Commit {
  id: string;
  short_id: string;
  title: string;
  message: string;
  author_name: string;
  author_email: string;
  created_at: string;
}

export interface FileContent {
  file_name: string;
  file_path: string;
  size: number;
  encoding: string;
  content: string;
  ref: string;
}

export interface BranchCompare {
  commit: { id: string; title: string } | null;
  commits: Commit[];
  diffs: DiffFile[];
}

export interface UpdateMRPayload {
  title?: string;
  description?: string;
  target_branch?: string;
  assignee_ids?: number[];
  reviewer_ids?: number[];
  labels?: string;
  add_labels?: string;
  remove_labels?: string;
  milestone_id?: number;
  squash?: boolean;
}

export interface BlameRange {
  commit: {
    id: string;
    short_id: string;
    title: string;
    author_name: string;
    authored_date: string;
  };
  lines: string[];
}

// ─── URL Parsing ──────────────────────────────────────────────────────────────

export function parseMrUrl(mrUrl: string): { projectPath: string; mrIid: number } {
  const url = new URL(mrUrl);
  const pathParts = url.pathname.split("/-/merge_requests/");
  if (pathParts.length !== 2) {
    throw new Error(`Invalid MR URL format: ${mrUrl}. Expected format: https://gitlab.com/group/project/-/merge_requests/123`);
  }

  const projectPath = pathParts[0].replace(/^\//, "").replace(/\/$/, "");
  const mrIid = parseInt(pathParts[1].replace(/[/?#].*$/, ""), 10);

  if (!projectPath || isNaN(mrIid)) {
    throw new Error(`Could not extract project path or MR IID from URL: ${mrUrl}`);
  }

  return {
    projectPath: encodeURIComponent(projectPath),
    mrIid,
  };
}

export function parseProjectUrl(projectUrl: string): string {
  const url = new URL(projectUrl);
  const path = url.pathname.replace(/^\//, "").replace(/\/$/, "").replace(/\/-\/.*$/, "");
  if (!path) {
    throw new Error(`Invalid project URL: ${projectUrl}`);
  }
  return encodeURIComponent(path);
}

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────

async function gitlabFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  if (!GITLAB_TOKEN) {
    throw new Error("GITLAB_TOKEN environment variable is not set");
  }

  const url = `${GITLAB_URL}/api/v4${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "PRIVATE-TOKEN": GITLAB_TOKEN,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitLab API error ${response.status}: ${body} (${url})`);
  }

  return response.json() as Promise<T>;
}

async function gitlabFetchText(endpoint: string): Promise<string> {
  if (!GITLAB_TOKEN) {
    throw new Error("GITLAB_TOKEN environment variable is not set");
  }

  const url = `${GITLAB_URL}/api/v4${endpoint}`;
  const response = await fetch(url, {
    headers: {
      "PRIVATE-TOKEN": GITLAB_TOKEN,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitLab API error ${response.status}: ${body} (${url})`);
  }

  return response.text();
}

async function gitlabFetchPaginated<T>(endpoint: string): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const separator = endpoint.includes("?") ? "&" : "?";
    const url = `${endpoint}${separator}per_page=${perPage}&page=${page}`;

    if (!GITLAB_TOKEN) {
      throw new Error("GITLAB_TOKEN environment variable is not set");
    }

    const fullUrl = `${GITLAB_URL}/api/v4${url}`;
    const response = await fetch(fullUrl, {
      headers: {
        "PRIVATE-TOKEN": GITLAB_TOKEN,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitLab API error ${response.status}: ${body} (${fullUrl})`);
    }

    const data = (await response.json()) as T[];
    results.push(...data);

    const nextPage = response.headers.get("x-next-page");
    if (!nextPage || nextPage === "") {
      break;
    }
    page = parseInt(nextPage, 10);
  }

  return results;
}

// ─── Merge Request APIs ───────────────────────────────────────────────────────

export async function getMergeRequest(projectPath: string, mrIid: number): Promise<MergeRequestInfo> {
  return gitlabFetch<MergeRequestInfo>(`/projects/${projectPath}/merge_requests/${mrIid}`);
}

export async function getMRDiffs(projectPath: string, mrIid: number): Promise<DiffFile[]> {
  return gitlabFetchPaginated<DiffFile>(`/projects/${projectPath}/merge_requests/${mrIid}/diffs`);
}

export async function getMRDiscussions(projectPath: string, mrIid: number): Promise<Discussion[]> {
  return gitlabFetchPaginated<Discussion>(`/projects/${projectPath}/merge_requests/${mrIid}/discussions`);
}

export async function getMRVersions(projectPath: string, mrIid: number): Promise<DiffVersion[]> {
  return gitlabFetch<DiffVersion[]>(`/projects/${projectPath}/merge_requests/${mrIid}/versions`);
}

export async function getMRCommits(projectPath: string, mrIid: number): Promise<Commit[]> {
  return gitlabFetchPaginated<Commit>(`/projects/${projectPath}/merge_requests/${mrIid}/commits`);
}

export async function createDiffNote(
  projectPath: string,
  mrIid: number,
  body: string,
  position: DiffPosition
): Promise<Discussion> {
  return gitlabFetch<Discussion>(`/projects/${projectPath}/merge_requests/${mrIid}/discussions`, {
    method: "POST",
    body: JSON.stringify({ body, position }),
  });
}

export async function replyToDiscussion(
  projectPath: string,
  mrIid: number,
  discussionId: string,
  body: string
): Promise<DiscussionNote> {
  return gitlabFetch<DiscussionNote>(
    `/projects/${projectPath}/merge_requests/${mrIid}/discussions/${discussionId}/notes`,
    { method: "POST", body: JSON.stringify({ body }) }
  );
}

export async function resolveDiscussion(
  projectPath: string,
  mrIid: number,
  discussionId: string,
  resolved: boolean
): Promise<Discussion> {
  return gitlabFetch<Discussion>(
    `/projects/${projectPath}/merge_requests/${mrIid}/discussions/${discussionId}`,
    { method: "PUT", body: JSON.stringify({ resolved }) }
  );
}

export async function approveMR(projectPath: string, mrIid: number): Promise<void> {
  await gitlabFetch<unknown>(`/projects/${projectPath}/merge_requests/${mrIid}/approve`, {
    method: "POST",
  });
}

export async function unapproveMR(projectPath: string, mrIid: number): Promise<void> {
  await gitlabFetch<unknown>(`/projects/${projectPath}/merge_requests/${mrIid}/unapprove`, {
    method: "POST",
  });
}

export async function addMRLabels(projectPath: string, mrIid: number, labels: string[]): Promise<MergeRequestInfo> {
  return gitlabFetch<MergeRequestInfo>(`/projects/${projectPath}/merge_requests/${mrIid}`, {
    method: "PUT",
    body: JSON.stringify({ add_labels: labels.join(",") }),
  });
}

export async function updateMR(projectPath: string, mrIid: number, payload: UpdateMRPayload): Promise<MergeRequestInfo> {
  return gitlabFetch<MergeRequestInfo>(`/projects/${projectPath}/merge_requests/${mrIid}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

// ─── File Content ─────────────────────────────────────────────────────────────

export async function getFileContent(projectPath: string, filePath: string, ref: string): Promise<FileContent> {
  const encodedFilePath = encodeURIComponent(filePath);
  return gitlabFetch<FileContent>(`/projects/${projectPath}/repository/files/${encodedFilePath}?ref=${encodeURIComponent(ref)}`);
}

export async function getFileBlame(
  projectPath: string,
  filePath: string,
  ref: string,
  range?: { start?: number; end?: number }
): Promise<BlameRange[]> {
  const encodedFilePath = encodeURIComponent(filePath);
  let endpoint = `/projects/${projectPath}/repository/files/${encodedFilePath}/blame?ref=${encodeURIComponent(ref)}`;
  if (range?.start) endpoint += `&range[start]=${range.start}`;
  if (range?.end) endpoint += `&range[end]=${range.end}`;
  return gitlabFetch<BlameRange[]>(endpoint);
}

// ─── Pipeline & Jobs ──────────────────────────────────────────────────────────

export async function getMRPipelines(projectPath: string, mrIid: number): Promise<Pipeline[]> {
  return gitlabFetchPaginated<Pipeline>(`/projects/${projectPath}/merge_requests/${mrIid}/pipelines`);
}

export async function getPipelineJobs(projectPath: string, pipelineId: number): Promise<PipelineJob[]> {
  return gitlabFetchPaginated<PipelineJob>(`/projects/${projectPath}/pipelines/${pipelineId}/jobs`);
}

export async function getJobLog(projectPath: string, jobId: number): Promise<string> {
  return gitlabFetchText(`/projects/${projectPath}/jobs/${jobId}/trace`);
}

// ─── Project Level ────────────────────────────────────────────────────────────

export async function listOpenMRs(projectPath: string, options?: { authorUsername?: string; labels?: string }): Promise<MergeRequestInfo[]> {
  let endpoint = `/projects/${projectPath}/merge_requests?state=opened`;
  if (options?.authorUsername) endpoint += `&author_username=${encodeURIComponent(options.authorUsername)}`;
  if (options?.labels) endpoint += `&labels=${encodeURIComponent(options.labels)}`;
  return gitlabFetchPaginated<MergeRequestInfo>(endpoint);
}

// ─── Branch Compare ───────────────────────────────────────────────────────────

export async function compareBranches(projectPath: string, from: string, to: string): Promise<BranchCompare> {
  return gitlabFetch<BranchCompare>(
    `/projects/${projectPath}/repository/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  );
}

// ─── Code Search ──────────────────────────────────────────────────────────────

export interface SearchBlob {
  basename: string;
  data: string;
  path: string;
  filename: string;
  id: string | null;
  ref: string;
  startline: number;
  project_id: number;
}

export async function searchProjectCode(
  projectPath: string,
  query: string,
  options?: { ref?: string; filePath?: string }
): Promise<SearchBlob[]> {
  let endpoint = `/projects/${projectPath}/search?scope=blobs&search=${encodeURIComponent(query)}`;
  if (options?.ref) endpoint += `&ref=${encodeURIComponent(options.ref)}`;
  if (options?.filePath) endpoint += `&filename=${encodeURIComponent(options.filePath)}`;
  return gitlabFetchPaginated<SearchBlob>(endpoint);
}
