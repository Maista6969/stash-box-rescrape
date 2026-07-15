import { loadConfig } from "../config";
import {
  classifyEdit,
  isRelevantEdit,
  extractSceneEditCardData,
  extractPerformerEditCardData,
  type StashBoxScene,
  type StashBoxPerformer,
} from "../extract/editcard";
import type { ScrapedPerformer, SizedImage } from "../scraper-shared/types";
import {
  compareExact,
  compareLoose,
  compareNameArrays,
  compareImageDimensions,
  computeMissingUrls,
  type FieldStatus,
  type CompareResult,
  type ArrayCompareResult,
} from "../compare/compare";
import { appendWordDiff } from "../ui/diff";
import type { ChangeObject } from "diff";
import { createFontAwesomeIcon, setIconState, setIconTitle } from "../ui/icons";
import { injectSliderIntoLightbox } from "../ui/image-slider";
import {
  matchPerformers,
  computePerformerAlignment,
  resolveStudioAlias,
  relaxStudioComparison,
} from "../compare/matching";
import { fetchPerformerAliases, fetchStudioAliases } from "../stashbox/graphql";
import { makeCommentIcon } from "./comments";
import {
  resolveScraperFailureAction,
  updateScraperPackage,
  buildBrokenScraperReportURL,
  type ScraperPackageInfo,
} from "./scraper-health";
import {
  scrapeScene,
  scrapePerformer,
  isURLScrapable,
  getImageDimensions,
  isEmptyScrapedScene,
  isEmptyScrapedPerformer,
  type ResolvedScrapedScene,
} from "../scraper-dispatch";
import { EmptyScrapeResultError, ScraperCrashedError } from "../scraper-errors";

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

function createMissingFieldRow(
  editCard: Element,
  label: string,
): { row: HTMLDivElement; labelEl: HTMLElement } {
  const displayLabel = label
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  const row = document.createElement("div");
  row.className = "mb-2 row rescrape-added-row rescrape-injected";

  const labelEl = document.createElement("b");
  labelEl.className = "col-2 text-end pt-1";
  labelEl.textContent = displayLabel;
  row.appendChild(labelEl);

  row.appendChild(document.createElement("div")).className = "col-10";

  const anchor =
    editCard.querySelector(".ListChangeRow-Performers.row") ??
    editCard.querySelector(".ImageChangeRow.row") ??
    editCard.querySelector(".ListChangeRow-Fingerprints.row");
  if (anchor?.parentElement) {
    anchor.parentElement.insertBefore(row, anchor);
  } else {
    editCard.querySelector(".card-body")?.appendChild(row);
  }

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
  label: string,
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
  diffView.classList.add("rescrape-injected");
  renderInlineDiff(diffView, diffResult, scrapedValue);
  valueRow.appendChild(diffView);

  if (presentation.kind === "outright") {
    diffView.classList.add("EditDiff");
  } else {
    diffView.classList.add("editcard-inline-diff");
    diffView.style.display = "none";
    labelEl.classList.add("has-diff");
    let showingDiff = false;
    labelEl.onclick = (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      showingDiff = !showingDiff;
      originalChildren.forEach((el) => {
        el.style.display = showingDiff ? "none" : "";
      });
      diffView.style.display = showingDiff ? "block" : "none";
    };
  }

  if (presentation.commentText) {
    valueRow.appendChild(makeCommentIcon(editCard, presentation.commentText));
  }

  console.log(`Field "${label}" verification status: ${presentation.status}`);
}

