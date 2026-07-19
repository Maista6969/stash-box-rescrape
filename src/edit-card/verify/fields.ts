import type { StashBoxScene, StashBoxPerformer } from "../../extract/editcard";
import type { ScrapedPerformer } from "../../scraper-shared/types";
import {
  compareExact,
  compareCaseInsensitive,
  compareLoose,
  compareNameArrays,
  type FieldStatus,
  type CompareResult,
  type ArrayCompareResult,
} from "../../compare/compare";
import { appendWordDiff } from "../../ui/diff";
import type { ChangeObject } from "diff";
import { makeToggle } from "../../ui/dom";
import { makeCommentIcon } from "../comments";
import type { ResolvedScrapedScene } from "../../scraper-dispatch";

type FieldComparator<O, S> = {
  compare: (
    orig: O,
    scraped: S,
  ) => CompareResult | ArrayCompareResult | { status: FieldStatus };
  original: (orig: O) => string | string[] | null;
  scraped: (scraped: S) => string | string[] | null;
  commentTemplate?: (scraped: S) => string | null | Promise<string | null>;
};

function renderInlineDiff(
  container: HTMLElement,
  diffResult: unknown,
  scrapedValue: string | string[] | null,
) {
  if (Array.isArray(diffResult) && diffResult.length > 0) {
    if (typeof diffResult[0] === "object") {
      appendWordDiff(container, diffResult as ChangeObject<string>[]);
      return;
    }
    container.textContent = (diffResult as string[]).join(", ");
    return;
  }
  container.textContent = Array.isArray(scrapedValue)
    ? scrapedValue.join(", ") || "(none scraped)"
    : (scrapedValue ?? "(none scraped)");
}

// Field orders from frontend/src/components/editCard/ModifyEdit.tsx
export const SCENE_FIELD_ORDER = [
  "title",
  "date",
  "duration",
  "performers",
  "studio",
  "links",
  "details",
  "director",
  "production date",
  "studio code",
  "tags",
  "images",
  "fingerprints",
];

const PERFORMER_FIELD_ORDER = [
  "name",
  "disambiguation",
  "aliases",
  "gender",
  "birthdate",
  "deathdate",
  "eye color",
  "hair color",
  "height",
  "breast type",
  "bra size",
  "waist size",
  "hip size",
  "nationality",
  "ethnicity",
  "career start",
  "career end",
  "tattoos",
  "piercings",
  "links",
  "images",
];

function findInsertionAnchor(
  editCard: Element,
  label: string,
  fieldOrder: string[],
): Element | null {
  const index = fieldOrder.indexOf(label);
  const laterLabels = index === -1 ? [] : fieldOrder.slice(index + 1);

  const rows = Array.from(editCard.querySelectorAll(".row"));
  for (const laterLabel of laterLabels) {
    const row = rows.find(
      (r) =>
        r.querySelector("b")?.textContent?.trim().toLowerCase() === laterLabel,
    );
    if (row) return row;
  }
  return null;
}

export function createMissingRow(
  editCard: Element,
  label: string,
  displayLabel: string,
  rowClass: string,
  labelClass: string,
  fieldOrder: string[],
): { row: HTMLDivElement; labelEl: HTMLElement; col: HTMLDivElement } {
  const row = document.createElement("div");
  row.className = ["row", rowClass, "rescrape-injected"]
    .filter(Boolean)
    .join(" ");

  const labelEl = document.createElement("b");
  labelEl.className = labelClass;
  labelEl.textContent = displayLabel;
  row.appendChild(labelEl);

  const col = document.createElement("div");
  col.className = "col-10";
  row.appendChild(col);

  const anchor = findInsertionAnchor(editCard, label, fieldOrder);
  if (anchor?.parentElement) {
    anchor.parentElement.insertBefore(row, anchor);
  } else {
    editCard.querySelector(".card-body")?.appendChild(row);
  }

  return { row, labelEl, col };
}

function createMissingFieldRow(
  editCard: Element,
  label: string,
  fieldOrder: string[],
): { row: HTMLDivElement; labelEl: HTMLElement } {
  const displayLabel = label
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  const { row, labelEl } = createMissingRow(
    editCard,
    label,
    displayLabel,
    "mb-2 rescrape-added-row",
    "col-2 text-end pt-1",
    fieldOrder,
  );

  return { row, labelEl };
}

export type FieldRowPresentation =
  | { kind: "match" }
  | { kind: "outright"; status: FieldStatus; commentText: string | null }
  | { kind: "toggle"; status: FieldStatus; commentText: string | null };

