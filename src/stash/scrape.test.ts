import { describe, it, expect } from "vitest";
import {
  normalizeStashScrapeResult,
  normalizeStashPerformerResult,
} from "./scrape";

describe("normalizeStashScrapeResult", () => {
  it("flattens studio/performers/tags from {name} objects to plain strings", () => {
    const result = normalizeStashScrapeResult({
      title: "A Scene",
      studio: { name: "Studio A", parent: { name: "Parent Studio" } },
      performers: [{ name: "Jane Doe", gender: "FEMALE" }],
      tags: [{ name: "Teen" }],
    });
    expect(result).toMatchObject({
      title: "A Scene",
      studio: "Studio A",
      performers: ["Jane Doe"],
      tags: ["Teen"],
    });
  });

  it("defaults a null studio to null and missing performers/tags to empty arrays", () => {
    const result = normalizeStashScrapeResult({
      title: "A Scene",
      studio: null,
      performers: null,
      tags: null,
    });
    expect(result.studio).toBeNull();
    expect(result.performers).toEqual([]);
    expect(result.tags).toEqual([]);
  });
});

describe("normalizeStashPerformerResult", () => {
  it("splits a comma-separated aliases string into a trimmed array", () => {
    const result = normalizeStashPerformerResult({
      name: "Jane Doe",
      aliases: "Janie, JD ,Jane",
      country: null,
      measurements: null,
    });
    expect(result.aliases).toEqual(["Janie", "JD", "Jane"]);
  });

  it("returns null aliases when none were scraped", () => {
    const result = normalizeStashPerformerResult({
      name: "Jane Doe",
      aliases: null,
      country: null,
      measurements: null,
    });
    expect(result.aliases).toBeNull();
  });

  it("resolves country and parses measurements via the shared helpers", () => {
    const result = normalizeStashPerformerResult({
      name: "Jane Doe",
      aliases: null,
      country: "USA",
      measurements: "34C-24-34",
    });
    expect(result.country).toBe("United States");
    expect(result.measurements).toMatchObject({
      bandSize: "34",
      cupSize: "C",
      waistSize: "24",
      hipSize: "34",
    });
  });
});
