// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { loadFixtureDocument, documentFromHTML } from "../test/fixtures";
import {
  classifyEdit,
  isRelevantEdit,
  extractURLsFromEditCard,
  extractSceneEditCardData,
  extractPerformerEditCardData,
} from "./editcard";

describe("classifyEdit / isRelevantEdit against a real EditCard page", () => {
  const doc = loadFixtureDocument("editcard-performer.html");
  const editCard = doc.querySelector(".EditCard")!;

  it("classifies the fixture as a 'create performer' edit", () => {
    expect(classifyEdit(editCard)).toEqual({
      editType: "create",
      objectType: "performer",
    });
  });

  it("considers create/performer edits relevant", () => {
    const { editType, objectType } = classifyEdit(editCard);
    expect(isRelevantEdit(editType, objectType)).toBe(true);
  });

  it("does not consider modify edits relevant yet", () => {
    expect(isRelevantEdit("modify", "performer")).toBe(false);
  });

  it("does not consider studio/tag edits relevant", () => {
    expect(isRelevantEdit("create", "studio")).toBe(false);
  });

  it("extracts the http(s) links from the fixture's URLChangeRow", () => {
    const urls = extractURLsFromEditCard(editCard);
    expect(urls).toContain("https://www.realitykings.com/model/2797/soraya");
  });
});

describe("extractSceneEditCardData against a real 'create scene' EditCard", () => {
  const doc = loadFixtureDocument("editcard-scene.html");
  const editCard = doc.querySelector(".EditCard")!;
  const data = extractSceneEditCardData(editCard);

  it("extracts simple text fields", () => {
    expect(data.title).toBe("Help Me Shoot Porn");
    expect(data.date).toBe("2023-09-05");
    expect(data.duration).toBe("24:48");
  });

  it("extracts null for a field with no matching row (this scene has no studio code)", () => {
    expect(data.code).toBeNull();
  });

  it("extracts null for director when this scene has no Director row", () => {
    expect(data.director).toBeNull();
  });

  it("extracts the director when a Director row is present", () => {
    const doc = documentFromHTML(`
      <div class="EditCard">
        <div class="mb-2 row">
          <b class="col-2 text-end pt-1">Director</b>
          <div class="col-10"><div class="EditDiff">Jane Director</div></div>
        </div>
      </div>
    `);
    const result = extractSceneEditCardData(doc.querySelector(".EditCard")!);
    expect(result.director).toBe("Jane Director");
  });

  it("extracts the full details text", () => {
    expect(data.details).toMatch(/^Lizzy asks her older stepbrother Conor/);
  });

  it("extracts the studio name from the linked EditDiff", () => {
    expect(data.studio).toBe("TeamSkeet X StepHousehold");
  });

  it("extracts performers in order", () => {
    expect(data.performers).toEqual([
      { name: "Alina Voss", alias: null },
      { name: "Conor Coxxx", alias: null },
    ]);
  });

  it("keeps the credited-as display name, with the real name as the alias", () => {
    const doc = documentFromHTML(`
      <div class="EditCard">
        <div class="ListChangeRow-Performers row">
          <div class="col-10">
            <div class="ListChangeRow">
              <ul>
                <li><a href="/performers/e7195cf7-2270-453b-9f86-85403e8a8da7"><span>Anja</span><small class="ms-1 text-small text-muted">(Era)<small class="ms-1 text-small text-muted">(Karups, Sapphic Erotica, 21Sextury)</small></small></a></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    `);
    const result = extractSceneEditCardData(doc.querySelector(".EditCard")!);
    expect(result.performers).toEqual([{ name: "Anja", alias: "Era" }]);
  });

  it("keeps the display name for a bare disambiguation too, since it's indistinguishable from a credited-as real name", () => {
    const doc = documentFromHTML(`
      <div class="EditCard">
        <div class="ListChangeRow-Performers row">
          <div class="col-10">
            <div class="ListChangeRow">
              <ul>
                <li><a href="/performers/1"><span>Cruella</span><small class="ms-1 text-small text-muted">(Nubiles.net, 2025)</small></a></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    `);
    const result = extractSceneEditCardData(doc.querySelector(".EditCard")!);
    expect(result.performers).toEqual([
      { name: "Cruella", alias: "Nubiles.net, 2025" },
    ]);
  });

  it("extracts tags", () => {
    expect(data.tags.length).toBeGreaterThan(0);
    expect(data.tags).toContain("4K Available");
  });

  it("extracts the submitted URL", () => {
    expect(data.urls).toEqual([
      "https://www.teamskeet.com/movies/help-me-shoot-porn",
    ]);
  });

  it("extracts the image and parses its dimensions", () => {
    expect(data.image).toEqual({
      src: "https://stashdb.org/images/b6093b2d-af82-4c64-83c6-05a43c0eadde?size=full",
      width: 765,
      height: 431,
    });
  });

  it("extracts the fingerprint types present on the submission", () => {
    expect(data.fingerprints).toEqual(["OSHASH", "PHASH"]);
  });

  it("returns empty/null values for fields with no matching row at all", () => {
    const emptyDoc = documentFromHTML('<div class="EditCard"></div>');
    const empty = extractSceneEditCardData(
      emptyDoc.querySelector(".EditCard")!,
    );
    expect(empty.date).toBeNull();
    expect(empty.studio).toBeNull();
    expect(empty.image).toBeNull();
    expect(empty.performers).toEqual([]);
    expect(empty.tags).toEqual([]);
    expect(empty.urls).toEqual([]);
    expect(empty.fingerprints).toEqual([]);
  });
});

