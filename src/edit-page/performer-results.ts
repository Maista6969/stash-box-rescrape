import type { ScrapedPerformer } from "../scraper-shared/types";
import {
  compareLoose,
  compareApproxNumber,
  type FieldStatus,
} from "../compare/compare";
import {
  reactSelectValueFor,
  extractCurrentAliases,
} from "../extract/performer-form";
import {
  createResultPanel,
  addRow,
  markDone,
  renderAddableRows,
  type RowAction,
} from "./panel";
import {
  setNativeValue,
  flashField,
  currentFieldValue,
  sameText,
  makeSetLink,
  waitForReactSelectOption,
  findMatchingOption,
} from "../ui/dom";

// These scrapers can return any old thing, we need to guess
// but let's not be too wild about it
export function mapFakeTitsToBreastType(
  raw: string,
): "NATURAL" | "FAKE" | "NA" | null {
  const lower = raw.trim().toLowerCase();
  if (lower === "no" || lower === "false" || lower.includes("natural")) {
    return "NATURAL";
  }
  if (
    lower === "yes" ||
    lower === "true" ||
    lower.includes("fake") ||
    lower.includes("augmented") ||
    lower.includes("implant") ||
    lower.includes("silicone")
  ) {
    return "FAKE";
  }
  if (lower.includes("n/a") || lower.includes("unknown")) {
    return "NA";
  }
  return null;
}

export function compareCompoundSelectField(
  initialStatus: FieldStatus,
  fieldName: string,
  currentLabel: string | null | undefined,
  scraped: string,
): FieldStatus {
  if (initialStatus !== "diff") return initialStatus;
  if (fieldName !== "hair_color" && fieldName !== "ethnicity") {
    return initialStatus;
  }
  if (
    currentLabel &&
    scraped.toLowerCase().includes(currentLabel.toLowerCase())
  ) {
    return "approx";
  }
  return initialStatus;
}

export type AliasRowData = {
  name: string;
  isMissing: boolean;
};

export type AliasesViewModel = {
  status: FieldStatus;
  rows: AliasRowData[];
};

export function buildAliasRows(
  scrapedAliases: string[],
  currentAliases: string[],
): AliasesViewModel {
  const missingAliases = scrapedAliases.filter(
    (a) => !currentAliases.some((c) => sameText(c, a)),
  );
  const missingRows: AliasRowData[] = missingAliases.map((name) => ({
    name,
    isMissing: true,
  }));
  const existingRows: AliasRowData[] = currentAliases
    .filter((c) => scrapedAliases.some((a) => sameText(a, c)))
    .map((name) => ({ name, isMissing: false }));

  const byName = (a: AliasRowData, b: AliasRowData) =>
    a.name.localeCompare(b.name);

  return {
    status: missingAliases.length > 0 ? "missing" : "match",
    rows: [...missingRows.toSorted(byName), ...existingRows.toSorted(byName)],
  };
}

function renderSimpleField(
  dl: HTMLDListElement,
  form: HTMLFormElement,
  field: {
    label: string;
    scraped: string | null | undefined;
    fieldName: string;
    compare?: (current: string, scraped: string) => FieldStatus;
  },
) {
  const { label, scraped, fieldName, compare } = field;
  if (!scraped) return;
  const current = currentFieldValue(form, fieldName);
  const status = compare
    ? compare(current, String(scraped))
    : sameText(current, String(scraped))
      ? "match"
      : "diff";

  const { details, badge } = addRow(
    dl,
    label,
    status,
    status === "diff",
    (body, summary) => {
      body.textContent = scraped;
      body.style.userSelect = "all";
      if (status === "diff") {
        summary.appendChild(
          makeSetLink("set", () => {
            const el = form.querySelector<HTMLInputElement>(
              `*[name="${fieldName}"]`,
            );
            if (!el) {
              console.error(`[rescrape] Field "${fieldName}" not found`);
              return;
            }
            setNativeValue(el, String(scraped));
            flashField(el);
            markDone(details, badge);
          }),
        );
      }
    },
  );
}

