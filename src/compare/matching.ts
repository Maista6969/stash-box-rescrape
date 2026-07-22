import type {
  AliasInfo,
  PerformerAliasInfo,
  PerformerCandidate,
} from "../stashbox/graphql";
import { compareLoose, type CompareResult, type FieldStatus } from "./compare";

const normalize = (name: string) => name.toLowerCase().trim();

const stripSpacing = (name: string) => name.trim().replace(/\s+/g, "");

// When a scraped entity (performer, tag or studio) already exists
// on the stash-box scene, either via its canonical name or through an alias
//
// For example if the scene Ice Cream Party already has the performers
// "Bonzo the Clown" and "Banana" (primary name Bonzo Jr.) and the scrape
// contains "Bonzo the Clown" and "Banana" they would be represented as such
// [
//   {
//     scraped: "Bonzo the Clown",
//     canonical: "Bonzo the Clown",
//     via: "name"
//   },
//   {
//     scraped: "Banana",
//     canonical: "Bonzo Jr.",
//     via: "alias"
//   }
// ]
export type MatchedEntity = {
  scraped: string;
  canonical: string;
  // Guess is only valid for performers when they're either scraped
  // with a first name and the current scene already has a performer
  // with the same first name and also a last name OR vice versa
  // Scraped Harlee, scene has Harlee Rose
  // Scraped Cruella Naked, scene has Cruella
  via: "name" | "alias" | "guess";
};

// A name that was scraped is a known performer in the stash-box
// but didn't exist on the scene
export type MissingEntity = {
  scraped: string;
  canonical: string;
};

// A scraped name matched more than one performer like with Nicole Sweet
// we cannot tell which one is correct so we show a list of links to make
// it easier for the reviewer to decide which, if any, is the correct match
export type AmbiguousEntity = {
  scraped: string;
  candidates: PerformerCandidate[];
};

export type PerformerMatchResult = {
  // Scraped performers already on the list, matched by name or a known alias
  alreadyPresentPerformers: MatchedEntity[];
  // Scraped performers not on the list, but recognized as an alias of a known performer
  missingPerformers: MissingEntity[];
  // Scraped performer names the stash-box has no record of at all
  unknownPerformers: string[];
  // Scraped performer names that matched more than one stash-box performer
  ambiguousPerformers: AmbiguousEntity[];
};

