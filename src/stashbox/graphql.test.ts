// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import {
  fetchPerformerAliases,
  fetchTagAliases,
  fetchStudioAliases,
  buildStudioAliasQuery,
  parseStudioAliasResponse,
  buildTagAliasQuery,
  parseTagAliasResponse,
  buildPerformerAliasQuery,
  parsePerformerAliasResponse,
  findDuplicatesByUrl,
  buildUrlSearchQuery,
  parseUrlSearchResponse,
} from "./graphql";

function mockGraphQLResponse(handler: (query: string) => unknown): {
  queries: string[];
} {
  const queries: string[] = [];
  // Mocking the ambient Tampermonkey global: its real type is a complex
  // generic overloaded declaration not worth reproducing here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).GM_xmlhttpRequest = vi.fn(
    ({
      data,
      onload,
    }: {
      data: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onload: (res: any) => void;
    }) => {
      const { query } = JSON.parse(data);
      queries.push(query);
      onload({ status: 200, response: { data: handler(query) } });
    },
  );
  return { queries };
}

describe("fetchPerformerAliases", () => {
  it("queries performers nested under the search result wrapper, not directly on it", async () => {
    const { queries } = mockGraphQLResponse(() => ({
      search_0: {
        performers: [
          {
            name: "Angel Youngs",
            aliases: ["Angel", "Angel Young"],
            deleted: false,
          },
        ],
      },
    }));

    const result = await fetchPerformerAliases(["Angel"]);

    expect(queries[0]).toContain("performers {");
    expect(result.get("Angel")).toEqual({
      canonical: "Angel Youngs",
      aliases: ["Angel", "Angel Young"],
    });
  });

  it("ignores names with no match in the search results", async () => {
    mockGraphQLResponse(() => ({ search_0: { performers: [] } }));
    const result = await fetchPerformerAliases(["Nobody"]);
    expect(result.size).toBe(0);
  });

  it("includes the performer's stash-box id, so callers can build a link to their profile", async () => {
    mockGraphQLResponse(() => ({
      search_0: {
        performers: [
          {
            id: "c106a8b3-3e34-4938-90f2-806700a929d7",
            name: "Angel Youngs",
            aliases: [],
            deleted: false,
          },
        ],
      },
    }));
    const result = await fetchPerformerAliases(["Angel Youngs"]);
    expect(result.get("Angel Youngs")?.id).toBe(
      "c106a8b3-3e34-4938-90f2-806700a929d7",
    );
  });

  it("keys results by the original-case name, not lowercased", async () => {
    mockGraphQLResponse(() => ({
      search_0: {
        performers: [
          { name: "Francis_x", aliases: ["Francis X"], deleted: false },
        ],
      },
    }));

    const result = await fetchPerformerAliases(["Francis_x"]);

    expect(result.has("Francis_x")).toBe(true);
    expect(result.has("francis_x")).toBe(false);
    expect(result.get("Francis_x")).toEqual({
      canonical: "Francis_x",
      aliases: ["Francis X"],
    });
  });
});

describe("fetchStudioAliases", () => {
  it("resolves a search term that's only an alias (not the canonical name) via queryStudios' fallback search", async () => {
    mockGraphQLResponse(() => ({
      exact_0: null,
      search_0: {
        studios: [
          {
            name: "ExCoGigirls",
            aliases: ["ExCoGi Girls"],
            deleted: false,
          },
        ],
      },
    }));

    const result = await fetchStudioAliases(["ExCoGi Girls"]);

    expect(result.get("ExCoGi Girls")).toEqual({
      canonical: "ExCoGigirls",
      aliases: ["ExCoGi Girls"],
    });
  });

  it("resolves an exact canonical-name match directly, without needing the search fallback", async () => {
    mockGraphQLResponse(() => ({
      exact_0: {
        name: "ExCoGigirls",
        aliases: ["ExCoGi Girls"],
        deleted: false,
      },
      search_0: { studios: [] },
    }));

    const result = await fetchStudioAliases(["ExCoGigirls"]);

    expect(result.get("ExCoGigirls")).toEqual({
      canonical: "ExCoGigirls",
      aliases: ["ExCoGi Girls"],
    });
  });
});

