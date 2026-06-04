import { describe, it, expect, vi, beforeEach } from "vitest";
import fixtures from "./fixtures/mr-data.json";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Set env vars before importing the module
process.env.GITLAB_TOKEN = "test-token";
process.env.GITLAB_URL = "https://gitlab.com";

// Dynamic import after env setup
const client = await import("../gitlab-client.js");

function jsonResponse(data: unknown, headers?: Record<string, string>) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers({ "content-type": "application/json", ...headers }),
  } as Response);
}

function textResponse(text: string) {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(text),
    headers: new Headers({}),
  } as Response);
}

function errorResponse(status: number, body: string) {
  return Promise.resolve({
    ok: false,
    status,
    text: () => Promise.resolve(body),
    headers: new Headers({}),
  } as Response);
}

beforeEach(() => {
  mockFetch.mockReset();
});

const PROJECT = "mygroup%2Fmyproject";
const MR_IID = 42;

describe("getMergeRequest", () => {
  it("fetches MR info with correct URL and headers", async () => {
    mockFetch.mockReturnValueOnce(jsonResponse(fixtures.mergeRequest));

    const mr = await client.getMergeRequest(PROJECT, MR_IID);

    expect(mockFetch).toHaveBeenCalledWith(
      `https://gitlab.com/api/v4/projects/${PROJECT}/merge_requests/${MR_IID}`,
      expect.objectContaining({
        headers: expect.objectContaining({ "PRIVATE-TOKEN": "test-token" }),
      })
    );
    expect(mr.title).toBe("Add user authentication module");
    expect(mr.iid).toBe(42);
    expect(mr.source_branch).toBe("feature/auth");
  });

  it("throws on API error", async () => {
    mockFetch.mockReturnValueOnce(errorResponse(404, "Not Found"));

    await expect(client.getMergeRequest(PROJECT, 999)).rejects.toThrow("GitLab API error 404");
  });
});

describe("getMRDiffs", () => {
  it("fetches paginated diffs", async () => {
    mockFetch.mockReturnValueOnce(jsonResponse(fixtures.diffs, { "x-next-page": "" }));

    const diffs = await client.getMRDiffs(PROJECT, MR_IID);
    expect(diffs).toHaveLength(2);
    expect(diffs[0].new_path).toBe("src/auth.ts");
    expect(diffs[0].new_file).toBe(true);
    expect(diffs[1].new_path).toBe("src/routes.ts");
  });

  it("handles multiple pages", async () => {
    mockFetch
      .mockReturnValueOnce(jsonResponse([fixtures.diffs[0]], { "x-next-page": "2" }))
      .mockReturnValueOnce(jsonResponse([fixtures.diffs[1]], { "x-next-page": "" }));

    const diffs = await client.getMRDiffs(PROJECT, MR_IID);
    expect(diffs).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("getMRDiscussions", () => {
  it("returns discussions with note details", async () => {
    mockFetch.mockReturnValueOnce(jsonResponse(fixtures.discussions, { "x-next-page": "" }));

    const discussions = await client.getMRDiscussions(PROJECT, MR_IID);
    expect(discussions).toHaveLength(2);
    expect(discussions[0].id).toBe("disc-abc123");
    expect(discussions[0].notes[0].position?.new_line).toBe(7);
  });
});

describe("getMRVersions", () => {
  it("returns version list", async () => {
    mockFetch.mockReturnValueOnce(jsonResponse(fixtures.versions));

    const versions = await client.getMRVersions(PROJECT, MR_IID);
    expect(versions).toHaveLength(1);
    expect(versions[0].head_commit_sha).toBe("abc123def456");
  });
});

describe("getMRCommits", () => {
  it("returns commit list", async () => {
    mockFetch.mockReturnValueOnce(jsonResponse(fixtures.commits, { "x-next-page": "" }));

    const commits = await client.getMRCommits(PROJECT, MR_IID);
    expect(commits).toHaveLength(2);
    expect(commits[0].short_id).toBe("abc123d");
  });
});

describe("createDiffNote", () => {
  it("sends POST with correct body and position", async () => {
    mockFetch.mockReturnValueOnce(jsonResponse(fixtures.discussions[0]));

    const position = {
      position_type: "text" as const,
      base_sha: "000111222333",
      head_sha: "abc123def456",
      start_sha: "444555666777",
      old_path: "src/auth.ts",
      new_path: "src/auth.ts",
      new_line: 7,
    };

    await client.createDiffNote(PROJECT, MR_IID, "Review comment", position);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/discussions"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ body: "Review comment", position }),
      })
    );
  });
});

describe("replyToDiscussion", () => {
  it("sends POST to discussion notes endpoint", async () => {
    mockFetch.mockReturnValueOnce(jsonResponse(fixtures.discussions[0].notes[0]));

    await client.replyToDiscussion(PROJECT, MR_IID, "disc-abc123", "My reply");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/discussions/disc-abc123/notes"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ body: "My reply" }),
      })
    );
  });
});

