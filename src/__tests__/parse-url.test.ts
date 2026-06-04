import { describe, it, expect } from "vitest";
import { parseMrUrl, parseProjectUrl } from "../gitlab-client.js";

describe("parseMrUrl", () => {
  it("parses a standard MR URL", () => {
    const result = parseMrUrl("https://gitlab.com/mygroup/myproject/-/merge_requests/42");
    expect(result.projectPath).toBe("mygroup%2Fmyproject");
    expect(result.mrIid).toBe(42);
  });

  it("parses nested group URL", () => {
    const result = parseMrUrl("https://gitlab.com/org/team/subgroup/project/-/merge_requests/100");
    expect(result.projectPath).toBe("org%2Fteam%2Fsubgroup%2Fproject");
    expect(result.mrIid).toBe(100);
  });

  it("handles trailing slash", () => {
    const result = parseMrUrl("https://gitlab.com/group/project/-/merge_requests/7/");
    expect(result.mrIid).toBe(7);
  });

  it("handles query params", () => {
    const result = parseMrUrl("https://gitlab.com/group/project/-/merge_requests/55?tab=diffs");
    expect(result.mrIid).toBe(55);
  });

  it("handles hash fragment", () => {
    const result = parseMrUrl("https://gitlab.com/group/project/-/merge_requests/10#note_123");
    expect(result.mrIid).toBe(10);
  });

  it("works with self-hosted GitLab URL", () => {
    const result = parseMrUrl("https://git.company.io/team/backend/-/merge_requests/200");
    expect(result.projectPath).toBe("team%2Fbackend");
    expect(result.mrIid).toBe(200);
  });

  it("throws on invalid URL (no merge_requests segment)", () => {
    expect(() => parseMrUrl("https://gitlab.com/group/project/-/issues/5")).toThrow("Invalid MR URL format");
  });

  it("throws on malformed URL", () => {
    expect(() => parseMrUrl("not-a-url")).toThrow();
  });
});

describe("parseProjectUrl", () => {
  it("parses a simple project URL", () => {
    expect(parseProjectUrl("https://gitlab.com/mygroup/myproject")).toBe("mygroup%2Fmyproject");
  });

  it("parses nested group project URL", () => {
    expect(parseProjectUrl("https://gitlab.com/org/team/subgroup/project")).toBe("org%2Fteam%2Fsubgroup%2Fproject");
  });

  it("handles trailing slash", () => {
    expect(parseProjectUrl("https://gitlab.com/group/project/")).toBe("group%2Fproject");
  });

  it("strips /-/ paths", () => {
    expect(parseProjectUrl("https://gitlab.com/group/project/-/settings")).toBe("group%2Fproject");
  });

  it("throws on empty path", () => {
    expect(() => parseProjectUrl("https://gitlab.com/")).toThrow("Invalid project URL");
  });
});
