import { describe, it, expect } from "vitest";
import {
  matchPerformers,
  matchTags,
  mergeSceneAliases,
  isGloballyKnownAlias,
  resolveStudioAlias,
  stripStudioParentAnnotation,
  relaxStudioComparison,
  computePerformerAlignment,
  computePerformerRows,
  buildTagRows,
  findMention,
} from "./matching";
import { compareLoose } from "./compare";
import type { AliasInfo, PerformerAliasInfo } from "../stashbox/graphql";

describe("matchPerformers", () => {
  it("matches by exact name", () => {
    const current = "Jane Doe";
    const scraped = "jane doe";
    const aliasMap = new Map<string, AliasInfo>([
      ["jane doe", { canonical: "Jane Doe", aliases: ["Jane D.", "J. Doe"] }],
    ]);
    const {
      alreadyPresentPerformers: [match],
      unknownPerformers,
      missingPerformers,
    } = matchPerformers([scraped], [current], aliasMap);

    expect(match).toMatchObject({
      canonical: "Jane Doe",
      via: "name",
      scraped: scraped,
    });
    expect(unknownPerformers).toEqual([]);
    expect(missingPerformers).toEqual([]);
  });

  it("matches via a known alias of a current performer", () => {
    const current = "Jane Doe";
    const scraped = "Jane D.";
    const aliasMap = new Map<string, AliasInfo>([
      ["Jane D.", { canonical: "Jane Doe", aliases: ["Jane D.", "J. Doe"] }],
    ]);
    const {
      alreadyPresentPerformers: [match],
      unknownPerformers,
      missingPerformers,
    } = matchPerformers([scraped], [current], aliasMap);

    expect(match).toMatchObject({
      canonical: current,
      via: "alias",
      scraped: scraped,
    });
    expect(unknownPerformers).toEqual([]);
    expect(missingPerformers).toEqual([]);
  });

  it("reports no match for new performers", () => {
    const scraped = "Totally New Performer";
    const {
      alreadyPresentPerformers,
      unknownPerformers: [match],
      missingPerformers,
    } = matchPerformers([scraped], [], new Map());
    expect(alreadyPresentPerformers).toEqual([]);
    expect(match).toEqual(scraped);
    expect(missingPerformers).toEqual([]);
  });

  it("is case-sensitive when matching by alias", () => {
    const current = "Jane deVille";
    const scraped = "Jane DeVille";
    const aliasMap = new Map<string, AliasInfo>([
      [
        "Jane DeVille",
        { canonical: "Jane deVille", aliases: ["Jane DeVille"] },
      ],
    ]);
    const {
      alreadyPresentPerformers: [match],
      unknownPerformers,
      missingPerformers,
    } = matchPerformers([scraped], [current], aliasMap);
    expect(match).toMatchObject({
      canonical: "Jane deVille",
      via: "alias",
      scraped: scraped,
    });
    expect(unknownPerformers).toEqual([]);
    expect(missingPerformers).toEqual([]);
  });

  it("returns only the scraped performer even if there are more current", () => {
    const current = ["Jane Doe", "Extra Performer"];
    const scraped = "Jane Doe";
    const {
      alreadyPresentPerformers: [match],
      unknownPerformers,
      missingPerformers,
    } = matchPerformers([scraped], current, new Map());
    expect(match).toEqual({
      canonical: "Jane Doe",
      via: "name",
      scraped: scraped,
    });
    expect(unknownPerformers).toEqual([]);
    expect(missingPerformers).toEqual([]);
  });

  it("guesses a single-name credit against the one current performer it matches", () => {
    const {
      alreadyPresentPerformers: [match],
      unknownPerformers,
    } = matchPerformers(["Rosie"], ["Rosie Redd"], new Map());
    expect(match).toEqual({
      scraped: "Rosie",
      canonical: "Rosie Redd",
      via: "guess",
    });
    expect(unknownPerformers).toEqual([]);
  });

  it("does not guess when more than one current performer shares a first name", () => {
    const { alreadyPresentPerformers, unknownPerformers } = matchPerformers(
      ["Rosie"],
      ["Rosie Redd", "Rosie Jones"],
      new Map(),
    );
    expect(alreadyPresentPerformers).toEqual([]);
    expect(unknownPerformers).toEqual(["Rosie"]);
  });

  it("does not guess for a multi-word scraped name", () => {
    const { alreadyPresentPerformers, unknownPerformers } = matchPerformers(
      ["Rosie Smith"],
      ["Rosie Redd"],
      new Map(),
    );
    expect(alreadyPresentPerformers).toEqual([]);
    expect(unknownPerformers).toEqual(["Rosie Smith"]);
  });

  it("matches names that only differ in whitespace", () => {
    const {
      alreadyPresentPerformers: [match],
      unknownPerformers,
    } = matchPerformers(["MoonImp"], ["Moon Imp"], new Map());
    expect(match).toEqual({
      scraped: "MoonImp",
      canonical: "Moon Imp",
      via: "name",
    });
    expect(unknownPerformers).toEqual([]);
  });

  it("prefers an exact alias match over a spacing-only name match", () => {
    const aliasMap = new Map<string, AliasInfo>([
      ["JMac", { canonical: "JMac", aliases: ["J Mac"] }],
    ]);
    const {
      alreadyPresentPerformers: [match],
      unknownPerformers,
    } = matchPerformers(["JMac"], ["J Mac"], aliasMap);
    expect(match).toEqual({
      scraped: "JMac",
      canonical: "J Mac",
      via: "alias",
    });
    expect(unknownPerformers).toEqual([]);
  });

  it("does not treat other punctuation differences as a loose name match, since those are often a deliberately registered alias", () => {
    const aliasMap = new Map<string, AliasInfo>([
      ["Francis_x", { canonical: "Francis_x", aliases: ["Francis X"] }],
    ]);
    const {
      alreadyPresentPerformers: [match],
      unknownPerformers,
    } = matchPerformers(["Francis X"], ["Francis_x"], aliasMap);
    expect(match).toEqual({
      scraped: "Francis X",
      canonical: "Francis_x",
      via: "alias",
    });
    expect(unknownPerformers).toEqual([]);
  });

  it("guesses a single-name scraped credit against a current performer it starts with", () => {
    const {
      alreadyPresentPerformers: [match],
      unknownPerformers,
    } = matchPerformers(["Cruella Naked"], ["Cruella"], new Map());
    expect(match).toEqual({
      scraped: "Cruella Naked",
      canonical: "Cruella",
      via: "guess",
    });
    expect(unknownPerformers).toEqual([]);
  });

  it("does not guess the inverse case against a multi-word current performer", () => {
    const { alreadyPresentPerformers, unknownPerformers } = matchPerformers(
      ["Cruella Naked"],
      ["Cruella De Vil"],
      new Map(),
    );
    expect(alreadyPresentPerformers).toEqual([]);
    expect(unknownPerformers).toEqual(["Cruella Naked"]);
  });

  it("reports a scraped name matching multiple stash-box performers as ambiguous, not missing", () => {
    const candidates = [
      { id: "id-1", name: "Ali Jones", disambiguation: "Los Angeles" },
      { id: "id-2", name: "Ali Jones", disambiguation: null },
    ];
    const aliasMap = new Map<string, PerformerAliasInfo>([
      [
        "Ali Jones",
        { id: "id-1", canonical: "Ali Jones", aliases: [], candidates },
      ],
    ]);
    const { missingPerformers, unknownPerformers, ambiguousPerformers } =
      matchPerformers(["Ali Jones"], [], aliasMap);

    expect(missingPerformers).toEqual([]);
    expect(unknownPerformers).toEqual([]);
    expect(ambiguousPerformers).toEqual([{ scraped: "Ali Jones", candidates }]);
  });

  it("does not suggest a specific performer for a bare single name that only matches via a global alias, with no scene performer to corroborate it", () => {
    // e.g. the scrape returns just "Salvo" and stash-box's only "Salvo" hit
    // is Salvo Nucci's alias - we can never be sure that's who's meant
    const aliasMap = new Map<string, PerformerAliasInfo>([
      ["Salvo", { canonical: "Salvo Nucci", aliases: ["Salvo"] }],
    ]);
    const { missingPerformers, unknownPerformers, ambiguousPerformers } =
      matchPerformers(["Salvo"], [], aliasMap);

    expect(missingPerformers).toEqual([]);
    expect(ambiguousPerformers).toEqual([]);
    expect(unknownPerformers).toEqual(["Salvo"]);
  });

  it("still suggests a missing performer when the bare scraped name is itself the exact registered primary name", () => {
    const aliasMap = new Map<string, PerformerAliasInfo>([
      ["Salvo", { canonical: "Salvo", aliases: [] }],
    ]);
    const { missingPerformers, unknownPerformers } = matchPerformers(
      ["Salvo"],
      [],
      aliasMap,
    );

    expect(missingPerformers).toEqual([
      { scraped: "Salvo", canonical: "Salvo" },
    ]);
    expect(unknownPerformers).toEqual([]);
  });

  it("still suggests a missing performer for a multi-word alias match with no scene corroboration", () => {
    const aliasMap = new Map<string, PerformerAliasInfo>([
      ["Kenley A.", { canonical: "Kenley Asher", aliases: ["Kenley A."] }],
    ]);
    const { missingPerformers, unknownPerformers } = matchPerformers(
      ["Kenley A."],
      [],
      aliasMap,
    );

    expect(missingPerformers).toEqual([
      { scraped: "Kenley A.", canonical: "Kenley Asher" },
    ]);
    expect(unknownPerformers).toEqual([]);
  });

  it("does not flag an ambiguous name as missing/unknown too", () => {
    const aliasMap = new Map<string, PerformerAliasInfo>([
      [
        "Ali Jones",
        {
          id: "id-1",
          canonical: "Ali Jones",
          aliases: [],
          candidates: [
            { id: "id-1", name: "Ali Jones", disambiguation: null },
            { id: "id-2", name: "Ali Jones", disambiguation: null },
          ],
        },
      ],
    ]);
    const result = matchPerformers(["Ali Jones"], [], aliasMap);
    expect(result.ambiguousPerformers).toHaveLength(1);
    expect(result.missingPerformers).toEqual([]);
    expect(result.unknownPerformers).toEqual([]);
  });
});

