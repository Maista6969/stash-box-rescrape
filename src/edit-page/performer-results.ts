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
import { createResultPanel, addRow, markDone } from "./panel";
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

export async function showPerformerResults(
  form: HTMLFormElement,
  scrapedData: ScrapedPerformer,
  scraperName?: string,
) {
  const { panel: _panel, dl } = createResultPanel(form, scraperName);
  const currentVal = (name: string) => currentFieldValue(form, name);

  const simpleFields: {
    label: string;
    scraped: string | null | undefined;
    fieldName: string;
    compare?: (current: string, scraped: string) => FieldStatus;
  }[] = [
    { label: "Name", scraped: scrapedData.name, fieldName: "name" },
    {
      label: "Birthdate",
      scraped: scrapedData.birthdate,
      fieldName: "birthdate",
    },
    {
      label: "Death date",
      scraped: scrapedData.death_date,
      fieldName: "deathdate",
    },
    {
      label: "Height (cm)",
      scraped: scrapedData.height,
      fieldName: "height",
      compare: (current, scraped) => compareApproxNumber(current, scraped, 2),
    },
    {
      label: "Band Size",
      scraped: scrapedData.measurements?.bandSize,
      fieldName: "bandSize",
      compare: (current, scraped) => compareApproxNumber(current, scraped, 2),
    },
    {
      label: "Cup Size",
      scraped: scrapedData.measurements?.cupSize,
      fieldName: "cupSize",
      compare: (current, scraped) => compareApproxNumber(current, scraped, 2),
    },
    {
      label: "Waist Size",
      scraped: scrapedData.measurements?.waistSize,
      fieldName: "waistSize",
      compare: (current, scraped) => compareApproxNumber(current, scraped, 2),
    },
    {
      label: "Hip Size",
      scraped: scrapedData.measurements?.hipSize,
      fieldName: "hipSize",
      compare: (current, scraped) => compareApproxNumber(current, scraped, 2),
    },
  ];

  for (const { label, scraped, fieldName, compare } of simpleFields) {
    if (!scraped) continue;
    const current = currentVal(fieldName);
    const status = compare
      ? compare(current, String(scraped))
      : sameText(current, String(scraped))
        ? "match"
        : "diff";

    {
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
                if (!el)
                  return console.error(
                    `[rescrape] Field "${fieldName}" not found`,
                  );
                setNativeValue(el, String(scraped));
                flashField(el);
                markDone(details, badge);
              }),
            );
          }
        },
      );
    }
  }

  if (scrapedData.country) {
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
                return console.error(
                  "[rescrape] Could not find country search box",
                );
              }
              setNativeValue(searchInput, countryName);
              const appeared = await waitForReactSelectOption(
                () => !!countryContainer.querySelector(".react-select__option"),
                countryContainer,
                3000,
              );
              if (!appeared) {
                return console.error(
                  `[rescrape] No results found for country "${countryName}"`,
                );
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
                return console.error(
                  `[rescrape] No exact match for country "${countryName}" in search results`,
                );
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

  const selectFields = [
    { label: "Gender", scraped: scrapedData.gender, fieldName: "gender" },
    {
      label: "Ethnicity",
      scraped: scrapedData.ethnicity,
      fieldName: "ethnicity",
    },
    {
      label: "Eye color",
      scraped: scrapedData.eye_color,
      fieldName: "eye_color",
    },
    {
      label: "Hair color",
      scraped: scrapedData.hair_color,
      fieldName: "hair_color",
    },
  ];

  for (const { label, scraped, fieldName } of selectFields) {
    if (!scraped) continue;
    const select = form.querySelector<HTMLSelectElement>(
      `select[name="${fieldName}"]`,
    );
    const current = currentVal(fieldName);
    let status: FieldStatus = sameText(current, scraped) ? "match" : "diff";

    const currentLabel = select
      ?.querySelector<HTMLOptionElement>("option:checked")
      ?.textContent?.trim();
    status = compareCompoundSelectField(
      status,
      fieldName,
      currentLabel,
      scraped,
    );

    const matchingOption =
      status === "diff" && select
        ? findMatchingOption(select, scraped)
        : undefined;

    {
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
  }

  if (scrapedData.fake_tits) {
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

  if (scrapedData.aliases?.length) {
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
        return console.error("[rescrape] Could not find aliases input box");
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
        const rowActions: Array<{
          performAdd: () => Promise<unknown>;
          markRowDone: () => void;
        }> = [];

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

        if (rowActions.length > 1) {
          const addAllLink = makeSetLink("add all", async () => {
            for (const { performAdd, markRowDone } of rowActions) {
              await performAdd();
              markRowDone();
            }
            addAllLink.remove();
          });
          summary.appendChild(addAllLink);
        }
      },
    );
  }
}