describe("fetchTagAliases", () => {
  it("resolves a tag's canonical name and aliases", async () => {
    mockGraphQLResponse(() => ({
      exact_0: { name: "4K Available", aliases: ["4K"], deleted: false },
    }));

    const result = await fetchTagAliases(["4K"]);
    expect(result.get("4K")).toEqual({
      canonical: "4K Available",
      aliases: ["4K"],
    });
  });
});

describe("buildStudioAliasQuery / parseStudioAliasResponse", () => {
  it("builds an exact + search field pair per name", () => {
    const query = buildStudioAliasQuery(["Studio A"]);
    expect(query).toContain("exact_0: findStudio");
    expect(query).toContain("search_0: queryStudios");
    expect(query).toContain('"Studio A"');
  });

  it("prefers the exact match over a search-fallback alias match", () => {
    const result = parseStudioAliasResponse(["Studio A"], {
      exact_0: {
        id: "id-1",
        name: "Studio A",
        aliases: ["Alias A"],
        deleted: false,
      },
      search_0: { studios: [] },
    });
    expect(result.get("Studio A")).toEqual({
      id: "id-1",
      canonical: "Studio A",
      aliases: ["Alias A"],
    });
  });

  it("falls back to a search-result alias match when there's no exact hit", () => {
    const result = parseStudioAliasResponse(["Alias A"], {
      exact_0: null,
      search_0: {
        studios: [
          {
            id: "id-1",
            name: "Studio A",
            aliases: ["Alias A"],
            deleted: false,
          },
        ],
      },
    });
    expect(result.get("Alias A")).toEqual({
      id: "id-1",
      canonical: "Studio A",
      aliases: ["Alias A"],
    });
  });

  it("leaves a name unmapped when there's neither an exact nor an alias match", () => {
    const result = parseStudioAliasResponse(["Nobody"], {
      exact_0: null,
      search_0: { studios: [] },
    });
    expect(result.has("Nobody")).toBe(false);
  });
});

describe("buildTagAliasQuery / parseTagAliasResponse", () => {
  it("builds one exact field per name", () => {
    const query = buildTagAliasQuery(["4K"]);
    expect(query).toContain("exact_0: findTagOrAlias");
    expect(query).toContain('"4K"');
  });

  it("maps a hit to its canonical name and trimmed aliases", () => {
    const result = parseTagAliasResponse(["4K"], {
      exact_0: {
        id: "id-1",
        name: "4K Available",
        aliases: [" 4K "],
        deleted: false,
      },
    });
    expect(result.get("4K")).toEqual({
      id: "id-1",
      canonical: "4K Available",
      aliases: ["4K"],
    });
  });

  it("leaves a name unmapped when there's no hit", () => {
    const result = parseTagAliasResponse(["Nobody"], { exact_0: null });
    expect(result.has("Nobody")).toBe(false);
  });
});