// Relevant when performers have new aliases and the submitter has included it
// in a scene submission but not yet updated the performer profile itself
describe("mergeSceneAliases", () => {
  it("creates a new alias-map entry from a performer's per-scene alias when they had no prior entry", () => {
    const merged = mergeSceneAliases(
      [{ name: "Francis_x", alias: "Francis X" }],
      new Map(),
    );
    expect(merged.get("Francis_x")).toEqual({
      canonical: "Francis_x",
      aliases: ["Francis X"],
    });
  });

  it("extends an existing alias-map entry with the per-scene alias", () => {
    const aliasMap = new Map<string, AliasInfo>([
      ["Francis_x", { canonical: "Francis_x", aliases: ["FrancisX"] }],
    ]);
    const merged = mergeSceneAliases(
      [{ name: "Francis_x", alias: "Francis X" }],
      aliasMap,
    );
    expect(merged.get("Francis_x")).toEqual({
      canonical: "Francis_x",
      aliases: ["FrancisX", "Francis X"],
    });
  });

  it("does not duplicate an alias the map already has (case-insensitively)", () => {
    const aliasMap = new Map<string, AliasInfo>([
      ["Francis_x", { canonical: "Francis_x", aliases: ["francis x"] }],
    ]);
    const merged = mergeSceneAliases(
      [{ name: "Francis_x", alias: "Francis X" }],
      aliasMap,
    );
    expect(merged.get("Francis_x")!.aliases).toEqual(["francis x"]);
  });

  it("ignores performers with no per-scene alias set", () => {
    const merged = mergeSceneAliases(
      [{ name: "Kylie Jones", alias: "" }, { name: "No Alias Input" }],
      new Map(),
    );
    expect(merged.size).toBe(0);
  });

  it("resolves a scraped credited-as name to a current performer via their per-scene alias alone, with no help from stash-box's global alias database", () => {
    const aliasMap = new Map<string, AliasInfo>();
    const mergedAliasMap = mergeSceneAliases(
      [{ name: "Francis_x", alias: "Francis X" }],
      aliasMap,
    );

    const { alreadyPresentPerformers, unknownPerformers } = matchPerformers(
      ["Francis X"],
      ["Francis_x"],
      mergedAliasMap,
    );

    expect(alreadyPresentPerformers).toEqual([
      { scraped: "Francis X", canonical: "Francis_x", via: "alias" },
    ]);
    expect(unknownPerformers).toEqual([]);
  });

  it("doesn't let a bare disambiguation (misread as a per-scene alias) break matching for that performer or anyone else", () => {
    const current = [
      { name: "Cruella", alias: "Nubiles.net, 2025" },
      { name: "Sunny Nika", alias: "Elly Green" },
    ];
    const mergedAliasMap = mergeSceneAliases(current, new Map());

    const { alreadyPresentPerformers, missingPerformers, unknownPerformers } =
      matchPerformers(
        ["Cruella Naked", "Sunny Nika", "Kenley Asher"],
        ["Cruella", "Sunny Nika"],
        mergedAliasMap,
      );

    expect(alreadyPresentPerformers).toEqual([
      { scraped: "Cruella Naked", canonical: "Cruella", via: "guess" },
      { scraped: "Sunny Nika", canonical: "Sunny Nika", via: "name" },
    ]);
    expect(missingPerformers).toEqual([]);
    expect(unknownPerformers).toEqual(["Kenley Asher"]);
  });
});

