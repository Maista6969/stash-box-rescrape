import { diffWordsWithSpace, type ChangeObject } from "diff";
import type { SizedImage } from "../scraper-shared/types";

// Describes the relationship between origin data (already on stash-box) and
// scraped data (from a Stash scraper), for a single field
export type FieldStatus =
  // Exact match
  | "match"
  // Mismatch, for fields like title/details/studio code where we show a diff
  | "diff"
  // Origin is missing data that the scraper returned
  | "missing"
  // Approximate match: used for images (only comparable by dimensions)
  // and for fields that are equal ignoring case/punctuation/whitespace
  | "approx"
  // Origin contains data that does not appear in the scrape results
  // like manually identified performers or tags
  | "additional";

export type CompareResult = {
  status: FieldStatus;
  diff?: ChangeObject<string>[];
};

// From the guidelines for StashDB
// "Titles should be unaltered from the original studio source in spelling, capitalization, grammar, and punctuation"
// https://guidelines.stashdb.org/docs/scenes/edit/scene-title/correcting-scene-titles/
export function compareExact(
  current: string | null | undefined,
  scraped: string | null | undefined,
): CompareResult {
  const a = current?.trim() ?? "";
  const b = scraped?.trim() ?? "";

  if (!a && !b) return { status: "match" };
  if (!b) return { status: "additional" };
  if (!a) return { status: "missing" };
  if (a === b) return { status: "match" };

  return { status: "diff", diff: diffWordsWithSpace(a, b) };
}

// Used for tags, performers, studio names: any field that's not plain text
// and where the input box will accept any casing
export function compareLoose(
  current: string | null | undefined,
  scraped: string | null | undefined,
): CompareResult {
  const a = current?.trim() ?? "";
  const b = scraped?.trim() ?? "";

  if (!a && !b) return { status: "match" };
  if (!b) return { status: "additional" };
  if (!a) return { status: "missing" };
  if (a === b) return { status: "match" };

  const collator = new Intl.Collator(undefined, {
    ignorePunctuation: true,
    sensitivity: "base",
  });
  if (collator.compare(a, b) === 0) {
    return { status: "approx", diff: diffWordsWithSpace(a, b) };
  }

  return { status: "diff", diff: diffWordsWithSpace(a, b) };
}

export type ArrayCompareResult = {
  status: FieldStatus;
  diff?: string[];
};

export function compareNameArrays(
  current: string[] | null | undefined,
  scraped: string[] | null | undefined,
): ArrayCompareResult {
  const normalize = (items: string[]) =>
    new Set(items.map((item) => item.toLowerCase().trim()));

  const currentArr = current ?? [];
  const scrapedArr = scraped ?? [];

  if (currentArr.length === 0 && scrapedArr.length === 0) {
    return { status: "match" };
  }
  if (scrapedArr.length === 0) {
    return { status: "additional", diff: currentArr.toSorted() };
  }
  if (currentArr.length === 0) {
    return { status: "missing", diff: scrapedArr.toSorted() };
  }

  const currentSet = normalize(currentArr);
  const scrapedSet = normalize(scrapedArr);

  const currentIsSubsetOfScraped = [...currentSet].every((name) =>
    scrapedSet.has(name),
  );
  const scrapedIsSubsetOfCurrent = [...scrapedSet].every((name) =>
    currentSet.has(name),
  );

  if (currentIsSubsetOfScraped && currentSet.size === scrapedSet.size) {
    return { status: "match" };
  }

  if (currentIsSubsetOfScraped) {
    const missing = scrapedArr.filter(
      (name) => !currentSet.has(name.toLowerCase().trim()),
    );
    return { status: "missing", diff: missing.toSorted() };
  }

  if (scrapedIsSubsetOfCurrent) {
    const additional = currentArr.filter(
      (name) => !scrapedSet.has(name.toLowerCase().trim()),
    );
    return { status: "additional", diff: additional.toSorted() };
  }

  const diff = [
    ...currentArr.filter((name) => !scrapedSet.has(name.toLowerCase().trim())),
    ...scrapedArr.filter((name) => !currentSet.has(name.toLowerCase().trim())),
  ];
  return { status: "diff", diff: diff.toSorted() };
}

// For numeric fields where scraped data is often a rounded/converted value
// like height which is often reported in inches and converted to cm
// treats a small difference as "approx" rather than a genuine diff
export function compareApproxNumber(
  current: string | null | undefined,
  scraped: string | null | undefined,
  tolerance: number,
): FieldStatus {
  const a = current?.trim() ?? "";
  const b = scraped?.trim() ?? "";

  if (!a && !b) return "match";
  if (!b) return "additional";
  if (!a) return "missing";
  if (a === b) return "match";

  const aNum = Number(a);
  const bNum = Number(b);
  if (
    !Number.isNaN(aNum) &&
    !Number.isNaN(bNum) &&
    Math.abs(aNum - bNum) <= tolerance
  ) {
    return "approx";
  }

  return "diff";
}

export type MissingUrlsResult = {
  status: FieldStatus;
  missingUrls: string[];
};

// Doesn't usually make sense to diff URLs at the word level
export function computeMissingUrls(
  currentUrls: string[],
  scrapedUrls: string[] | null | undefined,
): MissingUrlsResult {
  const normalize = (url: string) => url.trim().toLowerCase();
  const currentSet = new Set(currentUrls.map(normalize));
  const missingUrls = (scrapedUrls ?? []).filter(
    (url) => url && !currentSet.has(normalize(url)),
  );
  return {
    status: missingUrls.length ? "missing" : "match",
    missingUrls,
  };
}

// Images can only meaningfully be compared by their rendered dimensions
export function compareImageDimensions(
  current: SizedImage | null | undefined,
  scraped: SizedImage | null | undefined,
): FieldStatus {
  if (!current && !scraped) return "match";
  if (!scraped) return "additional";
  if (!current) return "missing";
  return current.width === scraped.width && current.height === scraped.height
    ? "match"
    : "diff";
}
