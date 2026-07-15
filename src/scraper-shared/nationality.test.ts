import { describe, it, expect } from "vitest";
import { guessNationality } from "./nationality";

describe("guessNationality", () => {
  it("returns null for a null/undefined/empty input", () => {
    expect(guessNationality(null)).toBeNull();
    expect(guessNationality(undefined)).toBeNull();
    expect(guessNationality("")).toBeNull();
  });

  it("maps a demonym to its canonical country name", () => {
    expect(guessNationality("American")).toBe("United States");
    expect(guessNationality("Brazilian")).toBe("Brazil");
  });

  it("maps an ISO 3166-1 alpha-2 code, case-insensitively", () => {
    expect(guessNationality("usa")).toBe("United States");
    expect(guessNationality("BR")).toBe("Brazil");
  });

  it("trims surrounding whitespace before matching", () => {
    expect(guessNationality("  American  ")).toBe("United States");
  });

  it("checks each comma-separated entry and returns the first known match", () => {
    expect(guessNationality("Wakandan, American")).toBe("United States");
  });

  it("returns the original string unchanged when no entry is recognized", () => {
    expect(guessNationality("Wakandan")).toBe("Wakandan");
  });
});