describe("isGloballyKnownAlias", () => {
  it("is true when the alias is registered on the performer's global profile", () => {
    const aliasMap = new Map<string, AliasInfo>([
      ["Francis_x", { canonical: "Francis_x", aliases: ["Francis X"] }],
    ]);
    expect(isGloballyKnownAlias("Francis_x", "Francis X", aliasMap)).toBe(true);
  });

  it("is false when the performer has a global profile but this alias isn't on it", () => {
    const aliasMap = new Map<string, AliasInfo>([
      ["Francis_x", { canonical: "Francis_x", aliases: ["FrancisX"] }],
    ]);
    expect(isGloballyKnownAlias("Francis_x", "Francis X", aliasMap)).toBe(
      false,
    );
  });

  it("is false when the performer has no entry in the global alias map at all", () => {
    expect(isGloballyKnownAlias("Francis_x", "Francis X", new Map())).toBe(
      false,
    );
  });

  it("is case-insensitive", () => {
    const aliasMap = new Map<string, AliasInfo>([
      ["Francis_x", { canonical: "Francis_x", aliases: ["francis x"] }],
    ]);
    expect(isGloballyKnownAlias("Francis_x", "Francis X", aliasMap)).toBe(true);
  });
});

describe("matchTags", () => {
  it("classifies an exact-name match as already present", () => {
    const result = matchTags(["4K"], ["4K"], new Map());
    expect(result.alreadyPresentTags).toEqual([
      { scraped: "4K", canonical: "4K", via: "name" },
    ]);
    expect(result.missingTags).toEqual([]);
    expect(result.unknownTags).toEqual([]);
  });

  it("classifies an alias match as already present, referencing the current tag", () => {
    const current = "4K Available";
    const scraped = "4K";
    const aliasMap = new Map<string, AliasInfo>([
      ["4K", { canonical: "4K Available", aliases: ["4K"] }],
    ]);
    const result = matchTags([scraped], [current], aliasMap);
    expect(result.alreadyPresentTags).toEqual([
      { scraped: scraped, canonical: current, via: "alias" },
    ]);
  });

  it("classifies a known-but-absent tag as missing, with its canonical name", () => {
    const scraped = "4K";
    const aliasMap = new Map<string, AliasInfo>([
      ["4K", { canonical: "4K Available", aliases: ["4K"] }],
    ]);
    const result = matchTags([scraped], [], aliasMap);
    expect(result.missingTags).toEqual([
      { scraped: scraped, canonical: "4K Available" },
    ]);
  });

  it("classifies a completely unrecognized tag name as unknown", () => {
    const result = matchTags(["Not A Real Tag"], [], new Map());
    expect(result.unknownTags).toEqual(["Not A Real Tag"]);
  });
});