function renderCountryRow(
  dl: HTMLDListElement,
  form: HTMLFormElement,
  scrapedData: ScrapedPerformer,
) {
  if (!scrapedData.country) return;

  const countryName = scrapedData.country;
  const countryContainer =
    form.querySelector('label[for="country"]')?.nextElementSibling ?? null;
  const currentCountry = reactSelectValueFor(form, "country");
  const { status: countryStatus } = compareLoose(currentCountry, countryName);

  const { details: countryDetails, badge: countryBadge } = addRow(
    dl,
    "Country",
    countryStatus,
    countryStatus !== "match",
    (body, summary) => {
      body.textContent = countryName;
      body.style.userSelect = "all";
      if (countryStatus !== "match") {
        summary.appendChild(
          makeSetLink("set", async () => {
            const searchInput =
              countryContainer?.querySelector<HTMLInputElement>(
                ".react-select__input",
              );
            if (!searchInput || !countryContainer) {
              console.error("[rescrape] Could not find country search box");
              return;
            }
            setNativeValue(searchInput, countryName);
            const appeared = await waitForReactSelectOption(
              () => !!countryContainer.querySelector(".react-select__option"),
              countryContainer,
              3000,
            );
            if (!appeared) {
              console.error(
                `[rescrape] No results found for country "${countryName}"`,
              );
              return;
            }
            const opts = Array.from(
              countryContainer.querySelectorAll<HTMLElement>(
                ".react-select__option",
              ),
            );
            const exact = opts.find((o) =>
              sameText(o.textContent, countryName),
            );
            if (!exact) {
              console.error(
                `[rescrape] No exact match for country "${countryName}" in search results`,
              );
              return;
            }
            exact.click();
            flashField(countryContainer);
            markDone(countryDetails, countryBadge);
          }),
        );
      }
    },
  );
}

function renderSelectField(
  dl: HTMLDListElement,
  form: HTMLFormElement,
  field: {
    label: string;
    scraped: string | null | undefined;
    fieldName: string;
  },
) {
  const { label, scraped, fieldName } = field;
  if (!scraped) return;
  const select = form.querySelector<HTMLSelectElement>(
    `select[name="${fieldName}"]`,
  );
  const current = currentFieldValue(form, fieldName);
  let status: FieldStatus = sameText(current, scraped) ? "match" : "diff";

  const currentLabel = select
    ?.querySelector<HTMLOptionElement>("option:checked")
    ?.textContent?.trim();
  status = compareCompoundSelectField(status, fieldName, currentLabel, scraped);

  const matchingOption =
    status === "diff" && select
      ? findMatchingOption(select, scraped)
      : undefined;

  const { details, badge } = addRow(
    dl,
    label,
    status,
    status === "diff",
    (body, summary) => {
      body.textContent = scraped;
      if (matchingOption && select) {
        summary.appendChild(
          makeSetLink("set", () => {
            setNativeValue(select, matchingOption.value);
            flashField(select);
            markDone(details, badge);
          }),
        );
      }
    },
  );
}

function renderBreastTypeRow(
  dl: HTMLDListElement,
  form: HTMLFormElement,
  scrapedData: ScrapedPerformer,
) {
  if (!scrapedData.fake_tits) return;

  const currentVal = (name: string) => currentFieldValue(form, name);
  const mappedBreastType = mapFakeTitsToBreastType(scrapedData.fake_tits);
  const select = form.querySelector<HTMLSelectElement>(
    'select[name="breastType"]',
  );
  const current = currentVal("breastType");

  if (mappedBreastType && select) {
    const status: FieldStatus = sameText(current, mappedBreastType)
      ? "match"
      : "diff";
    const matchingOption =
      status === "diff"
        ? findMatchingOption(select, mappedBreastType)
        : undefined;

    const { details, badge } = addRow(
      dl,
      "Breast Type",
      status,
      status === "diff",
      (body, summary) => {
        body.textContent = scrapedData.fake_tits!;
        body.title = `Mapped from scraped value "${scrapedData.fake_tits}"`;
        if (matchingOption) {
          summary.appendChild(
            makeSetLink("set", () => {
              setNativeValue(select, matchingOption.value);
              flashField(select);
              markDone(details, badge);
            }),
          );
        }
      },
    );
  } else {
    addRow(
      dl,
      "Breast implants (unknown type)",
      "missing",
      true,
      (body: { textContent: string }) => {
        body.textContent = String(scrapedData.fake_tits);
      },
    );
  }
}