describe("buildPerformerAliasQuery / parsePerformerAliasResponse", () => {
  it("builds one search field per name", () => {
    const query = buildPerformerAliasQuery(["Jane Doe"]);
    expect(query).toContain("search_0: searchPerformers");
    expect(query).toContain('"Jane Doe"');
  });

  it("matches a search result by canonical name or by alias, case-insensitively", () => {
    const result = parsePerformerAliasResponse(["jane doe"], {
      search_0: {
        performers: [
          {
            id: "id-1",
            name: "Jane Doe",
            aliases: ["JD"],
            disambiguation: null,
            deleted: false,
          },
        ],
      },
    });
    expect(result.get("jane doe")).toEqual({
      id: "id-1",
      canonical: "Jane Doe",
      aliases: ["JD"],
    });
  });

  it("leaves a name unmapped when no search result matches", () => {
    const result = parsePerformerAliasResponse(["Nobody"], {
      search_0: { performers: [] },
    });
    expect(result.has("Nobody")).toBe(false);
  });

  it("surfaces every matching performer as a candidate when a name matches more than one", () => {
    const result = parsePerformerAliasResponse(["Ali Jones"], {
      search_0: {
        performers: [
          {
            id: "id-1",
            name: "Ali Jones",
            aliases: [],
            disambiguation: "Los Angeles",
            deleted: false,
          },
          {
            id: "id-2",
            name: "Ali Jones",
            aliases: [],
            disambiguation: null,
            deleted: false,
          },
        ],
      },
    });
    const entry = result.get("Ali Jones");
    expect(entry?.candidates).toEqual([
      { id: "id-1", name: "Ali Jones", disambiguation: "Los Angeles" },
      { id: "id-2", name: "Ali Jones", disambiguation: null },
    ]);
  });

  it("doesn't set candidates when only one performer matches", () => {
    const result = parsePerformerAliasResponse(["Jane Doe"], {
      search_0: {
        performers: [
          {
            id: "id-1",
            name: "Jane Doe",
            aliases: [],
            disambiguation: null,
            deleted: false,
          },
        ],
      },
    });
    expect(result.get("Jane Doe")?.candidates).toBeUndefined();
  });
});

describe("buildUrlSearchQuery / parseUrlSearchResponse", () => {
  it("builds a performer and scene search field per URL", () => {
    const query = buildUrlSearchQuery(["https://iafd.com/person.rme/id=123"]);
    expect(query).toContain("perf_0: searchPerformers");
    expect(query).toContain("scene_0: searchScenes");
    expect(query).toContain('"https://iafd.com/person.rme/id=123"');
  });

  it("reports a matching performer for a URL", () => {
    const result = parseUrlSearchResponse(["https://example.com/a"], {
      perf_0: {
        performers: [{ id: "p-1", name: "Jane Doe", deleted: false }],
      },
      scene_0: { scenes: [] },
    });
    expect(result.get("https://example.com/a")).toEqual([
      { type: "performer", id: "p-1", name: "Jane Doe" },
    ]);
  });

  it("reports a matching scene for a URL", () => {
    const result = parseUrlSearchResponse(["https://example.com/a"], {
      perf_0: { performers: [] },
      scene_0: {
        scenes: [{ id: "s-1", title: "Some Scene", deleted: false }],
      },
    });
    expect(result.get("https://example.com/a")).toEqual([
      { type: "scene", id: "s-1", name: "Some Scene" },
    ]);
  });

  it("ignores deleted performers and scenes", () => {
    const result = parseUrlSearchResponse(["https://example.com/a"], {
      perf_0: {
        performers: [{ id: "p-1", name: "Jane Doe", deleted: true }],
      },
      scene_0: {
        scenes: [{ id: "s-1", title: "Some Scene", deleted: true }],
      },
    });
    expect(result.has("https://example.com/a")).toBe(false);
  });

  it("leaves a URL unmapped when nothing matches", () => {
    const result = parseUrlSearchResponse(["https://example.com/a"], {
      perf_0: { performers: [] },
      scene_0: { scenes: [] },
    });
    expect(result.has("https://example.com/a")).toBe(false);
  });
});

describe("findDuplicatesByUrl", () => {
  it("resolves an empty map without querying when there are no URLs", async () => {
    const { queries } = mockGraphQLResponse(() => ({}));
    const result = await findDuplicatesByUrl([]);
    expect(result.size).toBe(0);
    expect(queries).toEqual([]);
  });

  it("queries stash-box's own search for each submitted URL", async () => {
    const { queries } = mockGraphQLResponse(() => ({
      perf_0: {
        performers: [{ id: "p-1", name: "Jane Doe", deleted: false }],
      },
      scene_0: { scenes: [] },
    }));

    const result = await findDuplicatesByUrl(["https://example.com/a"]);

    expect(queries[0]).toContain("searchPerformers");
    expect(result.get("https://example.com/a")).toEqual([
      { type: "performer", id: "p-1", name: "Jane Doe" },
    ]);
  });
});