describe("resolveStudioAlias", () => {
  it("matches when the scraped name is a known alias of the current studio", () => {
    const aliasMap = new Map<string, AliasInfo>([
      ["Studio Name", { canonical: "Studio Name", aliases: ["studioname"] }],
    ]);
    const result = resolveStudioAlias("Studio Name", "studioname", aliasMap);
    expect(result).toEqual({
      matchedViaAlias: true,
      canonicalName: "Studio Name",
    });
  });

  it("still confirms a real alias relationship even when compareLoose already calls the pair 'approx'", () => {
    const current = "ExCoGigirls";
    const scraped = "ExCoGi Girls";
    expect(compareLoose(current, scraped).status).toBe("approx");

    const aliasMap = new Map<string, AliasInfo>([
      [current, { canonical: current, aliases: [scraped] }],
    ]);
    const result = resolveStudioAlias(current, scraped, aliasMap);
    expect(result).toEqual({ matchedViaAlias: true, canonicalName: current });
  });

  it("matches when the scraped name equals the current studio's canonical name via a differently-cased lookup", () => {
    const aliasMap = new Map<string, AliasInfo>([
      ["Studio Name", { canonical: "Studio Name", aliases: [] }],
    ]);
    const result = resolveStudioAlias("Studio Name", "STUDIO NAME", aliasMap);
    expect(result.matchedViaAlias).toBe(true);
  });

  it("suggests the canonical name when the scraped name is itself known but unrelated to the current studio", () => {
    const aliasMap = new Map<string, AliasInfo>([
      [
        "scrapedname",
        { canonical: "Scraped Studio", aliases: ["scrapedname"] },
      ],
    ]);
    const result = resolveStudioAlias(
      "Some Other Studio",
      "scrapedname",
      aliasMap,
    );
    expect(result).toEqual({
      matchedViaAlias: false,
      canonicalName: "Scraped Studio",
    });
  });

  it("returns no match when neither name is in the stash-box", () => {
    const result = resolveStudioAlias("Studio A", "Studio B", new Map());
    expect(result).toEqual({ matchedViaAlias: false, canonicalName: null });
  });
});

