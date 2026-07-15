// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { loadFixtureDocument } from "./test/fixtures";
import {
  extractCurrentPerformerRefs,
  extractCurrentTags,
  extractCurrentStudioName,
} from "./extract/scene-form";
import {
  matchPerformers,
  matchTags,
  mergeSceneAliases,
  isGloballyKnownAlias,
} from "./compare/matching";
import { compareLoose } from "./compare/compare";
import type { AliasInfo } from "./stashbox/graphql";

const form =
  loadFixtureDocument("edit-scene.html").querySelector(".SceneForm")!;

// Real scrapeScene() result for this scene from scrape-CI on 2026-07-10
const scrapedPerformers = ["Jordi El Nino Polla", "Francis X", "Kylie Jones"];
const scrapedStudio = "Brazzers Exxtra";
const scrapedTags = [
  "Brown Hair (Male)",
  "Short Hair (Male)",
  "Brown Hair (Female)",
  "Male Mechanic",
  "4k",
  "2 on 1 (2 Males)",
];

const performerAliasMap = new Map<string, AliasInfo>([
  ["Kylie Jones", { canonical: "Kylie Jones", aliases: [] }],
  ["Francis_x", { canonical: "Francis_x", aliases: ["Francis X"] }],
  [
    "Jordi El Nino Polla",
    {
      canonical: "Jordi El Nino Polla",
      aliases: [
        "Jordi",
        "Jordi El Nio Polla",
        "Jordi El Niño Polla",
        "jordi-el-nino-polla",
        "jordienp",
        "jordienpfree",
        "jordiporn",
      ],
    },
  ],
]);

const tagAliasMap = new Map<string, AliasInfo>([
  [
    "4k",
    {
      canonical: "4K Available",
      aliases: ["4K"],
    },
  ],
  [
    "2 on 1 (2 Males)",
    {
      canonical: "Threesome (BBG)",
      aliases: ["2 on 1", "2 on 1 (2 Males)"],
    },
  ],
]);

describe("scene edit-page: performers", () => {
  const currentPerformers = extractCurrentPerformerRefs(form);

  it("extracts the three current performers from the real form", () => {
    expect(currentPerformers.map((p) => p.name)).toEqual([
      "Kylie Jones",
      "Francis_x",
      "Jordi El Nino Polla",
    ]);
  });

  it("matches all three scraped performers, including the credited-as alias", () => {
    const mergedMap = mergeSceneAliases(
      currentPerformers.map((p) => ({
        name: p.name,
        alias: p.aliasInput?.value,
      })),
      performerAliasMap,
    );
    const { alreadyPresentPerformers, missingPerformers, unknownPerformers } =
      matchPerformers(
        scrapedPerformers,
        currentPerformers.map((p) => p.name),
        mergedMap,
      );

    expect(alreadyPresentPerformers).toEqual(
      expect.arrayContaining([
        {
          scraped: "Jordi El Nino Polla",
          canonical: "Jordi El Nino Polla",
          via: "name",
        },
        { scraped: "Francis X", canonical: "Francis_x", via: "alias" },
        { scraped: "Kylie Jones", canonical: "Kylie Jones", via: "name" },
      ]),
    );
    expect(alreadyPresentPerformers).toHaveLength(3);
    expect(missingPerformers).toEqual([]);
    expect(unknownPerformers).toEqual([]);
  });

  it("recognizes Francis X as a known registered alias", () => {
    expect(
      isGloballyKnownAlias("Francis_x", "Francis X", performerAliasMap),
    ).toBe(true);
  });
});

describe("scene edit-page: studio", () => {
  it("extracts the current studio name", () => {
    expect(extractCurrentStudioName(form)).toBe("Brazzers Exxtra");
  });

  it("matches the scraped studio exactly", () => {
    const result = compareLoose(extractCurrentStudioName(form), scrapedStudio);
    expect(result.status).toBe("match");
  });
});

describe("scene edit-page: tags", () => {
  const currentTags = extractCurrentTags(form);

  it("extracts the current tags from the real form", () => {
    expect(currentTags).toContain("4K Available");
    expect(currentTags).toContain("Threesome (BBG)");
    expect(currentTags.length).toBeGreaterThan(40);
  });

  it("matches tags already present under the exact same name (case-insensitively)", () => {
    const { alreadyPresentTags } = matchTags(
      scrapedTags,
      currentTags,
      tagAliasMap,
    );
    const byExactName = alreadyPresentTags.filter((r) => r.via === "name");
    expect(byExactName.map((r) => r.canonical)).toEqual(
      expect.arrayContaining([
        "Brown Hair (Male)",
        "Short Hair (Male)",
        "Brown Hair (Female)",
      ]),
    );
  });

  it("resolves '4k' and '2 on 1 (2 Males)' to their canonical tags via known aliases", () => {
    const { alreadyPresentTags } = matchTags(
      scrapedTags,
      currentTags,
      tagAliasMap,
    );
    expect(alreadyPresentTags).toEqual(
      expect.arrayContaining([
        { scraped: "4k", canonical: "4K Available", via: "alias" },
        {
          scraped: "2 on 1 (2 Males)",
          canonical: "Threesome (BBG)",
          via: "alias",
        },
      ]),
    );
  });

  it("has no missing tags when every alias-resolved match is already on the scene", () => {
    const { missingTags } = matchTags(scrapedTags, currentTags, tagAliasMap);
    expect(missingTags).toEqual([]);
  });

  it("doesn't recognize oddly specific tags that stash-box doesn't know about", () => {
    const { unknownTags } = matchTags(scrapedTags, currentTags, tagAliasMap);
    expect(unknownTags).toEqual(expect.arrayContaining(["Male Mechanic"]));
  });
});
