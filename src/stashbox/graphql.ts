import { gmRequest, type GraphQLError } from "../gm-request";

export type AliasInfo = {
  canonical: string;
  aliases: string[];
  id?: string;
};

type NameResult = {
  id: string;
  name: string;
  aliases: string[];
  deleted: boolean;
};

type ExactMap<T> = {
  [key: `exact_${number}`]: T | null;
};

type SearchMap<T> = {
  [key: `search_${number}`]: T | null;
};

function toAliasInfo(hit: NameResult): AliasInfo {
  return {
    id: hit.id,
    canonical: hit.name,
    aliases: (hit.aliases ?? []).map((a) => a.trim()),
  };
}

async function stashboxQuery<T>(query: string, variables = {}): Promise<T> {
  const endpoint = window.location.origin + "/graphql";
  const { status, response } = await gmRequest<{
    data: T;
    errors?: GraphQLError[];
  }>({
    method: "POST",
    url: endpoint,
    responseType: "json",
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify({ query, variables }),
  });
  if (status !== 200 || response.errors) {
    const msg =
      response?.errors?.map((e) => e.message).join("; ") ?? `HTTP ${status}`;
    throw new Error(`StashDB query failed: ${msg}`);
  }
  return response.data;
}

type StudioQueryResult = ExactMap<NameResult> &
  SearchMap<{ studios: NameResult[] }>;

export function buildStudioAliasQuery(names: string[]): string {
  const fields = names
    .filter(Boolean)
    .map(
      (name, i) => `
    exact_${i}: findStudio(name: ${JSON.stringify(name)}) {
      id
      name
      aliases
      deleted
    }
    search_${i}: queryStudios(input: { names: ${JSON.stringify(name)}, per_page: 100 }) {
      studios {
        id
        name
        aliases
        deleted
      }
    }
  `,
    )
    .join("\n");
  return `{ ${fields} }`;
}

export function parseStudioAliasResponse(
  names: string[],
  data: StudioQueryResult,
): Map<string, AliasInfo> {
  const result = new Map<string, AliasInfo>();
  names.forEach((name, i) => {
    const exact = data[`exact_${i}`];
    const searchResults = data[`search_${i}`]?.studios ?? [];
    // Happy path, the name is a perfect match
    if (exact) {
      result.set(name, toAliasInfo(exact));
    } else if (searchResults.length) {
      const nameLower = name.toLowerCase().trim();
      const aliasMatch = searchResults.find(({ aliases }) =>
        aliases.some((a: string) => a.toLowerCase().trim() === nameLower),
      );
      if (aliasMatch) {
        result.set(name, toAliasInfo(aliasMatch));
      }
    }
  });
  return result;
}

export async function fetchStudioAliases(
  names: string[],
): Promise<Map<string, AliasInfo>> {
  if (!names.length) return new Map();
  const data = await stashboxQuery<StudioQueryResult>(
    buildStudioAliasQuery(names),
  );
  return parseStudioAliasResponse(names, data);
}

type TagQueryResult = ExactMap<NameResult>;

export function buildTagAliasQuery(names: string[]): string {
  const fields = names
    .map(
      (name, i) => `
    exact_${i}: findTagOrAlias(name: ${JSON.stringify(name)}) {
      id
      name
      aliases
      deleted
    }`,
    )
    .join("\n");
  return `{ ${fields} }`;
}

export function parseTagAliasResponse(
  names: string[],
  data: TagQueryResult,
): Map<string, AliasInfo> {
  const result = new Map<string, AliasInfo>();
  names.forEach((name, i) => {
    const hit = data[`exact_${i}`];
    if (!hit) {
      return;
    }

    result.set(name, toAliasInfo(hit));
  });
  return result;
}

export async function fetchTagAliases(
  names: string[],
): Promise<Map<string, AliasInfo>> {
  if (!names.length) return new Map();
  const data = await stashboxQuery<TagQueryResult>(buildTagAliasQuery(names));
  return parseTagAliasResponse(names, data);
}

type PerformerSearchResult = NameResult & {
  disambiguation: string | null;
};