describe("stripStudioParentAnnotation", () => {
  it("strips a trailing parenthetical network annotation", () => {
    expect(stripStudioParentAnnotation("NadeNasty (ManyVids)")).toBe(
      "NadeNasty",
    );
  });

  it("leaves a name with no parenthetical suffix unchanged", () => {
    expect(stripStudioParentAnnotation("NadeNasty")).toBe("NadeNasty");
  });

  it("only strips a trailing suffix, not parens in the middle of the name", () => {
    expect(stripStudioParentAnnotation("Studio (UK) Productions")).toBe(
      "Studio (UK) Productions",
    );
  });
});

describe("relaxStudioComparison", () => {
  it("upgrades a mismatch to match once the parenthetical network suffix is stripped and the names are otherwise identical", () => {
    const result = relaxStudioComparison("NadeNasty (ManyVids)", "NadeNasty", {
      status: "diff",
    });
    expect(result.status).toBe("match");
  });

  it("upgrades a mismatch straight to match when stripping the suffix leaves only a case difference", () => {
    // Unlike compareLoose's usual approx status, studio names differing
    // only by spacing/casing/punctuation are treated as the same studio
    const result = relaxStudioComparison("nadenasty (ManyVids)", "NadeNasty", {
      status: "diff",
    });
    expect(result.status).toBe("match");
  });

  it("upgrades a direct approx match (no stripping needed) straight to match too", () => {
    const initial = compareLoose("Fuck Studies", "FuckStudies");
    expect(initial.status).toBe("approx");
    expect(
      relaxStudioComparison("Fuck Studies", "FuckStudies", initial),
    ).toEqual({ status: "match" });
  });

  it("leaves the result untouched when it's already a match", () => {
    const initial = { status: "match" as const };
    expect(relaxStudioComparison("NadeNasty", "NadeNasty", initial)).toBe(
      initial,
    );
  });

  it("leaves the result untouched when there's no parenthetical suffix to strip", () => {
    const initial = { status: "diff" as const };
    expect(
      relaxStudioComparison("Totally Different Studio", "NadeNasty", initial),
    ).toBe(initial);
  });

  it("still reports a genuine mismatch after stripping the annotation", () => {
    const result = relaxStudioComparison(
      "Totally Different Studio (ManyVids)",
      "NadeNasty",
      { status: "diff" },
    );
    expect(result.status).toBe("diff");
  });

  it("leaves the result untouched when either name is missing", () => {
    const initial = { status: "diff" as const };
    expect(relaxStudioComparison(null, "NadeNasty", initial)).toBe(initial);
    expect(relaxStudioComparison("NadeNasty (ManyVids)", null, initial)).toBe(
      initial,
    );
  });
});