async function applyFieldVerificationStatus<O, S>(
  editCard: Element,
  originalData: O,
  scrapedData: S,
  fieldComparisons: Record<string, FieldComparator<O, S>>,
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
      label,
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

    const { row, labelEl } = createMissingFieldRow(editCard, label);
    await processFieldRow(
      editCard,
      row,
      labelEl,
      label,
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
      scraped.title ? `Title should be "${scraped.title}"` : null,
  },
  date: {
    compare: (orig, scraped) => compareExact(orig.date, scraped.date),
    original: (orig) => orig.date,
    scraped: (scraped) => scraped.date,
    commentTemplate: (scraped) =>
      scraped.date ? `Date should be ${scraped.date}` : null,
  },
  // TODO: add duration to Stash scrapers
  "studio code": {
    compare: (orig, scraped) => compareExact(orig.code, scraped.code),
    original: (orig) => orig.code,
    scraped: (scraped) => scraped.code,
    commentTemplate: (scraped) =>
      scraped.code ? `Studio code should be "${scraped.code}"` : null,
  },
  details: {
    compare: (orig, scraped) => compareExact(orig.details, scraped.details),
    original: (orig) => orig.details,
    scraped: (scraped) => scraped.details,
    commentTemplate: (scraped) =>
      scraped.details ? `Details should be:\n\`${scraped.details}\n\`` : null,
  },
};

export type ImageComparisonDecision = {
  aspectRatio: string;
  dimsText: string;
  commentText: string;
};

// TODO: Stash currently only returns data URIs, should we PR to make it return the actual
// source URL even if the frontend probably can't resolve it for cross-origin reasons?
export function decideImageComparison(
  scraped: SizedImage,
): ImageComparisonDecision {
  return {
    aspectRatio: `${scraped.width} / ${scraped.height}`,
    dimsText: `${scraped.width} x ${scraped.height}`,
    commentText: scraped.src.startsWith("data:")
      ? "Image doesn't match the official source"
      : `Image should be [official scene cover image](${scraped.src})`,
  };
}

function addImageComparison(
  editCard: Element,
  originalData: StashBoxScene,
  scrapedData: ResolvedScrapedScene,
) {
  const row = editCard.querySelector<HTMLDivElement>(".ImageChangeRow.row");
  const label = row?.querySelector("b");
  if (!row || !label) return;

  const status = compareImageDimensions(originalData.image, scrapedData.image);
  label.classList.add("editcard-field-status", status);

  const scrapedImage = scrapedData.image;
  if (!scrapedImage) return;

  const { aspectRatio, dimsText, commentText } =
    decideImageComparison(scrapedImage);

  let existingImg = row.querySelector<HTMLImageElement>(".Image-image");
  if (existingImg) {
    const clone = existingImg.cloneNode(true) as HTMLImageElement;
    existingImg.replaceWith(clone);
    existingImg = clone;
    existingImg.style.cursor = "zoom-in";
    existingImg.title = "Click to compare with scraped image";
    existingImg.addEventListener("click", () =>
      injectSliderIntoLightbox(existingImg!.src, scrapedImage.src),
    );
  }

  const changeRow = row.querySelector(".ImageChangeRow");
  if (changeRow) {
    changeRow.classList.add("rescrape-image-row");

    const scrapedBlock = document.createElement("div");
    scrapedBlock.className = "ImageChangeRow-image rescrape-injected";

    const imageBox = document.createElement("div");
    imageBox.className = `Image rescrape-scraped-image ${status}`;
    imageBox.style.aspectRatio = aspectRatio;
    imageBox.style.cursor = "zoom-in";
    imageBox.title = "Click to compare with current image";
    imageBox.addEventListener("click", () => {
      existingImg?.closest<HTMLButtonElement>("button.Image")?.click();
      injectSliderIntoLightbox(existingImg?.src ?? "", scrapedImage.src);
    });

    const img = document.createElement("img");
    img.className = "Image-image";
    img.alt = "";
    img.src = scrapedImage.src;
    imageBox.appendChild(img);
    scrapedBlock.appendChild(imageBox);

    const dims = document.createElement("div");
    dims.className = "text-center rescrape-value-row";
    dims.append(dimsText);
    scrapedBlock.appendChild(dims);

    dims.appendChild(makeCommentIcon(editCard, commentText));

    changeRow.appendChild(scrapedBlock);
  }
}

