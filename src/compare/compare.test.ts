import { describe, it, expect } from "vitest";
import {
  compareExact,
  compareCaseInsensitive,
  compareLoose,
  compareImageDimensions,
  compareNameArrays,
  compareApproxNumber,
  computeMissingUrls,
} from "./compare";

describe("compareExact", () => {
  it("matches identical strings", () => {
    expect(compareExact("Big Trouble", "Big Trouble")).toEqual({
      status: "match",
    });
  });

  it("matches when only surrounding whitespace differs", () => {
    expect(compareExact("Big Trouble", "  Big Trouble  ")).toEqual({
      status: "match",
    });
  });

  it("treats casing differences as a diff, not a match", () => {
    const result = compareExact("Big Trouble", "big trouble");
    expect(result.status).toBe("diff");
  });

  it("treats punctuation differences as a diff, not a match", () => {
    const result = compareExact("Big Trouble!", "Big Trouble");
    expect(result.status).toBe("diff");
  });

  it("returns a word-level diff when values differ", () => {
    const { status, diff } = compareExact("A red fox", "A quick fox");
    expect(status).toBe("diff");
    expect(diff).toBeDefined();
    expect(
      diff!.some(
        (part) => part.value.includes("A ") && !part.added && !part.removed,
      ),
    ).toBe(true);
  });

  it("is 'additional' when only the current value has data", () => {
    expect(compareExact("Something", null)).toEqual({ status: "additional" });
    expect(compareExact("Something", "")).toEqual({ status: "additional" });
  });

  it("is 'missing' when only the scraped value has data", () => {
    expect(compareExact(null, "Something")).toEqual({ status: "missing" });
    expect(compareExact("", "Something")).toEqual({ status: "missing" });
  });

  it("matches when both sides are empty/absent", () => {
    expect(compareExact(null, null)).toEqual({ status: "match" });
    expect(compareExact("", "")).toEqual({ status: "match" });
    expect(compareExact(undefined, undefined)).toEqual({ status: "match" });
  });
});

describe("compareCaseInsensitive", () => {
  it("matches identical strings", () => {
    expect(compareCaseInsensitive("2023-09-05", "2023-09-05")).toEqual({
      status: "match",
    });
  });

  it("treats a case-only difference as a full match, not approx", () => {
    expect(compareCaseInsensitive("abc-123", "ABC-123")).toEqual({
      status: "match",
    });
  });

  it("still reports a genuine diff", () => {
    const result = compareCaseInsensitive("abc-123", "xyz-999");
    expect(result.status).toBe("diff");
    expect(result.diff).toBeDefined();
  });

  it("is 'additional' / 'missing' the same way compareExact is", () => {
    expect(compareCaseInsensitive("Director", null)).toEqual({
      status: "additional",
    });
    expect(compareCaseInsensitive(null, "Director")).toEqual({
      status: "missing",
    });
    expect(compareCaseInsensitive(null, null)).toEqual({ status: "match" });
  });
});

describe("compareLoose", () => {
  it("matches identical strings exactly", () => {
    expect(compareLoose("Vixen", "Vixen")).toEqual({ status: "match" });
  });

  it("treats casing-only differences as approximate, not an exact match, but still returns a diff", () => {
    const result = compareLoose("Vixen", "vixen");
    expect(result.status).toBe("approx");
    expect(result.diff).toBeDefined();
  });

  it("treats punctuation-only differences as approximate, but still returns a diff", () => {
    const result = compareLoose("Bang! Surprise", "Bang Surprise");
    expect(result.status).toBe("approx");
    expect(result.diff).toBeDefined();
  });

  it("still reports a real diff when more than case/punctuation differs", () => {
    const result = compareLoose("Brazzers", "Brazzers Network");
    expect(result.status).toBe("diff");
  });

  it("is 'additional' / 'missing' the same way compareExact is", () => {
    expect(compareLoose("Studio", null)).toEqual({ status: "additional" });
    expect(compareLoose(null, "Studio")).toEqual({ status: "missing" });
    expect(compareLoose(null, null)).toEqual({ status: "match" });
  });
});