describe("findMention", () => {
  it("finds a case-insensitive mention in the title", () => {
    expect(findMention("Kenley Asher", "KENLEY ASHER's Big Day", null)).toBe(
      "title",
    );
  });

  it("finds a mention in the details when not in the title", () => {
    expect(
      findMention("Kenley Asher", "A Great Scene", "Featuring Kenley Asher"),
    ).toBe("details");
  });

  it("prefers the title when the name appears in both", () => {
    expect(
      findMention("Kenley Asher", "Kenley Asher's Big Day", "Kenley Asher"),
    ).toBe("title");
  });

  it("returns null when the name appears in neither", () => {
    expect(findMention("Kenley Asher", "A Great Scene", "No one here")).toBe(
      null,
    );
  });

  it("returns null for a blank name rather than matching everything", () => {
    expect(findMention("  ", "Anything at all", null)).toBe(null);
  });

  it("handles null/undefined title and details", () => {
    expect(findMention("Kenley Asher", null, undefined)).toBe(null);
  });
});

// most performers are chaotic good
describe("computePerformerAlignment", () => {
  it("aligns a matched performer to its original row, in original order", () => {
    const rows = computePerformerAlignment(
      ["Jane Doe", "John Smith"],
      ["jane doe", "john smith"],
      {
        alreadyPresentPerformers: [
          { scraped: "jane doe", canonical: "Jane Doe", via: "name" },
          { scraped: "john smith", canonical: "John Smith", via: "name" },
        ],
        missingPerformers: [],
        unknownPerformers: [],
        ambiguousPerformers: [],
      },
      null,
      null,
    );
    expect(rows).toEqual([
      {
        kind: "matched",
        scraped: "jane doe",
        canonical: "Jane Doe",
        via: "name",
      },
      {
        kind: "matched",
        scraped: "john smith",
        canonical: "John Smith",
        via: "name",
      },
    ]);
  });

  it("marks an original performer the scrape didn't find as unmatched, with no mention", () => {
    const rows = computePerformerAlignment(
      ["Jane Doe"],
      [],
      {
        alreadyPresentPerformers: [],
        missingPerformers: [],
        unknownPerformers: [],
        ambiguousPerformers: [],
      },
      "Some Other Title",
      null,
    );
    expect(rows).toEqual([
      { kind: "unmatched-original", name: "Jane Doe", mention: null },
    ]);
  });

  it("marks an original performer the scrape didn't find but mentions in the title/details", () => {
    const rows = computePerformerAlignment(
      ["Kenley Asher"],
      [],
      {
        alreadyPresentPerformers: [],
        missingPerformers: [],
        unknownPerformers: [],
        ambiguousPerformers: [],
      },
      "Kenley Asher's Wild Night",
      null,
    );
    expect(rows).toEqual([
      { kind: "unmatched-original", name: "Kenley Asher", mention: "title" },
    ]);
  });

  it("appends a known-but-missing scraped performer as an extra row with a real alias relationship", () => {
    const rows = computePerformerAlignment(
      [],
      ["Kenley A."],
      {
        alreadyPresentPerformers: [],
        missingPerformers: [
          { scraped: "Kenley A.", canonical: "Kenley Asher" },
        ],
        unknownPerformers: [],
        ambiguousPerformers: [],
      },
      null,
      null,
    );
    expect(rows).toEqual([
      {
        kind: "extra",
        scraped: "Kenley A.",
        canonical: "Kenley Asher",
        isAlias: true,
      },
    ]);
  });

  it("does not call it an alias when the canonical name is exactly the scraped name", () => {
    const rows = computePerformerAlignment(
      [],
      ["Rob Hudson"],
      {
        alreadyPresentPerformers: [],
        missingPerformers: [{ scraped: "Rob Hudson", canonical: "Rob Hudson" }],
        unknownPerformers: [],
        ambiguousPerformers: [],
      },
      null,
      null,
    );
    expect(rows).toEqual([
      {
        kind: "extra",
        scraped: "Rob Hudson",
        canonical: "Rob Hudson",
        isAlias: false,
      },
    ]);
  });

  it("is not fooled by a case-only difference between canonical and scraped either", () => {
    const rows = computePerformerAlignment(
      [],
      ["rob hudson"],
      {
        alreadyPresentPerformers: [],
        missingPerformers: [{ scraped: "rob hudson", canonical: "Rob Hudson" }],
        unknownPerformers: [],
        ambiguousPerformers: [],
      },
      null,
      null,
    );
    expect(rows[0]).toMatchObject({ isAlias: false });
  });

  it("appends a genuinely unknown scraped performer as an extra row with no canonical name", () => {
    const rows = computePerformerAlignment(
      [],
      ["Kenley Asher"],
      {
        alreadyPresentPerformers: [],
        missingPerformers: [],
        unknownPerformers: ["Kenley Asher"],
        ambiguousPerformers: [],
      },
      null,
      null,
    );
    expect(rows).toEqual([
      {
        kind: "extra",
        scraped: "Kenley Asher",
        canonical: null,
        isAlias: false,
      },
    ]);
  });

  it("does not double-count a matched scraped name as an extra row", () => {
    const rows = computePerformerAlignment(
      ["Jane Doe"],
      ["Jane Doe"],
      {
        alreadyPresentPerformers: [
          { scraped: "Jane Doe", canonical: "Jane Doe", via: "name" },
        ],
        missingPerformers: [],
        unknownPerformers: [],
        ambiguousPerformers: [],
      },
      null,
      null,
    );
    expect(rows).toEqual([
      {
        kind: "matched",
        scraped: "Jane Doe",
        canonical: "Jane Doe",
        via: "name",
      },
    ]);
  });

  it("appends an ambiguous scraped performer as its own row, not as an extra", () => {
    const candidates = [
      { id: "id-1", name: "Ali Jones", disambiguation: "Los Angeles" },
      { id: "id-2", name: "Ali Jones", disambiguation: null },
    ];
    const rows = computePerformerAlignment(
      [],
      ["Ali Jones"],
      {
        alreadyPresentPerformers: [],
        missingPerformers: [],
        unknownPerformers: [],
        ambiguousPerformers: [{ scraped: "Ali Jones", candidates }],
      },
      null,
      null,
    );
    expect(rows).toEqual([
      { kind: "ambiguous", scraped: "Ali Jones", candidates },
    ]);
  });

  it("mixes unmatched-original, matched, and extra rows in the expected order", () => {
    const rows = computePerformerAlignment(
      ["Cruella Naked", "Sunny Nika"],
      ["Sunny Nika", "Kenley Asher"],
      {
        alreadyPresentPerformers: [
          { scraped: "Sunny Nika", canonical: "Sunny Nika", via: "name" },
        ],
        missingPerformers: [],
        unknownPerformers: ["Kenley Asher"],
        ambiguousPerformers: [],
      },
      null,
      null,
    );
    expect(rows).toEqual([
      { kind: "unmatched-original", name: "Cruella Naked", mention: null },
      {
        kind: "matched",
        scraped: "Sunny Nika",
        canonical: "Sunny Nika",
        via: "name",
      },
      {
        kind: "extra",
        scraped: "Kenley Asher",
        canonical: null,
        isAlias: false,
      },
    ]);
  });
});