function addUrlComparison(
  editCard: Element,
  originalData: StashBoxScene,
  scrapedData: ResolvedScrapedScene,
) {
  const row = editCard.querySelector<HTMLDivElement>(".URLChangeRow.row");
  const label = row?.querySelector("b");
  const list = row?.querySelector("ul");
  if (!row || !label || !list) return;

  const { status, missingUrls } = computeMissingUrls(
    originalData.urls,
    scrapedData.urls,
  );

  label.classList.add("editcard-field-status", status);
  if (!missingUrls.length) return;

  for (const url of missingUrls) {
    const li = document.createElement("li");
    li.className = "rescrape-additional rescrape-url-item rescrape-injected";

    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "text-break";
    link.textContent = url;
    li.appendChild(link);

    li.appendChild(makeCommentIcon(editCard, `Missing source URL: ${url}`));
    list.appendChild(li);
  }
}

async function addStudioComparison(
  editCard: Element,
  originalData: StashBoxScene,
  scrapedData: ResolvedScrapedScene,
) {
  const row = Array.from(
    editCard.querySelectorAll<HTMLDivElement>(".row"),
  ).find(
    (r) => r.querySelector("b")?.textContent?.trim().toLowerCase() === "studio",
  );
  const label = row?.querySelector("b");
  const container = row?.querySelector<HTMLDivElement>(".col-10");
  const originalContent = container?.querySelector(".EditDiff");
  if (!row || !label || !container || !originalContent) return;

  const initialStudioResult = compareLoose(
    originalData.studio,
    scrapedData.studio,
  );
  let { status } = relaxStudioComparison(
    originalData.studio,
    scrapedData.studio,
    initialStudioResult,
  );

  if (!scrapedData.studio || status === "match") {
    label.classList.add("editcard-field-status", status);
    return;
  }

  let aliasMap = new Map();
  let canonicalName = scrapedData.studio;
  try {
    aliasMap = await fetchStudioAliases(
      originalData.studio
        ? [scrapedData.studio, originalData.studio]
        : [scrapedData.studio],
    );
    if (originalData.studio) {
      const resolved = resolveStudioAlias(
        originalData.studio,
        scrapedData.studio,
        aliasMap,
      );
      if (resolved.canonicalName) canonicalName = resolved.canonicalName;
      if (resolved.matchedViaAlias) status = "match";
    } else {
      canonicalName =
        aliasMap.get(scrapedData.studio)?.canonical ?? scrapedData.studio;
    }
  } catch (err) {
    console.warn("[rescrape] Could not fetch studio alias:", err);
  }

  label.classList.add("editcard-field-status", status);
  if (status === "match") return;

  const info = aliasMap.get(scrapedData.studio);

  const valueRow = document.createElement("div");
  valueRow.className =
    "rescrape-value-row rescrape-studio-compare rescrape-unwrap-target";
  container.insertBefore(valueRow, originalContent);

  originalContent.classList.add("rescrape-missing");
  valueRow.appendChild(originalContent);

  const arrow = document.createElement("span");
  arrow.className = "rescrape-arrow rescrape-injected";
  arrow.textContent = "→";
  valueRow.appendChild(arrow);

  const scrapedLink = document.createElement("a");
  scrapedLink.textContent = canonicalName;
  scrapedLink.classList.add("rescrape-match", "rescrape-injected");
  if (info?.id) {
    scrapedLink.href = `${window.location.origin}/studios/${info.id}`;
    scrapedLink.target = "_blank";
    scrapedLink.rel = "noopener noreferrer";
  }
  valueRow.appendChild(scrapedLink);

  const commentText = info?.id
    ? `Studio should be [${canonicalName}](${window.location.origin}/studios/${info.id})`
    : `Studio should be "${canonicalName}"`;
  valueRow.appendChild(makeCommentIcon(editCard, commentText));
}

