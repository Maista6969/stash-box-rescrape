import type { SizedImage } from "../scraper-shared/types";

export type EditClassification = {
  editType: string;
  objectType: string;
};

export type PerformerCredit = {
  name: string;
  alias: string | null;
};

// Extracted from the rendered page instead of making an extra GraphQL query
// can be extracted from the either an edit page or an editcard in the queue
export type StashBoxScene = {
  title: string;
  date: string | null;
  duration: string | null;
  performers: PerformerCredit[];
  studio: string | null;
  urls: string[];
  code: string | null;
  director: string | null;
  details: string | null;
  tags: string[];
  image: SizedImage | null;
  fingerprints: string[];
};

// Extracted from the rendered page instead of making an extra GraphQL query
// can be extracted from the either an edit page or an editcard in the queue
export type StashBoxPerformer = {
  name: string;
  disambiguation: string | null;
  aliases: string[];
  gender:
    | "Male"
    | "Female"
    | "Transgender Male"
    | "Transgender Female"
    | "Nonbinary";
  birthDate: string | null;
  deathDate: string | null;
  eye_color: string | null;
  hair_color: string | null;
  height: string | null;
  breast_type: "Natural" | "Augmented" | "Unknown" | "N/A";
  measurements: {
    bandSize: string | null;
    cupSize: string | null;
    waistSize: string | null;
    hipSize: string | null;
  };
  nationality: string | null;
  ethnicity: string | null;
  career_start: string | null;
  career_end: string | null;
  tattoos: string[];
  piercings: string[];
  urls: string[];
  images: SizedImage[];
};

export function classifyEdit(editCard: Element): EditClassification {
  const headerText =
    editCard.querySelector(".card-header h5")?.textContent ?? "";
  const [editType = "", objectType = ""] = headerText
    .trim()
    .toLowerCase()
    .split(/\s+/);
  return { editType, objectType };
}

// Userscript currently only verifies "create" edits for scenes and performers
// TODO: consider adding "modify" edits as well, they would need to run a GQL
// query to get the current state of the scene/performer since the modify only
// shows changed fields
export function isRelevantEdit(editType: string, objectType: string): boolean {
  const isValidEditType = editType === "create";
  const isValidObjectType =
    objectType === "scene" || objectType === "performer";
  return isValidEditType && isValidObjectType;
}

function findRowByLabel(editCard: Element, label: string): Element | null {
  const rows = Array.from(editCard.querySelectorAll(".row"));
  return (
    rows.find((row) => row.querySelector("b")?.textContent?.trim() === label) ??
    null
  );
}

function getEditDiffContent(row: Element | null): string | null {
  const editDiff = row?.querySelector(".EditDiff");
  return editDiff ? textContentOf(editDiff) : null;
}

export function extractURLsFromEditCard(editCard: Element): string[] {
  const links = editCard.querySelectorAll<HTMLAnchorElement>(
    '.URLChangeRow a[href^="http"][target="_blank"]',
  );
  return Array.from(links).map((link) => link.href);
}

function extractImageFromEditCard(editCard: Element): SizedImage | null {
  const imageUrl = editCard.querySelector<HTMLImageElement>(
    ".ImageChangeRow .Image-image",
  )?.src;
  if (!imageUrl) return null;

  const dimensionsText =
    editCard.querySelector(".ImageChangeRow .text-center")?.textContent ?? "";
  const match = dimensionsText.match(/(\d+)\s*x\s*(\d+)/i);
  if (!match) return null;

  return { src: imageUrl, width: Number(match[1]), height: Number(match[2]) };
}

// Compatibility with Stash-Checker https://github.com/timo95/stash-checker
function withoutStashCheckerSymbols(elem: Element): Element {
  if (!elem.querySelector(".stashCheckerSymbol")) return elem;
  const clone = elem.cloneNode(true) as Element;
  clone
    .querySelectorAll(".stashCheckerSymbol")
    .forEach((symbol) => symbol.remove());
  return clone;
}

