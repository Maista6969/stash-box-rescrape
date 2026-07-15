// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { loadFixtureDocument } from "../test/fixtures";
import { extractPerformerFormData } from "./performer-form";

describe("extractPerformerFormData against the real edit-performer.html page", () => {
  const doc = loadFixtureDocument("edit-performer.html");
  const form = doc.querySelector(".PerformerForm")!;
  const data = extractPerformerFormData(form);

  it("extracts simple text fields", () => {
    expect(data.name).toBe("Apolonia Lapiedra");
    expect(data.birthDate).toBe("1992-04-27");
    expect(data.eyeColor).toBe("BLUE");
    expect(data.hairColor).toBe("BLONDE");
    expect(data.height).toBe("161");
    expect(data.ethnicity).toBe("CAUCASIAN");
    expect(data.careerStart).toBe("2015");
  });

  it("extracts empty strings for fields with no value set (no disambiguation, alive, no career end)", () => {
    expect(data.disambiguation).toBe("");
    expect(data.deathDate).toBe("");
    expect(data.careerEnd).toBe("");
  });

  it("extracts the country from the react-select, even though it isn't a named field", () => {
    expect(data.nationality).toBe("Spain");
  });

  it("extracts a list of aliases", () => {
    expect(data.aliases).toEqual(["Apolonia"]);
  });

  it("extracts the measurements input group", () => {
    expect(data.measurements).toEqual({
      bandSize: "32",
      cupSize: "A",
      waistSize: "24",
      hipSize: "33",
    });
  });

  it("extracts gender/breastType selects by their raw option value, not display label", () => {
    expect(data.gender).toBe("FEMALE");
    expect(data.breastType).toBe("NATURAL");
  });
});