type PerformerQueryResult = SearchMap<{ performers: PerformerSearchResult[] }>;

export function buildPerformerAliasQuery(names: string[]): string {
  const fields = names
    .map(
      (name, i) => `
    search_${i}: searchPerformers(term: ${JSON.stringify(name)}) {
      performers {
        id
        name
        aliases
        disambiguation
        deleted
      }
    }
  `,
    )
    .join("\n");
  return `{ ${fields} }`;
}

export type PerformerCandidate = {
  id: string;
  name: string;
  disambiguation: string | null;
};

export type PerformerAliasInfo = AliasInfo & {
  candidates?: PerformerCandidate[];
};

export function parsePerformerAliasResponse(
  names: string[],
  data: PerformerQueryResult,
): Map<string, PerformerAliasInfo> {
  const result = new Map<string, PerformerAliasInfo>();
  names.forEach((name, i) => {
    const hits = data[`search_${i}`]?.performers ?? [];
    const nameLower = name.toLowerCase().trim();
    const matches = hits.filter(
      (p) =>
        p.name.toLowerCase().trim() === nameLower ||
        (p.aliases ?? []).some(
          (a: string) => a.toLowerCase().trim() === nameLower,
        ),
    );
    if (!matches.length) return;

    result.set(name, {
      ...toAliasInfo(matches[0]),
      ...(matches.length > 1 && {
        candidates: matches.map((m) => ({
          id: m.id,
          name: m.name,
          disambiguation: m.disambiguation,
        })),
      }),
    });
  });
  return result;
}

export async function fetchPerformerAliases(
  names: string[],
): Promise<Map<string, PerformerAliasInfo>> {
  if (!names.length) return new Map();
  const data = await stashboxQuery<PerformerQueryResult>(
    buildPerformerAliasQuery(names),
  );
  return parsePerformerAliasResponse(names, data);
}

export type UrlSearchMatch = {
  type: "performer" | "scene";
  id: string;
  name: string;
};

type UrlPerformerResult = { id: string; name: string; deleted: boolean };
type UrlSceneResult = { id: string; title: string; deleted: boolean };

type UrlSearchQueryResult = {
  [key: `perf_${number}`]: { performers: UrlPerformerResult[] } | null;
} & {
  [key: `scene_${number}`]: { scenes: UrlSceneResult[] } | null;
};

// A submitted URL that already resolves to an existing (non-deleted)
// performer or scene is a strong signal the whole submission is a duplicate
export function buildUrlSearchQuery(urls: string[]): string {
  const fields = urls
    .filter(Boolean)
    .map(
      (url, i) => `
    perf_${i}: searchPerformers(term: ${JSON.stringify(url)}, limit: 5) {
      performers {
        id
        name
        deleted
      }
    }
    scene_${i}: searchScenes(term: ${JSON.stringify(url)}, limit: 5) {
      scenes {
        id
        title
        deleted
      }
    }
  `,
    )
    .join("\n");
  return `{ ${fields} }`;
}

export function parseUrlSearchResponse(
  urls: string[],
  data: UrlSearchQueryResult,
): Map<string, UrlSearchMatch[]> {
  const result = new Map<string, UrlSearchMatch[]>();
  urls.forEach((url, i) => {
    const performers = (data[`perf_${i}`]?.performers ?? [])
      .filter((p) => !p.deleted)
      .map(
        (p): UrlSearchMatch => ({ type: "performer", id: p.id, name: p.name }),
      );
    const scenes = (data[`scene_${i}`]?.scenes ?? [])
      .filter((s) => !s.deleted)
      .map((s): UrlSearchMatch => ({ type: "scene", id: s.id, name: s.title }));

    const matches = [...performers, ...scenes];
    if (matches.length) result.set(url, matches);
  });
  return result;
}

export async function findDuplicatesByUrl(
  urls: string[],
): Promise<Map<string, UrlSearchMatch[]>> {
  if (!urls.length) return new Map();
  const data = await stashboxQuery<UrlSearchQueryResult>(
    buildUrlSearchQuery(urls),
  );
  return parseUrlSearchResponse(urls, data);
}
