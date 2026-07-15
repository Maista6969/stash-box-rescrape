import { describe, it, expect } from "vitest";
import {
  mapFakeTitsToBreastType,
  compareCompoundSelectField,
  buildAliasRows,
} from "./performer-results";

describe("mapFakeTitsToBreastType", () => {
  it("maps natural-indicating phrasing to NATURAL", () => {
    expect(mapFakeTitsToBreastType("Natural")).toBe("NATURAL");
    expect(mapFakeTitsToBreastType("No")).toBe("NATURAL");
    expect(mapFakeTitsToBreastType("all natural")).toBe("NATURAL");
  });

  it("maps augmented-indicating phrasing to FAKE", () => {
    expect(mapFakeTitsToBreastType("Yes")).toBe("FAKE");
    expect(mapFakeTitsToBreastType("Fake")).toBe("FAKE");
    expect(mapFakeTitsToBreastType("Augmented")).toBe("FAKE");
    expect(mapFakeTitsToBreastType("Silicone implants")).toBe("FAKE");
  });

  it("maps unknown-indicating phrasing to NA", () => {
    expect(mapFakeTitsToBreastType("N/A")).toBe("NA");
    expect(mapFakeTitsToBreastType("Unknown")).toBe("NA");
  });

  it("returns null (rather than guessing) for unrecognized phrasing", () => {
    expect(mapFakeTitsToBreastType("Maybe")).toBeNull();
    expect(mapFakeTitsToBreastType("")).toBeNull();
  });
});

describe("compareCompoundSelectField", () => {
  it("upgrades a hair_color diff to approx when the current option is mentioned in the compound description", () => {
    expect(
      compareCompoundSelectField(
        "diff",
        "hair_color",
        "Blond",
        "Black/Blond/Red/Light Brown",
      ),
    ).toBe("approx");
  });

  it("upgrades an ethnicity diff to approx when the current option is mentioned", () => {
    expect(
      compareCompoundSelectField(
        "diff",
        "ethnicity",
        "Caucasian",
        "Mixed-race (primarily Caucasian)",
      ),
    ).toBe("approx");
  });

  it("leaves diff as-is when the current option isn't mentioned", () => {
    expect(
      compareCompoundSelectField("diff", "hair_color", "Red", "Black/Blond"),
    ).toBe("diff");
  });

  it("leaves diff as-is for fields other than hair_color/ethnicity", () => {
    expect(
      compareCompoundSelectField("diff", "gender", "Male", "Male/Female"),
    ).toBe("diff");
  });

  it("leaves a non-diff status untouched", () => {
    expect(
      compareCompoundSelectField("match", "hair_color", "Blond", "Blond"),
    ).toBe("match");
  });

  it("doesn't upgrade when there's no current label to check against", () => {
    expect(
      compareCompoundSelectField("diff", "hair_color", undefined, "Blond"),
    ).toBe("diff");
  });
});

describe("buildAliasRows", () => {
  it("marks scraped aliases not on the form as missing, sorted by name", () => {
    const result = buildAliasRows(["Zoe", "Amy"], []);
    expect(result.status).toBe("missing");
    expect(result.rows).toEqual([
      { name: "Amy", isMissing: true },
      { name: "Zoe", isMissing: true },
    ]);
  });

  it("marks a current alias also present in the scrape as existing, not missing", () => {
    const result = buildAliasRows(["Amy"], ["amy"]);
    expect(result.status).toBe("match");
    expect(result.rows).toEqual([{ name: "amy", isMissing: false }]);
  });

  it("drops a current alias the scrape doesn't mention entirely", () => {
    const result = buildAliasRows(["Amy"], ["Amy", "Zoe"]);
    expect(result.rows).toEqual([{ name: "Amy", isMissing: false }]);
  });

  it("puts missing rows before existing rows", () => {
    const result = buildAliasRows(["New", "Existing"], ["Existing"]);
    expect(result.rows).toEqual([
      { name: "New", isMissing: true },
      { name: "Existing", isMissing: false },
    ]);
  });
});
