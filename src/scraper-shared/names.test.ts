import { describe, it, expect } from "vitest";
import { toName } from "./names";

describe("toName", () => {
  it("passes through a plain string unchanged", () => {
    expect(toName("Teen")).toBe("Teen");
  });

  it("flattens a { name } object, as Stash-CI occasionally returns despite documenting flat strings", () => {
    expect(toName({ name: "Teen" })).toBe("Teen");
  });

  it("returns an empty string for null/undefined", () => {
    expect(toName(null)).toBe("");
    expect(toName(undefined)).toBe("");
  });
});