export function matchPerformers(
  scrapedPerformers: string[],
  currentPerformers: string[],
  aliasMap: Map<string, PerformerAliasInfo>,
): PerformerMatchResult {
  const result: PerformerMatchResult = {
    alreadyPresentPerformers: [],
    missingPerformers: [],
    unknownPerformers: [],
    ambiguousPerformers: [],
  };

  for (const scrapedName of scrapedPerformers) {
    // Exact case-sensitive primary name match
    const exactMatch = currentPerformers.find((cp) => cp === scrapedName);
    if (exactMatch) {
      result.alreadyPresentPerformers.push({
        scraped: scrapedName,
        canonical: exactMatch,
        via: "name",
      });
      continue;
    }

    // Exact alias match
    // Anna DeVille matches as Anna DeVille because she has that case-different alias for a reason
    const scrapedEntry = aliasMap.get(scrapedName);
    if (scrapedEntry) {
      const isExplicitAlias = scrapedEntry.aliases.some(
        (a) => stripSpacing(a) === stripSpacing(scrapedName),
      );
      if (isExplicitAlias) {
        const canonicalMatch = currentPerformers.find(
          (cp) => cp === scrapedEntry.canonical,
        );
        // The current performer may be listed under the alias itself
        // (e.g. a spacing variant) rather than the canonical name
        const aliasMatch = currentPerformers.find((cp) =>
          scrapedEntry.aliases.some(
            (a) => stripSpacing(a) === stripSpacing(cp),
          ),
        );
        const match = canonicalMatch ?? aliasMatch;
        if (match) {
          result.alreadyPresentPerformers.push({
            scraped: scrapedName,
            canonical: match,
            via: "alias",
          });
          continue;
        }
      }
    }

    // Nearly exact if we disregard whitespace
    const spacingMatch = currentPerformers.find(
      (cp) => stripSpacing(cp) === stripSpacing(scrapedName),
    );
    if (spacingMatch) {
      result.alreadyPresentPerformers.push({
        scraped: scrapedName,
        canonical: spacingMatch,
        via: "name",
      });
      continue;
    }

    // Case-insensitive name match
    // Anna Deville matches Anna DeVille
    const looseMatch = currentPerformers.find(
      (cp) => normalize(cp) === normalize(scrapedName),
    );
    if (looseMatch) {
      result.alreadyPresentPerformers.push({
        scraped: scrapedName,
        canonical: looseMatch,
        via: "name",
      });
      continue;
    }

    // Known alias of a current performer
    const aliasOfCurrent = currentPerformers
      .map((current) => {
        const entry = aliasMap.get(current);
        const aliasHit = entry?.aliases.find(
          (a) => normalize(a) === normalize(scrapedName),
        );
        return aliasHit ? { current, aliasHit } : null;
      })
      .find(Boolean);
    if (aliasOfCurrent) {
      result.alreadyPresentPerformers.push({
        scraped: scrapedName,
        canonical: aliasOfCurrent.current,
        via: "alias",
      });
      continue;
    }

    // Single-name guesses
    // Scraped Harlee is probably currently present Harlee Rose
    if (!/\s/.test(scrapedName.trim())) {
      const firstNameMatches = currentPerformers.filter(
        (cp) => normalize(cp.split(/\s+/)[0]) === normalize(scrapedName),
      );
      if (firstNameMatches.length === 1) {
        result.alreadyPresentPerformers.push({
          scraped: scrapedName,
          canonical: firstNameMatches[0],
          via: "guess",
        });
        continue;
      }
    }

    // Full name guesses
    // Scraped Cruella Naked is probably currently present Cruella
    if (/\s/.test(scrapedName.trim())) {
      const scrapedFirstWord = normalize(scrapedName.trim().split(/\s+/)[0]);
      const bareNameMatches = currentPerformers.filter(
        (cp) => !/\s/.test(cp.trim()) && normalize(cp) === scrapedFirstWord,
      );
      if (bareNameMatches.length === 1) {
        result.alreadyPresentPerformers.push({
          scraped: scrapedName,
          canonical: bareNameMatches[0],
          via: "guess",
        });
        continue;
      }
    }

    // Finally, a genuinely missing performer - unless the name matched more
    // than one stash-box performer, in which case we can't confidently say
    // which one is missing
    if (scrapedEntry?.candidates) {
      result.ambiguousPerformers.push({
        scraped: scrapedName,
        candidates: scrapedEntry.candidates,
      });
    } else if (scrapedEntry) {
      // We cannot trust alias matches here since aliases are not unique
      const isPrimaryNameMatch =
        normalize(scrapedEntry.canonical) === normalize(scrapedName);
      const isUncorroboratedBareAlias =
        !isPrimaryNameMatch && !/\s/.test(scrapedName.trim());
      if (isUncorroboratedBareAlias) {
        result.unknownPerformers.push(scrapedName);
      } else {
        result.missingPerformers.push({
          scraped: scrapedName,
          canonical: scrapedEntry.canonical,
        });
      }
    } else {
      // Or we have no idea who this could be
      result.unknownPerformers.push(scrapedName);
    }
  }

  return result;
}

export function mergeSceneAliases(
  currentPerformers: { name: string; alias?: string | null }[],
  aliasMap: Map<string, PerformerAliasInfo>,
): Map<string, PerformerAliasInfo> {
  const merged = new Map(aliasMap);
  for (const { name, alias } of currentPerformers) {
    const sceneAlias = alias?.trim();
    if (!sceneAlias) continue;

    const existing = merged.get(name);
    if (!existing) {
      merged.set(name, { canonical: name, aliases: [sceneAlias] });
    } else if (
      !existing.aliases.some((a) => normalize(a) === normalize(sceneAlias))
    ) {
      merged.set(name, {
        ...existing,
        aliases: [...existing.aliases, sceneAlias],
      });
    }
  }
  return merged;
}