export function decideFieldRowPresentation(
  status: FieldStatus,
  hasExistingContent: boolean,
  commentText: string | null,
): FieldRowPresentation {
  if (status === "match") return { kind: "match" };
  return {
    kind: hasExistingContent ? "toggle" : "outright",
    status,
    commentText,
  };
}

async function processFieldRow<O, S>(
  editCard: Element,
  row: HTMLDivElement,
  labelEl: HTMLElement,
  field: FieldComparator<O, S>,
  originalData: O,
  scrapedData: S,
) {
  const comparisonResult = field.compare(originalData, scrapedData);
  const diffResult = "diff" in comparisonResult ? comparisonResult.diff : null;
  const scrapedValue = field.scraped(scrapedData);
  const container = row.querySelector(".col-10") ?? row;

  const originalChildren = Array.from(container.children) as HTMLElement[];

  const commentText =
    comparisonResult.status === "match"
      ? null
      : ((await field.commentTemplate?.(scrapedData)) ?? null);

  const presentation = decideFieldRowPresentation(
    comparisonResult.status,
    originalChildren.length > 0,
    commentText,
  );

  labelEl.classList.add("editcard-field-status", comparisonResult.status);

  if (presentation.kind === "match") return;

  const valueRow = document.createElement("div");
  valueRow.className = "rescrape-value-row rescrape-unwrap-target";
  container.insertBefore(valueRow, originalChildren[0] ?? null);
  originalChildren.forEach((el) => valueRow.appendChild(el));

  const diffView = document.createElement("div");
  diffView.classList.add(
    "rescrape-injected",
    "editcard-inline-diff",
    presentation.status,
  );
  renderInlineDiff(diffView, diffResult, scrapedValue);
  valueRow.appendChild(diffView);

  if (presentation.kind === "toggle") {
    labelEl.classList.add("has-diff");
    diffView.style.display = "none";
    makeToggle(labelEl, false, (showingDiff) => {
      originalChildren.forEach((el) => {
        el.style.display = showingDiff ? "none" : "";
      });
      diffView.style.display = showingDiff ? "block" : "none";
    });
  }

  if (presentation.commentText) {
    valueRow.appendChild(makeCommentIcon(editCard, presentation.commentText));
  }
}

async function applyFieldVerificationStatus<O, S>(
  editCard: Element,
  originalData: O,
  scrapedData: S,
  fieldComparisons: Record<string, FieldComparator<O, S>>,
  fieldOrder: string[],
) {
  const processedLabels = new Set<string>();

  const rows = editCard.querySelectorAll<HTMLDivElement>(".row");
  for (const row of Array.from(rows)) {
    const labelEl = row.querySelector("b");
    if (!labelEl) continue;

    const label = labelEl.textContent?.trim().toLowerCase() ?? "";
    const field = fieldComparisons[label];
    if (!field) continue;

    processedLabels.add(label);
    await processFieldRow(
      editCard,
      row,
      labelEl,
      field,
      originalData,
      scrapedData,
    );
  }

  // Rows that were scraped but not present in the submission
  for (const [label, field] of Object.entries(fieldComparisons)) {
    if (processedLabels.has(label)) continue;

    const scrapedValue = field.scraped(scrapedData);
    const hasScrapedValue = Array.isArray(scrapedValue)
      ? scrapedValue.length > 0
      : !!scrapedValue;
    if (!hasScrapedValue) continue;

    const { row, labelEl } = createMissingFieldRow(editCard, label, fieldOrder);
    await processFieldRow(
      editCard,
      row,
      labelEl,
      field,
      originalData,
      scrapedData,
    );
  }
}

const sceneFieldComparisons: Record<
  string,
  FieldComparator<StashBoxScene, ResolvedScrapedScene>
> = {
  title: {
    compare: (orig, scraped) => compareExact(orig.title, scraped.title),
    original: (orig) => orig.title,
    scraped: (scraped) => scraped.title,
    commentTemplate: (scraped) =>
      scraped.title ? `Title should be \`${scraped.title}\`` : null,
  },
  date: {
    compare: (orig, scraped) => compareCaseInsensitive(orig.date, scraped.date),
    original: (orig) => orig.date,
    scraped: (scraped) => scraped.date,
    commentTemplate: (scraped) =>
      scraped.date ? `Date should be \`${scraped.date}\`` : null,
  },
  // TODO: add duration to Stash scrapers
  details: {
    compare: (orig, scraped) => compareExact(orig.details, scraped.details),
    original: (orig) => orig.details,
    scraped: (scraped) => scraped.details,
    commentTemplate: (scraped) =>
      scraped.details ? `Details should be \`${scraped.details}\`` : null,
  },
  director: {
    compare: (orig, scraped) =>
      compareCaseInsensitive(orig.director, scraped.director),
    original: (orig) => orig.director,
    scraped: (scraped) => scraped.director,
    commentTemplate: (scraped) =>
      scraped.director ? `Director should be \`${scraped.director}\`` : null,
  },
  "studio code": {
    compare: (orig, scraped) => compareCaseInsensitive(orig.code, scraped.code),
    original: (orig) => orig.code,
    scraped: (scraped) => scraped.code,
    commentTemplate: (scraped) =>
      scraped.code ? `Studio code should be \`${scraped.code}\`` : null,
  },
};

