import { describe, it, expect } from "vitest";
import {
  normalizeScrapeCiSceneResult,
  normalizeScrapeCiPerformerResult,
} from "./scrape";

describe("normalizeScrapeCiSceneResult", () => {
  it("passes through already-flat studio/performers/tags unchanged", () => {
    const result = normalizeScrapeCiSceneResult({
      title: "A Scene",
      studio: "Studio A",
      performers: ["Jane Doe", "John Smith"],
      tags: ["Teen", "Office"],
    });
    expect(result).toMatchObject({
      studio: "Studio A",
      performers: ["Jane Doe", "John Smith"],
      tags: ["Teen", "Office"],
    });
  });

  it("normalizes a mixed shape (some {name} objects) defensively", () => {
    const result = normalizeScrapeCiSceneResult({
      title: "A Scene",
      studio: { name: "Studio A" },
      performers: ["Jane Doe", { name: "John Smith" }],
      tags: [{ name: "Teen" }, "Office"],
    });
    expect(result).toMatchObject({
      studio: "Studio A",
      performers: ["Jane Doe", "John Smith"],
      tags: ["Teen", "Office"],
    });
  });

  it("defaults a null studio to null and missing performers/tags to empty arrays", () => {
    const result = normalizeScrapeCiSceneResult({
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

describe("normalizeScrapeCiPerformerResult", () => {
  it("parses the combined measurements string and resolves country", () => {
    const result = normalizeScrapeCiPerformerResult({
      name: "Soraya",
      measurements: "34c-30-38",
      country: "BR",
    });
    expect(result.measurements).toMatchObject({
      bandSize: "34",
      waistSize: "30",
      hipSize: "38",
    });
    expect(result.country).toBe("Brazil");
  });

  it("returns null measurements when none were scraped", () => {
    const result = normalizeScrapeCiPerformerResult({
      name: "Soraya",
      measurements: null,
      country: null,
    });
    expect(result.measurements).toBeNull();
    expect(result.country).toBeNull();
  });
});
