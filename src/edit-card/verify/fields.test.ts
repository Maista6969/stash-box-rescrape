// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { documentFromHTML } from "../../test/fixtures";
import {
  addFieldVerificationStatus,
  addPerformerFieldVerificationStatus,
} from "./fields";
import type { StashBoxScene, StashBoxPerformer } from "../../extract/editcard";
import type { ResolvedScrapedScene } from "../../scraper-dispatch";
import type { ScrapedPerformer } from "../../scraper-shared/types";

function rowLabels(editCard: Element): string[] {
  return Array.from(editCard.querySelectorAll(".row")).map(
    (row) => row.querySelector("b")?.textContent?.trim() ?? "",
  );
}

const baseScene: StashBoxScene = {
  title: "Existing Title",
  date: "2024-01-01",
  duration: null,
  performers: [],
  studio: null,
  urls: [],
  code: "ABC123",
  director: null,
  details: null,
  tags: [],
  image: null,
  fingerprints: [],
};

const baseScrapedScene: ResolvedScrapedScene = {
  title: "Existing Title",
  date: "2024-01-01",
  performers: null,
  studio: null,
  urls: null,
  code: "ABC123",
  director: null,
  details: null,
  tags: null,
  image: null,
};

describe("addFieldVerificationStatus - missing field insertion order", () => {
  it("inserts newly-scraped fields in stash-box's own field order, not wherever's convenient", async () => {
    const doc = documentFromHTML(`
      <div class="EditCard">
        <div class="card-body">
          <div class="mb-2 row"><b class="col-2 text-end pt-1">Title</b><div class="col-10"><div class="EditDiff">Existing Title</div></div></div>
          <div class="mb-2 row"><b class="col-2 text-end pt-1">Date</b><div class="col-10"><div class="EditDiff">2024-01-01</div></div></div>
          <div class="mb-2 row"><b class="col-2 text-end pt-1">Studio Code</b><div class="col-10"><div class="EditDiff">ABC123</div></div></div>
        </div>
      </div>
    `);
    const editCard = doc.querySelector(".EditCard")!;

    // Details and Director are scraped but weren't in the submission -
    // stash-box's own order is Title, Date, Details, Director, Studio Code
    const scrapedData: ResolvedScrapedScene = {
      ...baseScrapedScene,
      details: "New Details",
      director: "New Director",
    };

    await addFieldVerificationStatus(
      editCard as HTMLDivElement,
      baseScene,
      scrapedData,
    );

    expect(rowLabels(editCard)).toEqual([
      "Title",
      "Date",
      "Details",
      "Director",
      "Studio Code",
    ]);
  });

  it("appends at the end when nothing later in the field order already has a row", async () => {
    const doc = documentFromHTML(`
      <div class="EditCard">
        <div class="card-body">
          <div class="mb-2 row"><b class="col-2 text-end pt-1">Title</b><div class="col-10"><div class="EditDiff">Existing Title</div></div></div>
        </div>
      </div>
    `);
    const editCard = doc.querySelector(".EditCard")!;

    const scrapedData: ResolvedScrapedScene = {
      ...baseScrapedScene,
      code: "XYZ999",
      title: "Existing Title",
      date: null,
    };
    const originalData: StashBoxScene = {
      ...baseScene,
      code: null,
      date: null,
    };

    await addFieldVerificationStatus(
      editCard as HTMLDivElement,
      originalData,
      scrapedData,
    );

    expect(rowLabels(editCard)).toEqual(["Title", "Studio Code"]);
  });
});

const baseScrapedPerformer: ScrapedPerformer = {
  name: null,
  gender: null,
  birthdate: null,
  death_date: null,
  ethnicity: null,
  country: null,
  eye_color: null,
  hair_color: null,
  height: null,
  measurements: null,
  fake_tits: null,
  aliases: null,
};

const basePerformer: StashBoxPerformer = {
  name: "Jane Doe",
  disambiguation: null,
  aliases: [],
  gender: "Female",
  birthDate: "1990-01-01",
  deathDate: null,
  eye_color: null,
  hair_color: null,
  height: null,
  breast_type: "Unknown",
  measurements: {
    bandSize: null,
    cupSize: null,
    waistSize: null,
    hipSize: null,
  },
  nationality: null,
  ethnicity: null,
  career_start: null,
  career_end: null,
  tattoos: [],
  piercings: [],
  urls: [],
  images: [],
};

describe("addPerformerFieldVerificationStatus - missing field insertion order", () => {
  it("inserts a scraped-but-missing Deathdate between Birthdate and Eye Color, matching stash-box's one-word label", async () => {
    const doc = documentFromHTML(`
      <div class="EditCard">
        <div class="card-body">
          <div class="mb-2 row"><b class="col-2 text-end pt-1">Name</b><div class="col-10"><div class="EditDiff">Jane Doe</div></div></div>
          <div class="mb-2 row"><b class="col-2 text-end pt-1">Birthdate</b><div class="col-10"><div class="EditDiff">1990-01-01</div></div></div>
          <div class="mb-2 row"><b class="col-2 text-end pt-1">Eye Color</b><div class="col-10"><div class="EditDiff">Blue</div></div></div>
        </div>
      </div>
    `);
    const editCard = doc.querySelector(".EditCard")!;

    const originalData: StashBoxPerformer = {
      ...basePerformer,
      eye_color: "Blue",
    };
    const scrapedData: ScrapedPerformer = {
      ...baseScrapedPerformer,
      name: "Jane Doe",
      birthdate: "1990-01-01",
      death_date: "2020-01-01",
      eye_color: "Blue",
    };

    await addPerformerFieldVerificationStatus(
      editCard as HTMLDivElement,
      originalData,
      scrapedData,
    );

    expect(rowLabels(editCard)).toEqual([
      "Name",
      "Birthdate",
      "Deathdate",
      "Eye Color",
    ]);
  });
});
