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
} from "./graphql";

function mockGraphQLResponse(handler: (query: string) => unknown): {
  queries: string[];
} {
  const queries: string[] = [];
  (globalThis as any).GM_xmlhttpRequest = vi.fn(
    ({ data, onload }: { data: string; onload: (res: any) => void }) => {
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
          { id: "id-1", name: "Jane Doe", aliases: ["JD"], deleted: false },
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
});