describe("compareNameArrays", () => {
  it("matches two empty/absent lists", () => {
    expect(compareNameArrays([], [])).toEqual({ status: "match" });
    expect(compareNameArrays(null, undefined)).toEqual({ status: "match" });
  });

  it("matches identical lists regardless of order or casing", () => {
    const current = ["Jane Doe", "John Smith"];
    const scraped = ["john smith", "JANE DOE"];
    expect(compareNameArrays(current, scraped)).toEqual({ status: "match" });
  });

  it("is 'missing' when current has none but scraped has entries", () => {
    const result = compareNameArrays([], ["Jane Doe"]);
    expect(result).toEqual({ status: "missing", diff: ["Jane Doe"] });
  });

  it("is 'additional' when scraped has none but current has entries", () => {
    const result = compareNameArrays(["Jane Doe"], []);
    expect(result).toEqual({ status: "additional", diff: ["Jane Doe"] });
  });

  it("is 'missing' when current is a strict subset of scraped", () => {
    const current = ["Jane Doe"];
    const scraped = ["Jane Doe", "John Smith"];
    const { status, diff } = compareNameArrays(current, scraped);
    expect(status).toBe("missing");
    expect(diff).toBeDefined();
    expect(diff!).toContain("John Smith");
    // expect(diff!).not.toContain("Jane Doe");
  });

  it("is 'additional' when scraped is a strict subset of current", () => {
    const current = ["Jane Doe", "John Smith"];
    const scraped = ["Jane Doe"];
    const result = compareNameArrays(current, scraped);
    expect(result.status).toBe("additional");
  });

  it("is 'diff' when neither list is a subset of the other", () => {
    const current = ["Jane Doe", "Alice"];
    const scraped = ["Jane Doe", "Bob"];
    const result = compareNameArrays(current, scraped);
    expect(result.status).toBe("diff");
  });
});

describe("compareImageDimensions", () => {
  it("matches when both are absent", () => {
    expect(compareImageDimensions(null, null)).toBe("match");
  });

  it("is 'additional' when only current has an image", () => {
    expect(compareImageDimensions({ width: 100, height: 100 }, null)).toBe(
      "additional",
    );
  });

  it("is 'missing' when only scraped has an image", () => {
    expect(compareImageDimensions(null, { width: 100, height: 100 })).toBe(
      "missing",
    );
  });

  it("matches when dimensions are identical", () => {
    const a = { width: 800, height: 600 };
    const b = { width: 800, height: 600 };
    expect(compareImageDimensions(a, b)).toBe("match");
  });

  it("is 'diff' when dimensions differ", () => {
    const a = { width: 800, height: 600 };
    const b = { width: 1024, height: 768 };
    expect(compareImageDimensions(a, b)).toBe("diff");
  });

  it("only cares about dimensions, not src - a SizedImage still works fine", () => {
    const a = { src: "a", width: 800, height: 600 };
    const b = { src: "b", width: 800, height: 600 };
    expect(compareImageDimensions(a, b)).toBe("match");
  });
});

describe("compareApproxNumber", () => {
  it("matches identical numbers", () => {
    expect(compareApproxNumber("161", "161", 2)).toBe("match");
  });

  it("is 'approx' for a small difference within tolerance (e.g. rounding from an inch conversion)", () => {
    expect(compareApproxNumber("161", "160", 2)).toBe("approx");
  });

  it("is 'diff' for a difference outside tolerance", () => {
    expect(compareApproxNumber("161", "150", 2)).toBe("diff");
  });

  it("is 'missing' when only scraped has a value", () => {
    expect(compareApproxNumber(null, "160", 2)).toBe("missing");
  });

  it("is 'additional' when only current has a value", () => {
    expect(compareApproxNumber("161", null, 2)).toBe("additional");
  });

  it("is 'diff' for non-numeric values that don't match exactly", () => {
    expect(compareApproxNumber("tall", "short", 2)).toBe("diff");
  });
});

describe("computeMissingUrls", () => {
  it("matches when every scraped URL is already present (case/whitespace-insensitive)", () => {
    const result = computeMissingUrls(
      ["https://example.com/scene/1 "],
      ["HTTPS://EXAMPLE.COM/scene/1"],
    );
    expect(result).toEqual({ status: "match", missingUrls: [] });
  });

  it("matches when there are no scraped URLs at all", () => {
    expect(computeMissingUrls(["https://example.com/1"], null)).toEqual({
      status: "match",
      missingUrls: [],
    });
    expect(computeMissingUrls(["https://example.com/1"], undefined)).toEqual({
      status: "match",
      missingUrls: [],
    });
  });

  it("returns missing status and the missing URLs, in scraped order", () => {
    const result = computeMissingUrls(
      ["https://a.com/1"],
      ["https://a.com/1", "https://b.com/2", "https://c.com/3"],
    );
    expect(result).toEqual({
      status: "missing",
      missingUrls: ["https://b.com/2", "https://c.com/3"],
    });
  });

  it("ignores falsy entries in the scraped list", () => {
    const result = computeMissingUrls([], ["", "https://a.com/1"]);
    expect(result).toEqual({
      status: "missing",
      missingUrls: ["https://a.com/1"],
    });
  });
});
