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

function stashboxQuery<T>(query: string, variables = {}): Promise<T> {
  const endpoint = window.location.origin + "/graphql";
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "POST",
      url: endpoint,
      responseType: "json",
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ query, variables }),
      onload: ({ status, response }) => {
        if (status !== 200 || response.errors) {
          const msg =
            response?.errors
              ?.map((e: { message: any }) => e.message)
              .join("; ") ?? `HTTP ${status}`;
          return reject(new Error(`StashDB query failed: ${msg}`));
        }
        resolve(response.data);
      },
      onerror: (err) => reject(new Error(`Stash-box request error: ${err}`)),
    });
  });
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
      result.set(name, {
        id: exact.id,
        canonical: exact.name,
        aliases: (exact.aliases ?? []).map((a: string) => a.trim()),
      });
    } else if (searchResults.length) {
      const nameLower = name.toLowerCase().trim();
      const aliasMatch = searchResults.find(({ aliases }) =>
        aliases.some((a: string) => a.toLowerCase().trim() === nameLower),
      );
      if (aliasMatch) {
        result.set(name, {
          id: aliasMatch.id,
          canonical: aliasMatch.name,
          aliases: aliasMatch.aliases.map((a: string) => a.trim()),
        });
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

    result.set(name, {
      id: hit.id,
      canonical: hit.name,
      aliases: (hit.aliases ?? []).map((a: string) => a.trim()),
    });
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

type PerformerQueryResult = SearchMap<{ performers: NameResult[] }>;

export function buildPerformerAliasQuery(names: string[]): string {
  const fields = names
    .map(
      (name, i) => `
    search_${i}: searchPerformers(term: ${JSON.stringify(name)}) {
      performers {
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

export function parsePerformerAliasResponse(
  names: string[],
  data: PerformerQueryResult,
): Map<string, AliasInfo> {
  const result = new Map<string, AliasInfo>();
  names.forEach((name, i) => {
    const hits = data[`search_${i}`]?.performers ?? [];
    const nameLower = name.toLowerCase().trim();
    const match = hits.find(
      (p) =>
        p.name.toLowerCase().trim() === nameLower ||
        (p.aliases ?? []).some(
          (a: string) => a.toLowerCase().trim() === nameLower,
        ),
    );
    if (match) {
      result.set(name, {
        id: match.id,
        canonical: match.name,
        aliases: (match.aliases ?? []).map((a: string) => a.trim()),
      });
    }
  });
  return result;
}

export async function fetchPerformerAliases(
  names: string[],
): Promise<Map<string, AliasInfo>> {
  if (!names.length) return new Map();
  const data = await stashboxQuery<PerformerQueryResult>(
    buildPerformerAliasQuery(names),
  );
  return parsePerformerAliasResponse(names, data);
}