export type MentionSource = "title" | "details";

export function findMention(
  name: string,
  title: string | null | undefined,
  details: string | null | undefined,
): MentionSource | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  if (title && title.toLowerCase().includes(needle)) return "title";
  if (details && details.toLowerCase().includes(needle)) return "details";
  return null;
}

export function isGloballyKnownAlias(
  canonicalName: string,
  alias: string,
  globalAliasMap: Map<string, AliasInfo>,
): boolean {
  const entry = globalAliasMap.get(canonicalName);
  if (!entry) return false;
  return entry.aliases.some((a) => normalize(a) === normalize(alias));
}

export type TagMatchResult = {
  // Scraped tags that are already present, either by exact name or an alias
  alreadyPresentTags: MatchedEntity[];
  // Scraped tags known to stash-box (so we know their canonical name) but not yet on the scene
  missingTags: MissingEntity[];
  // Scraped tag names stash-box has no record of at all
  unknownTags: string[];
};

export function matchTags(
  scrapedTags: string[],
  currentTags: string[],
  aliasMap: Map<string, AliasInfo>,
): TagMatchResult {
  const result: TagMatchResult = {
    alreadyPresentTags: [],
    missingTags: [],
    unknownTags: [],
  };

  for (const scraped of scrapedTags) {
    const direct = currentTags.find(
      (ct) => normalize(ct) === normalize(scraped),
    );
    if (direct) {
      result.alreadyPresentTags.push({
        scraped,
        canonical: direct,
        via: "name",
      });
      continue;
    }

    const entry = aliasMap.get(scraped);
    if (!entry) {
      result.unknownTags.push(scraped);
      continue;
    }

    const canonicalMatch = currentTags.find(
      (ct) => normalize(ct) === normalize(entry.canonical),
    );
    if (canonicalMatch) {
      result.alreadyPresentTags.push({
        scraped,
        canonical: canonicalMatch,
        via: "alias",
      });
    } else {
      result.missingTags.push({ scraped, canonical: entry.canonical });
    }
  }

  return result;
}

export type TagRowData = {
  name: string;
  color: string;
  text: string;
  title: string | null;
  addableCanonicalName: string | null;
};

// Puts the most actionable tags on top: they're missing but we know what they
// are thanks to either direct name or alias matches when searching stash-box tags
export function buildTagRows({
  alreadyPresentTags,
  missingTags,
  unknownTags,
}: TagMatchResult): TagRowData[] {
  const missingRows: TagRowData[] = missingTags.map(
    ({ scraped, canonical }) => ({
      name: scraped,
      color: "#22c5af",
      text: `+ ${scraped}`,
      title: canonical,
      addableCanonicalName: canonical,
    }),
  );

  const unknownRows: TagRowData[] = unknownTags.map((tagName) => ({
    name: tagName,
    color: "#f97316",
    text: `? ${tagName}`,
    title: "Unable to match tag",
    addableCanonicalName: null,
  }));

  const existingRows: TagRowData[] = alreadyPresentTags.map(
    ({ scraped, canonical, via }) => ({
      name: canonical,
      color: "#22c55e",
      text: `✓ ${canonical}`,
      title: via === "alias" ? `Scraped as ${scraped}` : null,
      addableCanonicalName: null,
    }),
  );

  const byName = (a: TagRowData, b: TagRowData) => a.name.localeCompare(b.name);

  return [
    ...missingRows.toSorted(byName),
    ...unknownRows.toSorted(byName),
    ...existingRows.toSorted(byName),
  ];
}