function renderAliasesRow(
  dl: HTMLDListElement,
  form: HTMLFormElement,
  scrapedData: ScrapedPerformer,
) {
  if (!scrapedData.aliases?.length) return;

  const scrapedAliases = scrapedData.aliases;
  const currentAliases = extractCurrentAliases(form);
  const { status: aliasesStatus, rows: aliasRows } = buildAliasRows(
    scrapedAliases,
    currentAliases,
  );

  const addAliasToForm = async (name: string) => {
    const searchInput = form.querySelector<HTMLInputElement>(
      "#performer-aliases-select",
    );
    if (!searchInput) {
      console.error("[rescrape] Could not find aliases input box");
      return;
    }
    setNativeValue(searchInput, name);
    searchInput.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }),
    );
    await new Promise((r) => setTimeout(r, 100));
  };

  const { details: aliasesDetails, badge: aliasesBadge } = addRow(
    dl,
    "Aliases",
    aliasesStatus,
    aliasesStatus !== "match",
    (body, summary) => {
      const rowActions: RowAction[] = [];

      aliasRows.forEach((row) => {
        const line = document.createElement("div");
        line.className = "editpage-item-row";
        line.style.color = row.isMissing ? "#22c5af" : "#22c55e";
        line.textContent = row.isMissing ? `+ ${row.name}` : `✓ ${row.name}`;
        if (row.isMissing) {
          const performAdd = () => addAliasToForm(row.name);
          const markRowDone = () => {
            line.querySelector(".editpage-set-link")?.remove();
            line.textContent = `✓ ${row.name}`;
            line.style.color = "#22c55e";
            if (!body.querySelectorAll(".editpage-set-link").length) {
              markDone(aliasesDetails, aliasesBadge);
            }
          };
          rowActions.push({ performAdd, markRowDone });
          line.appendChild(
            makeSetLink("add", async () => {
              await performAdd();
              markRowDone();
            }),
          );
        }
        body.appendChild(line);
      });

      renderAddableRows(summary, rowActions);
    },
  );
}

const approxNum = (current: string, scraped: string) =>
  compareApproxNumber(current, scraped, 2);

// Matches the performer edit form's own field order exactly (see
// frontend/src/pages/performers/performerForm/PerformerForm.tsx):
// Name, [Disambiguation - not scraped], Aliases, Gender, Birthdate,
// Deathdate, Eye Color, Hair Color, Height, Breast Type, Band Size,
// Cup Size, Waist Size, Hip Size, Nationality, Ethnicity
export async function showPerformerResults(
  form: HTMLFormElement,
  scrapedData: ScrapedPerformer,
  scraperName?: string,
) {
  const { dl } = createResultPanel(form, scraperName);

  renderSimpleField(dl, form, {
    label: "Name",
    scraped: scrapedData.name,
    fieldName: "name",
  });
  renderAliasesRow(dl, form, scrapedData);
  renderSelectField(dl, form, {
    label: "Gender",
    scraped: scrapedData.gender,
    fieldName: "gender",
  });
  renderSimpleField(dl, form, {
    label: "Birthdate",
    scraped: scrapedData.birthdate,
    fieldName: "birthdate",
  });
  renderSimpleField(dl, form, {
    label: "Death date",
    scraped: scrapedData.death_date,
    fieldName: "deathdate",
  });
  renderSelectField(dl, form, {
    label: "Eye color",
    scraped: scrapedData.eye_color,
    fieldName: "eye_color",
  });
  renderSelectField(dl, form, {
    label: "Hair color",
    scraped: scrapedData.hair_color,
    fieldName: "hair_color",
  });
  renderSimpleField(dl, form, {
    label: "Height (cm)",
    scraped: scrapedData.height,
    fieldName: "height",
    compare: approxNum,
  });
  renderBreastTypeRow(dl, form, scrapedData);
  renderSimpleField(dl, form, {
    label: "Band Size",
    scraped: scrapedData.measurements?.bandSize,
    fieldName: "bandSize",
    compare: approxNum,
  });
  renderSimpleField(dl, form, {
    label: "Cup Size",
    scraped: scrapedData.measurements?.cupSize,
    fieldName: "cupSize",
    compare: approxNum,
  });
  renderSimpleField(dl, form, {
    label: "Waist Size",
    scraped: scrapedData.measurements?.waistSize,
    fieldName: "waistSize",
    compare: approxNum,
  });
  renderSimpleField(dl, form, {
    label: "Hip Size",
    scraped: scrapedData.measurements?.hipSize,
    fieldName: "hipSize",
    compare: approxNum,
  });
  renderCountryRow(dl, form, scrapedData);
  renderSelectField(dl, form, {
    label: "Ethnicity",
    scraped: scrapedData.ethnicity,
    fieldName: "ethnicity",
  });
}