async function addPerformerIntegration(
  editCard: Element,
  originalData: StashBoxScene,
  scrapedData: ResolvedScrapedScene,
) {
  const row = editCard.querySelector<HTMLDivElement>(
    ".ListChangeRow-Performers.row",
  );
  const label = row?.querySelector("b");
  const container = row?.querySelector<HTMLDivElement>(".col-10");
  const originalList = container?.querySelector(".ListChangeRow");
  if (!row || !label || !container || !originalList) return;

  if (!scrapedData.performers?.length) {
    label.classList.add(
      "editcard-field-status",
      originalData.performers.length ? "additional" : "match",
    );
    return;
  }

  let aliasMap = new Map();
  try {
    aliasMap = await fetchPerformerAliases([
      ...originalData.performers,
      ...scrapedData.performers,
    ]);
  } catch (err) {
    console.warn("[rescrape] Could not fetch performer aliases:", err);
  }

  const { alreadyPresentPerformers, missingPerformers, unknownPerformers } =
    matchPerformers(scrapedData.performers, originalData.performers, aliasMap);

  const hasMissing =
    missingPerformers.length > 0 || unknownPerformers.length > 0;
  const hasUncertainMatches = alreadyPresentPerformers.some(
    (r) => r.via === "alias" || r.via === "guess",
  );
  const overallStatus: FieldStatus = hasMissing
    ? "diff"
    : hasUncertainMatches
      ? "approx"
      : "match";
  label.classList.add("editcard-field-status", overallStatus);

  const alignedRows = computePerformerAlignment(
    originalData.performers,
    scrapedData.performers,
    { alreadyPresentPerformers, missingPerformers, unknownPerformers },
    scrapedData.title,
    scrapedData.details,
  );

  const originalColumn = document.createElement("div");
  originalColumn.className =
    "rescrape-performers-column rescrape-unwrap-target";
  originalList.insertAdjacentElement("beforebegin", originalColumn);
  originalColumn.appendChild(originalList);

  const scrapedColumn = document.createElement("div");
  scrapedColumn.className = "rescrape-performers-column rescrape-injected";

  const scrapedList = document.createElement("ul");
  scrapedList.className = "rescrape-performers-scraped";

  const performerRef = (name: string, lookupKey: string) => {
    const id = aliasMap.get(lookupKey)?.id;
    return id ? `[${name}](${window.location.origin}/performers/${id})` : name;
  };

  for (const entry of alignedRows) {
    const li = document.createElement("li");

    if (entry.kind === "unmatched-original" && entry.mention) {
      li.classList.add("rescrape-match");
      li.textContent = `✓ mentioned in ${entry.mention}`;
    } else if (entry.kind === "unmatched-original") {
      li.classList.add("rescrape-missing");
      li.textContent = "? not found in scrape";
    } else if (entry.kind === "matched" && entry.via === "name") {
      li.textContent = `✓ ${entry.scraped}`;
      li.classList.add("rescrape-match");
    } else if (entry.kind === "matched") {
      li.classList.add("rescrape-approx");
      const txt = document.createElement("span");
      txt.textContent = `≈ ${entry.scraped}`;
      li.appendChild(txt);

      const badge = document.createElement("span");
      badge.className = "rescrape-performer-badge";

      if (entry.via === "alias") {
        badge.textContent = "⚠ missing alias";
        badge.title = `Scraped as "${entry.scraped}"`;
        li.appendChild(badge);
        li.appendChild(
          makeCommentIcon(
            editCard,
            `Missing scene alias '${entry.scraped}' for ${performerRef(entry.canonical, entry.canonical)}`,
          ),
        );
      } else {
        badge.textContent = "⚠ new alias";
        badge.title = `Credited as "${entry.scraped}" in the scrape which is not a registered alias for ${entry.canonical}`;
        li.appendChild(badge);
      }
    } else if (entry.kind === "extra") {
      li.classList.add("rescrape-missing");
      const txt = document.createElement("span");
      txt.textContent = entry.isAlias
        ? `+ ${entry.scraped} (alias of ${entry.canonical})`
        : `+ ${entry.scraped}`;
      li.appendChild(txt);
      const commentText = entry.isAlias
        ? `Missing performer ${performerRef(entry.canonical!, entry.scraped)}, credited as '${entry.scraped}'`
        : entry.canonical
          ? `Missing performer ${performerRef(entry.canonical, entry.scraped)}`
          : `Missing performer '${entry.scraped}'`;
      li.appendChild(makeCommentIcon(editCard, commentText));
    }

    scrapedList.appendChild(li);
  }

  scrapedColumn.appendChild(scrapedList);
  container.classList.add("rescrape-side-by-side");
  container.appendChild(scrapedColumn);

  let showingComparison = overallStatus !== "match";
  scrapedColumn.style.display = showingComparison ? "" : "none";
  label.classList.add("has-diff");
  label.onclick = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    showingComparison = !showingComparison;
    scrapedColumn.style.display = showingComparison ? "" : "none";
  };
}