// In the same order as the current list of performers on the edit card
export type PerformerRowViewModel =
  | {
      kind: "matched";
      scraped: string;
      currentName: string;
      via: MatchedEntity["via"];
      aliasAlreadySet: boolean;
      isUnregisteredSceneAlias: boolean;
    }
  | { kind: "missing"; scraped: string; canonicalName: string }
  | { kind: "unknown"; scraped: string }
  | { kind: "ambiguous"; scraped: string; candidates: PerformerCandidate[] };

// Sometimes we can recognize a performer if they're mentioned in the title / details
export type UnmatchedCurrentPerformer = {
  name: string;
  mention: MentionSource | null;
};

export type PerformerRowsResult = {
  rows: PerformerRowViewModel[];
  // Current performers the scrape's performer list didn't confirm, in form order
  unmatchedCurrent: UnmatchedCurrentPerformer[];
  overallStatus: FieldStatus;
};

export function computePerformerRows(
  currentPerformers: { name: string; aliasInputValue: string | null }[],
  scrapedPerformers: string[],
  aliasMap: Map<string, PerformerAliasInfo>,
  title: string | null | undefined,
  details: string | null | undefined,
): PerformerRowsResult {
  const sceneAwareAliasMap = mergeSceneAliases(
    currentPerformers.map((p) => ({ name: p.name, alias: p.aliasInputValue })),
    aliasMap,
  );

  const {
    alreadyPresentPerformers,
    missingPerformers,
    unknownPerformers,
    ambiguousPerformers,
  } = matchPerformers(
    scrapedPerformers,
    currentPerformers.map((p) => p.name),
    sceneAwareAliasMap,
  );

  const currentByName = new Map(currentPerformers.map((p) => [p.name, p]));

  const rows: PerformerRowViewModel[] = [
    ...alreadyPresentPerformers.map((r): PerformerRowViewModel => {
      const current = currentByName.get(r.canonical);
      const aliasAlreadySet =
        r.via === "alias" && current?.aliasInputValue != null
          ? normalize(current.aliasInputValue) === normalize(r.scraped)
          : false;
      const isUnregisteredSceneAlias =
        r.via === "alias" &&
        !isGloballyKnownAlias(r.canonical, r.scraped, aliasMap);
      return {
        kind: "matched",
        scraped: r.scraped,
        currentName: r.canonical,
        via: r.via,
        aliasAlreadySet,
        isUnregisteredSceneAlias,
      };
    }),
    ...missingPerformers.map(
      (r): PerformerRowViewModel => ({
        kind: "missing",
        scraped: r.scraped,
        canonicalName: r.canonical,
      }),
    ),
    ...unknownPerformers.map(
      (name): PerformerRowViewModel => ({
        kind: "unknown",
        scraped: name,
      }),
    ),
    ...ambiguousPerformers.map(
      (r): PerformerRowViewModel => ({
        kind: "ambiguous",
        scraped: r.scraped,
        candidates: r.candidates,
      }),
    ),
  ];

  const matchedNames = new Set(
    alreadyPresentPerformers.map((r) => r.canonical),
  );
  const unmatchedCurrent: UnmatchedCurrentPerformer[] = currentPerformers
    .filter((cp) => !matchedNames.has(cp.name))
    .map((cp) => ({
      name: cp.name,
      mention: findMention(cp.name, title, details),
    }));

  const hasUncertainMatches = alreadyPresentPerformers.some(
    (r) => r.via === "alias" || r.via === "guess",
  );
  const hasMissing =
    missingPerformers.length > 0 || ambiguousPerformers.length > 0;
  const hasExtra = unknownPerformers.length > 0;
  const overallStatus = hasMissing
    ? ("diff" as const)
    : hasExtra
      ? ("approx" as const)
      : hasUncertainMatches
        ? ("approx" as const)
        : ("match" as const);

  return { rows, unmatchedCurrent, overallStatus };
}