describe("computePerformerRows", () => {
  it("marks an exact-name match with no scene-specific alias state", () => {
    const result = computePerformerRows(
      [{ name: "Jane Doe", aliasInputValue: null }],
      ["Jane Doe"],
      new Map(),
      null,
      null,
    );
    expect(result.rows).toEqual([
      {
        kind: "matched",
        scraped: "Jane Doe",
        currentName: "Jane Doe",
        via: "name",
        aliasAlreadySet: false,
        isUnregisteredSceneAlias: false,
      },
    ]);
    expect(result.unmatchedCurrent).toEqual([]);
    expect(result.overallStatus).toBe("match");
  });

  it("flags aliasAlreadySet when the per-scene alias field already has the credited name", () => {
    const aliasMap = new Map<string, AliasInfo>([
      ["Jane Doe", { canonical: "Jane Doe", aliases: [] }],
    ]);
    const result = computePerformerRows(
      [{ name: "Jane Doe", aliasInputValue: "Janie" }],
      ["Janie"],
      aliasMap,
      null,
      null,
    );
    expect(result.rows).toEqual([
      {
        kind: "matched",
        scraped: "Janie",
        currentName: "Jane Doe",
        via: "alias",
        aliasAlreadySet: true,
        isUnregisteredSceneAlias: true,
      },
    ]);
    expect(result.overallStatus).toBe("approx");
  });

  it("does not flag isUnregisteredSceneAlias when the alias is already globally known", () => {
    const aliasMap = new Map<string, AliasInfo>([
      ["Jane Doe", { canonical: "Jane Doe", aliases: ["Janie"] }],
    ]);
    const result = computePerformerRows(
      [{ name: "Jane Doe", aliasInputValue: "Janie" }],
      ["Janie"],
      aliasMap,
      null,
      null,
    );
    expect(result.rows[0]).toMatchObject({
      isUnregisteredSceneAlias: false,
    });
  });

  it("lists a known-but-missing performer as 'missing' with a canonical name", () => {
    const aliasMap = new Map<string, AliasInfo>([
      ["Kenley Asher", { canonical: "Kenley Asher", aliases: [] }],
    ]);
    const result = computePerformerRows(
      [],
      ["Kenley Asher"],
      aliasMap,
      null,
      null,
    );
    expect(result.rows).toEqual([
      {
        kind: "missing",
        scraped: "Kenley Asher",
        canonicalName: "Kenley Asher",
      },
    ]);
    expect(result.overallStatus).toBe("diff");
  });

  it("lists a genuinely unregistered performer as 'unknown'", () => {
    const result = computePerformerRows(
      [],
      ["Kenley Asher"],
      new Map(),
      null,
      null,
    );
    expect(result.rows).toEqual([{ kind: "unknown", scraped: "Kenley Asher" }]);
    expect(result.overallStatus).toBe("approx");
  });

  it("lists a name matching multiple performers as 'ambiguous' with every candidate, and treats it as a real diff", () => {
    const candidates = [
      { id: "id-1", name: "Ali Jones", disambiguation: "Los Angeles" },
      { id: "id-2", name: "Ali Jones", disambiguation: null },
    ];
    const aliasMap = new Map<string, PerformerAliasInfo>([
      [
        "Ali Jones",
        { id: "id-1", canonical: "Ali Jones", aliases: [], candidates },
      ],
    ]);
    const result = computePerformerRows(
      [],
      ["Ali Jones"],
      aliasMap,
      null,
      null,
    );
    expect(result.rows).toEqual([
      { kind: "ambiguous", scraped: "Ali Jones", candidates },
    ]);
    expect(result.overallStatus).toBe("diff");
  });

  it("lists a current performer the scrape never mentioned as unmatched, with no mention", () => {
    const result = computePerformerRows(
      [{ name: "Jane Doe", aliasInputValue: null }],
      [],
      new Map(),
      "Some Other Title",
      null,
    );
    expect(result.unmatchedCurrent).toEqual([
      { name: "Jane Doe", mention: null },
    ]);
    expect(result.overallStatus).toBe("match");
  });

  it("credits an unmatched current performer mentioned in the scraped details", () => {
    const result = computePerformerRows(
      [{ name: "Kenley Asher", aliasInputValue: null }],
      [],
      new Map(),
      "A Great Scene",
      "featuring Kenley Asher in a cameo",
    );
    expect(result.unmatchedCurrent).toEqual([
      { name: "Kenley Asher", mention: "details" },
    ]);
  });
});

