// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { loadFixtureDocument, documentFromHTML } from "../test/fixtures";
import { extractSceneFormData, extractCurrentUrls } from "./scene-form";

describe("extractSceneFormData against the real edit-scene.html page", () => {
  const doc = loadFixtureDocument("edit-scene.html");
  const form = doc.querySelector(".SceneForm")!;
  const data = extractSceneFormData(form);

  it("extracts simple text fields", () => {
    expect(data.title).toBe("Fix My Car & Fix My Pussy");
    expect(data.date).toBe("2026-06-28");
    expect(data.duration).toBe("33:45");
    expect(data.code).toBe("11498317");
  });

  it("extracts the full details text", () => {
    expect(data.details).toMatch(/^When Kylie Jones finds herself/);
  });

  it("extracts empty strings for fields with no value set (no director/production date on this scene)", () => {
    expect(data.director).toBe("");
    expect(data.productionDate).toBe("");
  });

  it("extracts the current studio name", () => {
    expect(data.studioName).toBe("Brazzers Exxtra");
  });

  it("extracts current performers", () => {
    expect(data.performers).toEqual([
      {
        name: "Kylie Jones",
      },
      {
        name: "Francis_x",
        disambiguation: "AnalVids",
        alias: "Francis X",
      },
      {
        name: "Jordi El Nino Polla",
      },
    ]);
  });

  it("extracts current tags", () => {
    expect(data.tags.length).toBeGreaterThan(0);
    expect(data.tags).toContain("4K Available");
    expect(data.tags).toContain("Facial");
    expect(data.tags).toContain("Threesome (BBG)");
  });

  it("extracts the current submitted URLs", () => {
    expect(extractCurrentUrls(form)).toEqual([
      "https://theporndb.net/scenes/brazzersexxtra-fix-my-car-fix-my-pussy",
      "https://www.brazzers.com/video/11498317/fix-my-car-fix-my-pussy",
    ]);
    expect(data.urls).toEqual(extractCurrentUrls(form));
  });
});

describe("extractSceneFormData against an empty form", () => {
  it("returns empty/default values for fields with no matching row at all", () => {
    const emptyDoc = documentFromHTML('<form class="SceneForm"></form>');
    const empty = extractSceneFormData(emptyDoc.querySelector(".SceneForm")!);
    expect(empty.title).toBe("");
    expect(empty.performers).toEqual([]);
    expect(empty.tags).toEqual([]);
  });
});