export type AlignedPerformerRow =
  | {
      kind: "matched";
      scraped: string;
      canonical: string;
      via: MatchedEntity["via"];
    }
  | { kind: "unmatched-original"; name: string; mention: MentionSource | null }
  | {
      kind: "extra";
      scraped: string;
      canonical: string | null;
      isAlias: boolean;
    }
  | { kind: "ambiguous"; scraped: string; candidates: PerformerCandidate[] };

export function computePerformerAlignment(
  originalNames: string[],
  scrapedNames: string[],
  matchResult: PerformerMatchResult,
  title: string | null | undefined,
  details: string | null | undefined,
): AlignedPerformerRow[] {
  const {
    alreadyPresentPerformers,
    missingPerformers,
    unknownPerformers,
    ambiguousPerformers,
  } = matchResult;

  const matchByCanonical = new Map(
    alreadyPresentPerformers.map((r) => [r.canonical, r]),
  );
  const canonicalByScraped = new Map<string, string | null>([
    ...missingPerformers.map((m) => [m.scraped, m.canonical] as const),
    ...unknownPerformers.map((name) => [name, null] as const),
  ]);
  const candidatesByScraped = new Map(
    ambiguousPerformers.map((a) => [a.scraped, a.candidates] as const),
  );

  const usedScrapedNames = new Set<string>();
  const alignedRows: AlignedPerformerRow[] = [];

  for (const originalName of originalNames) {
    const match = matchByCanonical.get(originalName);
    if (match) {
      usedScrapedNames.add(match.scraped);
      alignedRows.push({
        kind: "matched",
        scraped: match.scraped,
        canonical: match.canonical,
        via: match.via,
      });
    } else {
      alignedRows.push({
        kind: "unmatched-original",
        name: originalName,
        mention: findMention(originalName, title, details),
      });
    }
  }
  for (const name of scrapedNames) {
    if (usedScrapedNames.has(name)) continue;
    const candidates = candidatesByScraped.get(name);
    if (candidates) {
      alignedRows.push({ kind: "ambiguous", scraped: name, candidates });
      continue;
    }
    const canonical = canonicalByScraped.get(name) ?? null;
    alignedRows.push({
      kind: "extra",
      scraped: name,
      canonical,
      isAlias: canonical !== null && normalize(canonical) !== normalize(name),
    });
  }

  return alignedRows;
}

export type StudioMatchResult = {
  // Whether the current studio matched the scraped one via a known alias
  matchedViaAlias: boolean;
  // The name we should suggest setting the studio to, if any
  canonicalName: string | null;
};

export function resolveStudioAlias(
  currentStudioName: string,
  scrapedStudioName: string,
  aliasMap: Map<string, AliasInfo>,
): StudioMatchResult {
  const scrapedLower = normalize(scrapedStudioName);

  const currentEntry = aliasMap.get(currentStudioName);
  if (currentEntry) {
    const matchesCanonical = normalize(currentEntry.canonical) === scrapedLower;
    const matchesAlias = currentEntry.aliases.some(
      (a) => normalize(a) === scrapedLower,
    );
    if (matchesCanonical || matchesAlias) {
      return { matchedViaAlias: true, canonicalName: currentEntry.canonical };
    }
  }

  const scrapedEntry = aliasMap.get(scrapedStudioName);
  if (scrapedEntry) {
    return { matchedViaAlias: false, canonicalName: scrapedEntry.canonical };
  }

  return { matchedViaAlias: false, canonicalName: null };
}

export function stripStudioParentAnnotation(name: string): string {
  return name.replace(/\s*\([^()]*\)\s*$/, "").trim();
}

export function relaxStudioComparison(
  currentName: string | null | undefined,
  scrapedName: string | null | undefined,
  initial: CompareResult,
): CompareResult {
  const result = (() => {
    if (initial.status === "match" || !currentName || !scrapedName) {
      return initial;
    }
    const stripped = stripStudioParentAnnotation(currentName);
    if (stripped === currentName.trim()) return initial;
    return compareLoose(stripped, scrapedName);
  })();

  return result.status === "approx" ? { status: "match" } : result;
}