async function addFieldVerificationStatus(
  editCard: HTMLDivElement,
  originalData: StashBoxScene,
  scrapedData: ResolvedScrapedScene,
) {
  await applyFieldVerificationStatus(
    editCard,
    originalData,
    scrapedData,
    sceneFieldComparisons,
  );
}

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
  "death date": {
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
};

async function addPerformerFieldVerificationStatus(
  editCard: HTMLDivElement,
  originalData: StashBoxPerformer,
  scrapedData: ScrapedPerformer,
) {
  await applyFieldVerificationStatus(
    editCard,
    originalData,
    scrapedData,
    performerFieldComparisons,
  );
}

function showMissingFingerprintWarning(editCard: Element) {
  const cardBody = editCard.querySelector(".card-body");
  if (!cardBody) return;
  cardBody.querySelector(".rescrape-fingerprint-warning")?.remove();

  const warning = document.createElement("div");
  warning.className = "rescrape-fingerprint-warning";
  warning.textContent = "⚠ Missing PHASH fingerprint";
  cardBody.insertBefore(warning, cardBody.firstChild);
}

function resetPreviousVerification(editCard: Element) {
  const isInjected = (node: Node) =>
    node instanceof Element && node.classList.contains("rescrape-injected");

  editCard.querySelectorAll(".rescrape-unwrap-target").forEach((wrapper) => {
    const parent = wrapper.parentElement;
    if (!parent) return;
    Array.from(wrapper.childNodes).forEach((node) => {
      if (isInjected(node)) {
        (node as Element).remove();
        return;
      }
      if (node instanceof HTMLElement) {
        node.classList.remove(
          "rescrape-match",
          "rescrape-missing",
          "rescrape-approx",
        );
        node.style.display = "";
      }
      parent.insertBefore(node, wrapper);
    });
    wrapper.remove();
  });

  editCard.querySelectorAll(".rescrape-injected").forEach((el) => el.remove());

  editCard
    .querySelectorAll<HTMLElement>("b.editcard-field-status")
    .forEach((label) => {
      label.classList.remove(
        "editcard-field-status",
        "match",
        "diff",
        "missing",
        "additional",
        "approx",
        "has-diff",
      );
      label.onclick = null;
    });
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function classifyFailureReason(error: unknown): string {
  if (error instanceof EmptyScrapeResultError) return "empty result";
  if (error instanceof ScraperCrashedError)
    return `scraper crashed (${error.message})`;
  return describeError(error);
}

async function handleScrapeFailure(
  iconElement: SVGSVGElement,
  editCard: HTMLDivElement,
  url: string,
  objectType: "scene" | "performer",
  scraperName: string,
  mode: "local" | "remote",
  endpoint: string,
  apiKey: string,
  error: unknown,
) {
  iconElement.classList.remove("processing", "verifiable");

  try {
    const action = await resolveScraperFailureAction(
      scraperName,
      mode,
      endpoint,
      apiKey,
    );
    console.debug(
      `[rescrape] Scraper failure action for "${scraperName}" (${mode} mode):`,
      action,
    );

    if (action.kind === "update") {
      setIconState(iconElement, "arrows-rotate");
      iconElement.classList.add("update-available");
      setIconTitle(
        iconElement,
        `Update scraper '${scraperName}' to newest version`,
      );
      iconElement.onclick = (e) => {
        e.preventDefault();
        runScraperUpdate(
          iconElement,
          editCard,
          url,
          objectType,
          scraperName,
          action.pkg,
          endpoint,
          apiKey,
        );
      };
      return;
    }

    if (action.kind === "report-bug") {
      setIconState(iconElement, "bug");
      iconElement.classList.add("report-bug");
      setIconTitle(iconElement, `File bug report for ${scraperName} on GitHub`);
      iconElement.onclick = (e) => {
        e.preventDefault();
        window.open(
          buildBrokenScraperReportURL({
            packageName: action.packageName,
            packageVersion: action.packageVersion,
            objectType,
            url,
            scriptName: GM_info.script.name,
            scriptURL: GM_info.script.homepage || GM_info.script.downloadURL,
            scriptVersion: GM_info.script.version,
            now: new Date(),
          }),
          "_blank",
          "noopener,noreferrer",
        );
      };
      return;
    }

    // We can't figure out a way to help (maybe the scraper is homebrew or otherwise manually installed)
    setIconState(iconElement, "circle-xmark");
    iconElement.classList.add("failed");
    iconElement.onclick = null;
    setIconTitle(
      iconElement,
      `Scraper failed for unknown reason: ${classifyFailureReason(error)}`,
    );
  } catch (healthCheckError) {
    console.error(
      `[rescrape] Unexpected error while checking scraper health for "${scraperName}":`,
      healthCheckError,
    );
    setIconState(iconElement, "circle-xmark");
    iconElement.classList.add("failed");
    iconElement.onclick = null;
    setIconTitle(
      iconElement,
      `Scraper failed for unknown reason: ${classifyFailureReason(error)}`,
    );
  }
}

async function runScraperUpdate(
  iconElement: SVGSVGElement,
  editCard: HTMLDivElement,
  url: string,
  objectType: "scene" | "performer",
  scraperName: string,
  pkg: ScraperPackageInfo,
  endpoint: string,
  apiKey: string,
) {
  iconElement.onclick = null;
  iconElement.classList.remove("update-available");
  iconElement.classList.add("processing");
  setIconState(iconElement, "spinner");
  setIconTitle(iconElement, `Updating "${scraperName}"...`);

  const outcome = await updateScraperPackage(pkg, endpoint, apiKey);
  iconElement.classList.remove("processing");

  if (outcome.ok) {
    setIconState(iconElement, "magnifying-glass");
    iconElement.classList.add("verifiable");
    setIconTitle(iconElement, "Scraper updated: click to rescrape");
    iconElement.onclick = (e) => {
      e.preventDefault();
      verifyURL(url, editCard, iconElement, objectType, scraperName);
    };
    return;
  }

  setIconState(iconElement, "arrows-rotate");
  iconElement.classList.add("update-available");
  setIconTitle(iconElement, `Update failed: ${outcome.reason}: click to retry`);
  iconElement.onclick = (e) => {
    e.preventDefault();
    runScraperUpdate(
      iconElement,
      editCard,
      url,
      objectType,
      scraperName,
      pkg,
      endpoint,
      apiKey,
    );
  };
}

async function verifyURL(
  url: string,
  editCard: HTMLDivElement,
  iconElement: SVGSVGElement,
  objectType: "scene" | "performer",
  scraperName: string,
) {
  iconElement.classList.add("processing");
  setIconState(iconElement, "spinner");

  const config = loadConfig();
  const { endpoint, apiKey } = config[config.mode];

  resetPreviousVerification(editCard);

  try {
    if (objectType === "scene") {
      const originalData = extractSceneEditCardData(editCard);
      if (!originalData.fingerprints.includes("PHASH")) {
        showMissingFingerprintWarning(editCard);
      }
      const scrapedRaw = await scrapeScene(url, endpoint, apiKey, config.mode);
      if (isEmptyScrapedScene(scrapedRaw)) {
        throw new EmptyScrapeResultError(url);
      }
      const scrapedData = await getImageDimensions(scrapedRaw);
      await addFieldVerificationStatus(editCard, originalData, scrapedData);
      addImageComparison(editCard, originalData, scrapedData);
      addUrlComparison(editCard, originalData, scrapedData);
      await addStudioComparison(editCard, originalData, scrapedData);
      await addPerformerIntegration(editCard, originalData, scrapedData);
    } else {
      const originalData = extractPerformerEditCardData(editCard);
      const scrapedData = await scrapePerformer(
        url,
        endpoint,
        apiKey,
        config.mode,
      );
      if (isEmptyScrapedPerformer(scrapedData)) {
        throw new EmptyScrapeResultError(url);
      }
      await addPerformerFieldVerificationStatus(
        editCard,
        originalData,
        scrapedData,
      );
    }
  } catch (error) {
    console.error(`[rescrape] Error scraping ${url}:`, error);
    await handleScrapeFailure(
      iconElement,
      editCard,
      url,
      objectType,
      scraperName,
      config.mode,
      endpoint,
      apiKey,
      error,
    );
    return;
  }
  setIconState(iconElement, "magnifying-glass");
  iconElement.classList.remove("processing");
}

let _rescrapeIconsObserverStarted = false;

export function initEditcardRescrape() {
  if (!_rescrapeIconsObserverStarted) {
    _rescrapeIconsObserverStarted = true;
    new MutationObserver(initEditcardRescrape).observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  const editCards = document.querySelectorAll<HTMLDivElement>(".EditCard");

  editCards.forEach((editCard) => {
    const { editType, objectType } = classifyEdit(editCard);
    if (!isRelevantEdit(editType, objectType)) return;

    const links = editCard.querySelectorAll<HTMLAnchorElement>(
      '.URLChangeRow a[href^="http"][target="_blank"]:not([data-rescrape-processed])',
    );
    if (links.length === 0) return;

    console.log(`Processing ${links.length} links for ${objectType} edit`);

    const backendLabel = loadConfig().mode === "local" ? "Stash" : "Scrape-CI";

    links.forEach((link) => {
      link.setAttribute("data-rescrape-processed", "true");
      const url = link.href;
      const scraperMatch = isURLScrapable(
        url,
        objectType as "scene" | "performer",
      );
      const isVerifiable = !!scraperMatch;
      const icon = createFontAwesomeIcon(
        isVerifiable ? "magnifying-glass" : "circle-xmark",
        isVerifiable ? "verifiable" : "",
        "rescrape-trigger-icon",
      );
      setIconTitle(
        icon,
        isVerifiable
          ? `Scrape using ${backendLabel}`
          : "No scraper installed for this URL",
      );

      if (isVerifiable && scraperMatch) {
        icon.onclick = (e) => {
          e.preventDefault();
          verifyURL(
            url,
            editCard,
            icon,
            objectType as "scene" | "performer",
            scraperMatch.scraperName,
          );
        };
      }
      link.parentNode!.insertBefore(icon, link.parentNode!.firstChild);
      console.log(`Added verification icon for ${objectType} URL: ${url}`);
    });
  });
}

// If the configured endpoint changes we need to replace all scrape icons
export function reloadEditcardScraperIcons() {
  document
    .querySelectorAll(".rescrape-trigger-icon")
    .forEach((icon) => icon.remove());
  document
    .querySelectorAll("[data-rescrape-processed]")
    .forEach((link) => link.removeAttribute("data-rescrape-processed"));
  initEditcardRescrape();
}