describe("resolveDiscussion", () => {
  it("sends PUT with resolved flag", async () => {
    mockFetch.mockReturnValueOnce(jsonResponse(fixtures.discussions[0]));

    await client.resolveDiscussion(PROJECT, MR_IID, "disc-abc123", true);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/discussions/disc-abc123"),
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ resolved: true }),
      })
    );
  });
});

describe("approveMR / unapproveMR", () => {
  it("sends POST to approve endpoint", async () => {
    mockFetch.mockReturnValueOnce(jsonResponse({}));

    await client.approveMR(PROJECT, MR_IID);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/approve"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("sends POST to unapprove endpoint", async () => {
    mockFetch.mockReturnValueOnce(jsonResponse({}));

    await client.unapproveMR(PROJECT, MR_IID);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/unapprove"),
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("addMRLabels", () => {
  it("sends PUT with comma-joined labels", async () => {
    mockFetch.mockReturnValueOnce(jsonResponse(fixtures.mergeRequest));

    await client.addMRLabels(PROJECT, MR_IID, ["bug", "urgent"]);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/merge_requests/${MR_IID}`),
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ add_labels: "bug,urgent" }),
      })
    );
  });
});

describe("getFileContent", () => {
  it("fetches file with correct ref param", async () => {
    mockFetch.mockReturnValueOnce(jsonResponse(fixtures.fileContent));

    const file = await client.getFileContent(PROJECT, "src/auth.ts", "feature/auth");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/repository/files/src%2Fauth.ts?ref=feature%2Fauth"),
      expect.anything()
    );
    expect(file.file_path).toBe("src/auth.ts");
    expect(file.encoding).toBe("base64");
  });
});

describe("getMRPipelines", () => {
  it("returns pipeline list", async () => {
    mockFetch.mockReturnValueOnce(jsonResponse(fixtures.pipelines, { "x-next-page": "" }));

    const pipelines = await client.getMRPipelines(PROJECT, MR_IID);
    expect(pipelines).toHaveLength(1);
    expect(pipelines[0].status).toBe("success");
  });
});

describe("getJobLog", () => {
  it("returns raw text log", async () => {
    mockFetch.mockReturnValueOnce(textResponse("Line 1\nLine 2\nLine 3"));

    const log = await client.getJobLog(PROJECT, 5001);
    expect(log).toContain("Line 1");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/jobs/5001/trace"),
      expect.anything()
    );
  });
});

describe("listOpenMRs", () => {
  it("fetches with state=opened", async () => {
    mockFetch.mockReturnValueOnce(jsonResponse(fixtures.openMRs, { "x-next-page": "" }));

    const mrs = await client.listOpenMRs(PROJECT);
    expect(mrs).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("state=opened"),
      expect.anything()
    );
  });

  it("adds author filter", async () => {
    mockFetch.mockReturnValueOnce(jsonResponse([fixtures.openMRs[0]], { "x-next-page": "" }));

    await client.listOpenMRs(PROJECT, { authorUsername: "janedev" });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("author_username=janedev"),
      expect.anything()
    );
  });

  it("adds label filter", async () => {
    mockFetch.mockReturnValueOnce(jsonResponse([fixtures.openMRs[0]], { "x-next-page": "" }));

    await client.listOpenMRs(PROJECT, { labels: "backend,security" });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("labels=backend%2Csecurity"),
      expect.anything()
    );
  });
});

describe("compareBranches", () => {
  it("fetches compare endpoint with from/to params", async () => {
    mockFetch.mockReturnValueOnce(jsonResponse(fixtures.branchCompare));

    const result = await client.compareBranches(PROJECT, "main", "feature/auth");
    expect(result.commits).toHaveLength(1);
    expect(result.diffs).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("from=main&to=feature%2Fauth"),
      expect.anything()
    );
  });
});