function textContentOf(elem: Element | null): string {
  if (!elem) return "";
  return withoutStashCheckerSymbols(elem).textContent?.trim() ?? "";
}

// Only the outer <small>'s own text, e.g. "(Charles Dera)" - excludes any
// nested <small> stash-box uses for a disambiguation suffix, so a credited
// performer with a disambiguation doesn't glom the two together
function directTextOf(elem: Element): string {
  return Array.from(elem.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join("")
    .trim();
}

function extractPerformerCredits(editCard: Element): PerformerCredit[] {
  const links = editCard.querySelectorAll(".ListChangeRow-Performers li a");
  return Array.from(links).map((link) => {
    const displayName = textContentOf(link.querySelector("span"));
    const small = link.querySelector("small");
    const parenthetical = small
      ? directTextOf(small)
          .replace(/^\(|\)$/g, "")
          .trim()
      : "";
    return { name: displayName, alias: parenthetical || null };
  });
}

export function extractFingerprintTypes(editCard: Element): string[] {
  const links = editCard.querySelectorAll(".ListChangeRow-Fingerprints li a");
  return Array.from(links)
    .map((link) => link.textContent?.trim().split(":")[0]?.trim() ?? "")
    .filter(Boolean);
}

export function extractSceneEditCardData(editCard: Element): StashBoxScene {
  const studioRow = findRowByLabel(editCard, "Studio")?.querySelector(
    ".EditDiff",
  );
  return {
    title: getEditDiffContent(findRowByLabel(editCard, "Title")) ?? "",
    date: getEditDiffContent(findRowByLabel(editCard, "Date")),
    duration: getEditDiffContent(findRowByLabel(editCard, "Duration")),
    performers: extractPerformerCredits(editCard),
    studio: studioRow ? textContentOf(studioRow) : null,
    urls: extractURLsFromEditCard(editCard),
    details: getEditDiffContent(findRowByLabel(editCard, "Details")),
    code: getEditDiffContent(findRowByLabel(editCard, "Studio Code")),
    director: getEditDiffContent(findRowByLabel(editCard, "Director")),
    tags: Array.from(editCard.querySelectorAll(".ListChangeRow-Tags li a")).map(
      textContentOf,
    ),
    image: extractImageFromEditCard(editCard),
    fingerprints: extractFingerprintTypes(editCard),
  };
}

// TODO: tattoos are not structured so it's nearly impossible to figure them out
function textListOf(elem: Element | null): string[] {
  const text = textContentOf(elem);
  return text ? [text] : [];
}

export function extractPerformerEditCardData(
  editCard: Element,
): StashBoxPerformer {
  const row = (label: string) =>
    getEditDiffContent(findRowByLabel(editCard, label));
  const rowElement = (label: string) =>
    findRowByLabel(editCard, label)?.querySelector(".EditDiff") ?? null;

  const braSizeMatch = row("Bra Size")?.match(/^(\d+)([A-Za-z]+)$/);

  return {
    name: row("Name") ?? "",
    disambiguation: row("Disambiguation"),
    aliases: (row("Aliases") ?? "")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean),
    gender: row("Gender") as StashBoxPerformer["gender"],
    birthDate: row("Birthdate"),
    deathDate: row("Deathdate"),
    eye_color: row("Eye Color"),
    hair_color: row("Hair Color"),
    height: row("Height"),
    breast_type: row("Breast Type") as StashBoxPerformer["breast_type"],
    measurements: {
      bandSize: braSizeMatch?.[1] ?? null,
      cupSize: braSizeMatch?.[2] ?? null,
      waistSize: row("Waist Size"),
      hipSize: row("Hip Size"),
    },
    nationality: row("Nationality"),
    ethnicity: row("Ethnicity"),
    career_start: row("Career Start"),
    career_end: row("Career End"),
    tattoos: textListOf(rowElement("Tattoos")),
    piercings: textListOf(rowElement("Piercings")),
    urls: extractURLsFromEditCard(editCard),
    images: extractImageFromEditCard(editCard)
      ? [extractImageFromEditCard(editCard)!]
      : [],
  };
}