describe("buildTagRows", () => {
  it("puts missing rows first (addable), then unknown, then existing, each sorted by name", () => {
    const rows = buildTagRows({
      alreadyPresentTags: [
        { scraped: "Blowjob", canonical: "Blowjob", via: "name" },
      ],
      missingTags: [
        { scraped: "Anal Sex", canonical: "Anal" },
        { scraped: "Bondage", canonical: "Bondage" },
      ],
      unknownTags: ["Weird Tag"],
    });
    expect(rows).toEqual([
      {
        name: "Anal Sex",
        color: "#22c5af",
        text: "+ Anal Sex",
        title: "Anal",
        addableCanonicalName: "Anal",
      },
      {
        name: "Bondage",
        color: "#22c5af",
        text: "+ Bondage",
        title: "Bondage",
        addableCanonicalName: "Bondage",
      },
      {
        name: "Weird Tag",
        color: "#f97316",
        text: "? Weird Tag",
        title: "Unable to match tag",
        addableCanonicalName: null,
      },
      {
        name: "Blowjob",
        color: "#22c55e",
        text: "✓ Blowjob",
        title: null,
        addableCanonicalName: null,
      },
    ]);
  });

  it("titles an already-present tag matched via alias with the scraped credit", () => {
    const rows = buildTagRows({
      alreadyPresentTags: [
        { scraped: "BJ", canonical: "Blowjob", via: "alias" },
      ],
      missingTags: [],
      unknownTags: [],
    });
    expect(rows[0].title).toBe("Scraped as BJ");
  });
});
