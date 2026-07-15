import { describe, it, expect } from "vitest";
import {
  isEmptyScrapedScene,
  isEmptyScrapedPerformer,
  isURLScrapable,
  setScraperPatterns,
} from "./scraper-dispatch";
import type { ScrapedScene, ScrapedPerformer } from "./scraper-shared/types";

const emptyScene: ScrapedScene = {
  title: null,
  code: null,
  details: null,
  urls: null,
  date: null,
  image: null,
  director: null,
  studio: null,
  tags: null,
  performers: null,
};

const emptyPerformer: ScrapedPerformer = {
  name: null,
  gender: null,
  birthdate: null,
  death_date: null,
  ethnicity: null,
  country: null,
  eye_color: null,
  hair_color: null,
  height: null,
  measurements: null,
  fake_tits: null,
  aliases: null,
};

describe("isEmptyScrapedScene", () => {
  it("treats a scene where every field is null/empty as empty", () => {
    expect(isEmptyScrapedScene(emptyScene)).toBe(true);
  });

  it("treats empty arrays the same as null", () => {
    expect(
      isEmptyScrapedScene({
        ...emptyScene,
        urls: [],
        tags: [],
        performers: [],
      }),
    ).toBe(true);
  });

  it("is not empty when a single field has a value", () => {
    expect(isEmptyScrapedScene({ ...emptyScene, title: "Some Title" })).toBe(
      false,
    );
  });

  it("is not empty when only an array field has entries", () => {
    expect(
      isEmptyScrapedScene({ ...emptyScene, performers: ["Someone"] }),
    ).toBe(false);
  });
});

describe("isEmptyScrapedPerformer", () => {
  it("treats a performer where every field is null/empty as empty", () => {
    expect(isEmptyScrapedPerformer(emptyPerformer)).toBe(true);
  });

  it("treats measurements with all-null sub-fields as empty", () => {
    expect(
      isEmptyScrapedPerformer({
        ...emptyPerformer,
        measurements: {
          bandSize: null,
          cupSize: null,
          waistSize: null,
          hipSize: null,
        },
      }),
    ).toBe(true);
  });

  it("is not empty when only a measurement sub-field has a value", () => {
    expect(
      isEmptyScrapedPerformer({
        ...emptyPerformer,
        measurements: {
          bandSize: "34",
          cupSize: null,
          waistSize: null,
          hipSize: null,
        },
      }),
    ).toBe(false);
  });

  it("is not empty when a single field has a value", () => {
    expect(
      isEmptyScrapedPerformer({ ...emptyPerformer, name: "Someone" }),
    ).toBe(false);
  });

  it("is not empty when only aliases has entries", () => {
    expect(
      isEmptyScrapedPerformer({ ...emptyPerformer, aliases: ["Alias"] }),
    ).toBe(false);
  });
});

describe("isURLScrapable", () => {
  const url = "https://example.com/model/123";

  it("without an objectType, a scene pattern on a shared domain can shadow the performer scraper", () => {
    setScraperPatterns(
      [{ scraperName: "ExampleScene", pattern: "example.com" }],
      [{ scraperName: "ExamplePerformer", pattern: "example.com/model" }],
    );
    // Demonstrates the bug this objectType parameter fixes: without it, the
    // scene list is searched first and wins even for a performer URL.
    expect(isURLScrapable(url)?.scraperName).toBe("ExampleScene");
  });

  it("with objectType: 'performer', only the performer pattern list is searched", () => {
    setScraperPatterns(
      [{ scraperName: "ExampleScene", pattern: "example.com" }],
      [{ scraperName: "ExamplePerformer", pattern: "example.com/model" }],
    );
    expect(isURLScrapable(url, "performer")?.scraperName).toBe(
      "ExamplePerformer",
    );
  });

  it("with objectType: 'scene', only the scene pattern list is searched", () => {
    setScraperPatterns(
      [{ scraperName: "ExampleScene", pattern: "example.com" }],
      [{ scraperName: "ExamplePerformer", pattern: "example.com/model" }],
    );
    expect(isURLScrapable(url, "scene")?.scraperName).toBe("ExampleScene");
  });

  it("returns undefined when the objectType-restricted list has no match", () => {
    setScraperPatterns(
      [{ scraperName: "ExampleScene", pattern: "example.com" }],
      [{ scraperName: "Unrelated", pattern: "other-site.com" }],
    );
    expect(isURLScrapable(url, "performer")).toBeUndefined();
  });
});