function braSizeOf(
  m: {
    bandSize: string | null;
    cupSize: string | null;
  } | null,
): string | null {
  return m?.bandSize && m?.cupSize ? `${m.bandSize}${m.cupSize}` : null;
}

const performerFieldComparisons: Record<
  string,
  FieldComparator<StashBoxPerformer, ScrapedPerformer>
> = {
  name: {
    compare: (orig, scraped) => compareExact(orig.name, scraped.name),
    original: (orig) => orig.name,
    scraped: (scraped) => scraped.name,
  },
  aliases: {
    compare: (orig, scraped) =>
      compareNameArrays(orig.aliases, scraped.aliases),
    original: (orig) => orig.aliases,
    scraped: (scraped) => scraped.aliases,
  },
  gender: {
    compare: (orig, scraped) => compareLoose(orig.gender, scraped.gender),
    original: (orig) => orig.gender,
    scraped: (scraped) => scraped.gender,
  },
  birthdate: {
    compare: (orig, scraped) => compareExact(orig.birthDate, scraped.birthdate),
    original: (orig) => orig.birthDate,
    scraped: (scraped) => scraped.birthdate,
  },
  deathdate: {
    compare: (orig, scraped) =>
      compareExact(orig.deathDate, scraped.death_date),
    original: (orig) => orig.deathDate,
    scraped: (scraped) => scraped.death_date,
  },
  "eye color": {
    compare: (orig, scraped) => compareLoose(orig.eye_color, scraped.eye_color),
    original: (orig) => orig.eye_color,
    scraped: (scraped) => scraped.eye_color,
  },
  "hair color": {
    compare: (orig, scraped) =>
      compareLoose(orig.hair_color, scraped.hair_color),
    original: (orig) => orig.hair_color,
    scraped: (scraped) => scraped.hair_color,
  },
  height: {
    compare: (orig, scraped) => compareExact(orig.height, scraped.height),
    original: (orig) => orig.height,
    scraped: (scraped) => scraped.height,
  },
  "bra size": {
    compare: (orig, scraped) =>
      compareExact(
        braSizeOf(orig.measurements),
        braSizeOf(scraped.measurements),
      ),
    original: (orig) => braSizeOf(orig.measurements),
    scraped: (scraped) => braSizeOf(scraped.measurements),
  },
  "waist size": {
    compare: (orig, scraped) =>
      compareExact(
        orig.measurements.waistSize,
        scraped.measurements?.waistSize ?? null,
      ),
    original: (orig) => orig.measurements.waistSize,
    scraped: (scraped) => scraped.measurements?.waistSize ?? null,
  },
  "hip size": {
    compare: (orig, scraped) =>
      compareExact(
        orig.measurements.hipSize,
        scraped.measurements?.hipSize ?? null,
      ),
    original: (orig) => orig.measurements.hipSize,
    scraped: (scraped) => scraped.measurements?.hipSize ?? null,
  },
  nationality: {
    compare: (orig, scraped) => compareLoose(orig.nationality, scraped.country),
    original: (orig) => orig.nationality,
    scraped: (scraped) => scraped.country,
  },
  ethnicity: {
    compare: (orig, scraped) => compareLoose(orig.ethnicity, scraped.ethnicity),
    original: (orig) => orig.ethnicity,
    scraped: (scraped) => scraped.ethnicity,
  },
};

export async function addFieldVerificationStatus(
  editCard: HTMLDivElement,
  originalData: StashBoxScene,
  scrapedData: ResolvedScrapedScene,
) {
  await applyFieldVerificationStatus(
    editCard,
    originalData,
    scrapedData,
    sceneFieldComparisons,
    SCENE_FIELD_ORDER,
  );
}

export async function addPerformerFieldVerificationStatus(
  editCard: HTMLDivElement,
  originalData: StashBoxPerformer,
  scrapedData: ScrapedPerformer,
) {
  await applyFieldVerificationStatus(
    editCard,
    originalData,
    scrapedData,
    performerFieldComparisons,
    PERFORMER_FIELD_ORDER,
  );
}
