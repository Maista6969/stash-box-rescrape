import { describe, it, expect } from "vitest";
import { EmptyScrapeResultError, ScraperCrashedError } from "./scraper-errors";

describe("EmptyScrapeResultError", () => {
  it("names the failed url in its message", () => {
    const error = new EmptyScrapeResultError("https://example.com/scene/1");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("EmptyScrapeResultError");
    expect(error.message).toContain("https://example.com/scene/1");
  });
});

describe("ScraperCrashedError", () => {
  it("preserves the raw scraper error message", () => {
    const error = new ScraperCrashedError(
      "scraper script error: exit status 69",
    );
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ScraperCrashedError");
    expect(error.message).toBe("scraper script error: exit status 69");
  });
});
