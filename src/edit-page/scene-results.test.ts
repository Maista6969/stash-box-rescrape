import { describe, it, expect } from "vitest";
import {
  parseAliasTitleAttribute,
  formatDimensionComparison,
} from "./scene-results";

describe("parseAliasTitleAttribute", () => {
  it("splits a bulleted, newline-separated title into individual aliases", () => {
    expect(parseAliasTitleAttribute("• Alias One\n• Alias Two")).toEqual([
      "Alias One",
      "Alias Two",
    ]);
  });

  it("trims whitespace and drops empty lines", () => {
    expect(
      parseAliasTitleAttribute("• Alias One\n\n•   Alias Two  \n"),
    ).toEqual(["Alias One", "Alias Two"]);
  });

  it("handles a single alias with no bullet", () => {
    expect(parseAliasTitleAttribute("Just One Alias")).toEqual([
      "Just One Alias",
    ]);
  });

  it("returns an empty array for an empty title", () => {
    expect(parseAliasTitleAttribute("")).toEqual([]);
  });
});

describe("formatDimensionComparison", () => {
  it("shows only the scraped line when there's nothing existing to compare", () => {
    expect(formatDimensionComparison(null, { width: 1920, height: 1080 })).toBe(
      "scraped: 1920 × 1080",
    );
  });

  it("shows both lines, right-padded to align digits between them", () => {
    const result = formatDimensionComparison(
      { width: 800, height: 600 },
      { width: 1920, height: 1080 },
    );
    expect(result).toBe("current:  800 ×  600\nscraped: 1920 × 1080");
  });

  it("pads the shorter dimension when the scraped one is smaller", () => {
    const result = formatDimensionComparison(
      { width: 1920, height: 1080 },
      { width: 800, height: 600 },
    );
    expect(result).toBe("current: 1920 × 1080\nscraped:  800 ×  600");
  });
});