describe("extractPerformerEditCardData against a real 'create performer' EditCard", () => {
  const doc = loadFixtureDocument("editcard-performer.html");
  const editCard = doc.querySelector(".EditCard")!;
  const data = extractPerformerEditCardData(editCard);

  it("extracts simple text fields", () => {
    expect(data.name).toBe("Soraia");
    expect(data.disambiguation).toBe("Brazilian");
    expect(data.gender).toBe("Female");
    expect(data.birthDate).toBe("1982-04-24");
    expect(data.eye_color).toBe("Brown");
    expect(data.hair_color).toBe("Blond");
    expect(data.height).toBe("183");
    expect(data.breast_type).toBe("Natural");
    expect(data.nationality).toBe("Brazil");
    expect(data.ethnicity).toBe("Latin");
    expect(data.career_start).toBe("2014");
    expect(data.career_end).toBe("2015");
  });

  it("splits comma-separated aliases", () => {
    expect(data.aliases).toEqual(["Soraya", "Natasha"]);
  });

  it("splits the combined bra size into band/cup", () => {
    expect(data.measurements).toEqual({
      bandSize: "34",
      cupSize: "C",
      waistSize: "30",
      hipSize: "38",
    });
  });

  it("extracts tattoos/piercings as unstructured free text (no reliable delimiter to split on)", () => {
    expect(data.tattoos).toHaveLength(1);
    expect(data.tattoos[0]).toMatch(/Lower left abdomen/);
    expect(data.piercings).toEqual(["Navel Right nostril (Stud)"]);
  });

  it("extracts the submitted URL", () => {
    expect(data.urls).toContain(
      "https://www.realitykings.com/model/2797/soraya",
    );
  });

  it("returns empty/null values for fields with no matching row at all", () => {
    const emptyDoc = documentFromHTML('<div class="EditCard"></div>');
    const empty = extractPerformerEditCardData(
      emptyDoc.querySelector(".EditCard")!,
    );
    expect(empty.name).toBe("");
    expect(empty.disambiguation).toBeNull();
    expect(empty.aliases).toEqual([]);
    expect(empty.measurements).toEqual({
      bandSize: null,
      cupSize: null,
      waistSize: null,
      hipSize: null,
    });
    expect(empty.tattoos).toEqual([]);
    expect(empty.piercings).toEqual([]);
    expect(empty.urls).toEqual([]);
    expect(empty.images).toEqual([]);
  });
});
