import { describe, it, expect } from "vitest";
import { parseMeasurements } from "./measurements";

describe("parseMeasurements", () => {
  it("returns null for a null/undefined/empty input", () => {
    expect(parseMeasurements(null)).toBeNull();
    expect(parseMeasurements(undefined)).toBeNull();
    expect(parseMeasurements("")).toBeNull();
  });

  it("parses a standard dash-separated measurements string", () => {
    expect(parseMeasurements("34D-26-34")).toEqual({
      bandSize: "34",
      cupSize: "D",
      waistSize: "26",
      hipSize: "34",
    });
  });

  it("parses a space-separated measurements string", () => {
    expect(parseMeasurements("34D 26 34")).toEqual({
      bandSize: "34",
      cupSize: "D",
      waistSize: "26",
      hipSize: "34",
    });
  });

  it("is case-insensitive on the cup size letter", () => {
    expect(parseMeasurements("34d-26-34")).toMatchObject({ cupSize: "d" });
  });

  it("handles a multi-letter cup size", () => {
    expect(parseMeasurements("34DD-26-34")).toMatchObject({ cupSize: "DD" });
  });

  it("leaves waist/hip null when marked unknown with '?'", () => {
    expect(parseMeasurements("34D-?-34")).toEqual({
      bandSize: "34",
      cupSize: "D",
      waistSize: null,
      hipSize: "34",
    });
    expect(parseMeasurements("34D-26-?")).toEqual({
      bandSize: "34",
      cupSize: "D",
      waistSize: "26",
      hipSize: null,
    });
  });

  it("returns all-null fields when the string doesn't match the expected shape", () => {
    expect(parseMeasurements("not measurements")).toEqual({
      bandSize: null,
      cupSize: null,
      waistSize: null,
      hipSize: null,
    });
  });
});
