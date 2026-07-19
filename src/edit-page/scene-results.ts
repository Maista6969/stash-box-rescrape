import {
  compareExact,
  compareCaseInsensitive,
  compareLoose,
  compareImageDimensions,
  computeMissingUrls,
  type FieldStatus,
} from "../compare/compare";
import {
  matchTags,
  resolveStudioAlias,
  relaxStudioComparison,
  computePerformerRows,
  buildTagRows,
  type PerformerRowViewModel,
} from "../compare/matching";
import {
  fetchStudioAliases,
  fetchPerformerAliases,
  fetchTagAliases,
  type PerformerAliasInfo,
} from "../stashbox/graphql";
import {
  extractCurrentPerformerRefs,
  extractCurrentTags,
  extractCurrentStudioName,
  extractCurrentUrls,
} from "../extract/scene-form";
import type { ResolvedScrapedScene } from "../scraper-dispatch";
import {
  createResultPanel,
  addRow,
  markDone,
  renderAddableRows,
  type RowAction,
} from "./panel";
import { appendWordDiff } from "../ui/diff";
import {
  setNativeValue,
  flashField,
  closeTypeaheadMenu,
  currentFieldValue,
  sameText,
  makeSetLink,
  waitForReactSelectOption,
} from "../ui/dom";
import {
  createThumbnailImage,
  fetchBlob,
  applyImage,
  attachImageComparison,
} from "../ui/image-slider";

export function parseAliasTitleAttribute(title: string): string[] {
  return title
    .split("\n")
    .map((a) => a.replace(/^[•\s]+/, "").trim())
    .filter(Boolean);
}

export function formatDimensionComparison(
  existingDims: { width: number; height: number } | null,
  scrapedDims: { width: number; height: number },
): string {
  const ew = existingDims ? String(existingDims.width) : "";
  const eh = existingDims ? String(existingDims.height) : "";
  const sw = String(scrapedDims.width);
  const sh = String(scrapedDims.height);

  const maxW = Math.max(ew.length, sw.length);
  const maxH = Math.max(eh.length, sh.length);

  const fmt = (w: string, h: string) =>
    `${w.padStart(maxW, " ")} × ${h.padStart(maxH, " ")}`;

  const lines: string[] = [];
  if (existingDims) lines.push(`current: ${fmt(ew, eh)}`);
  lines.push(`scraped: ${fmt(sw, sh)}`);

  return lines.join("\n");
}

// Title/Details need the _exact_ text, down to casing and punctuation:
// https://guidelines.stashdb.org/docs/scenes/edit/scene-title/correcting-scene-titles/
// https://guidelines.stashdb.org/docs/scenes/edit/scene-description/correcting-scene-descriptions/
function renderField(
  dl: HTMLDListElement,
  form: HTMLFormElement,
  label: string,
  scraped: string | null | undefined,
  fieldName: string,
  compare: typeof compareExact,
) {
  if (!scraped) return;
  const current = currentFieldValue(form, fieldName);
  const { status, diff } = compare(current, scraped);

  const { details, badge } = addRow(
    dl,
    label,
    status,
    status !== "match",
    (body, summary) => {
      if (status === "diff" && diff) {
        appendWordDiff(body, diff);
      } else {
        body.textContent = scraped;
      }
      body.style.userSelect = "all";
      if (status !== "match") {
        summary.appendChild(
          makeSetLink("set", () => {
            const el = form.querySelector<HTMLInputElement>(
              `*[name="${fieldName}"]`,
            );
            if (!el) {
              console.error(`[rescrape] Field "${fieldName}" not found`);
              return;
            }
            setNativeValue(el, scraped);
            flashField(el);
            markDone(details, badge);
          }),
        );
      }
    },
  );
}

async function renderStudioRow(
  dl: HTMLDListElement,
  form: HTMLFormElement,
  scrapedData: ResolvedScrapedScene,
) {
  if (!scrapedData.studio) return;

  const studioName = scrapedData.studio;
  const studioSelect = form.querySelector(".StudioSelect");
  const currentStudio = extractCurrentStudioName(form);

  let studioMatchViaAlias = false;
  let correctStudio = { canonical: currentStudio };
  const { status: initialStudioStatus, diff: studioDiff } = compareLoose(
    currentStudio,
    studioName,
  );

  let studioStatus: FieldStatus = relaxStudioComparison(
    currentStudio,
    studioName,
    {
      status: initialStudioStatus,
      diff: studioDiff,
    },
  ).status;

  if (studioStatus !== "match") {
    try {
      const aliasMap = await fetchStudioAliases([studioName, currentStudio]);
      const { matchedViaAlias, canonicalName } = resolveStudioAlias(
        currentStudio,
        studioName,
        aliasMap,
      );
      studioMatchViaAlias = matchedViaAlias;
      if (canonicalName) correctStudio = { canonical: canonicalName };
      if (matchedViaAlias) studioStatus = "match";
    } catch (err) {
      console.warn("[rescrape] Could not fetch studio aliases:", err);
    }
  }

  const { details: studioDetails, badge: studioBadge } = addRow(
    dl,
    "Studio",
    studioStatus,
    currentStudio !== correctStudio.canonical,
    (
      body: HTMLDivElement,
      summary: { appendChild: (arg0: HTMLAnchorElement) => void },
    ) => {
      if (studioStatus !== "match" && studioDiff) {
        appendWordDiff(body, studioDiff);
      } else {
        body.textContent = correctStudio.canonical;
      }
      if (studioMatchViaAlias) body.title = `Matched via alias ${studioName}`;
      if (currentStudio !== correctStudio.canonical) {
        summary.appendChild(
          makeSetLink("set", async () => {
            if (!studioSelect) return;
            const fieldEl =
              studioSelect.querySelector<HTMLInputElement>("input")!;
            setNativeValue(fieldEl, correctStudio.canonical);
            const appeared = await waitForReactSelectOption(
              () => !!studioSelect.querySelector(".react-select__option"),
              studioSelect,
              3000,
            );
            if (!appeared) {
              console.error("[rescrape] Studio search timed out");
              return;
            }
            const opts = Array.from(
              studioSelect.querySelectorAll<HTMLButtonElement>(
                ".react-select__option",
              ),
            );
            const exact = opts.find((o) =>
              sameText(o.textContent, correctStudio.canonical),
            );
            if (!exact) {
              console.error(
                `[rescrape] No exact match for studio "${correctStudio.canonical}" in search results`,
              );
              return;
            }
            exact.click();
            flashField(studioSelect);
            markDone(studioDetails, studioBadge);
          }),
        );
      }
    },
  );
}

async function addPerformerToForm(
  form: HTMLFormElement,
  searchValue: string,
  notFoundMessage: string,
  pickMatch: (opts: HTMLButtonElement[]) => HTMLButtonElement | undefined,
): Promise<boolean> {
  const searchInput = form.querySelector<HTMLInputElement>(
    ".add-performer .react-select__input",
  );
  if (!searchInput) {
    console.error("[rescrape] Could not find performer search box");
    return false;
  }
  setNativeValue(searchInput, searchValue);
  const searchContainer = searchInput.closest(
    ".react-select__control",
  )?.parentElement;
  const appeared = await waitForReactSelectOption(
    () => !!searchContainer?.querySelectorAll(".react-select__option").length,
    document.body,
    3000,
  );
  if (!appeared) {
    console.error(notFoundMessage);
    return false;
  }
  const opts = Array.from(
    searchContainer?.querySelectorAll<HTMLButtonElement>(
      ".react-select__option",
    ) ?? [],
  );
  const match = pickMatch(opts);
  if (!match) {
    console.error(
      `[rescrape] No confident match in search results (found: ${opts.map((o) => o.textContent).join(", ")})`,
    );
    return false;
  }
  match.click();
  return true;
}

function makeSetAliasLink(
  aliasInput: HTMLInputElement,
  scraped: string,
  txt: HTMLSpanElement,
  line: HTMLDivElement,
  body: HTMLDivElement,
  markRowDone: () => void,
) {
  return makeSetLink("set alias", () => {
    setNativeValue(aliasInput, scraped);
    closeTypeaheadMenu(aliasInput);
    flashField(aliasInput);
    txt.style.textDecoration = "line-through";
    txt.style.opacity = ".5";
    const done = document.createElement("span");
    done.style.color = "#22c55e";
    done.textContent = "✓ alias set";
    line.appendChild(done);
    line.querySelector(".editpage-set-link")?.remove();
    if (!body.querySelectorAll(".editpage-set-link").length) markRowDone();
  });
}

async function renderPerformerRow(
  dl: HTMLDListElement,
  form: HTMLFormElement,
  scrapedData: ResolvedScrapedScene,
) {
  if (!scrapedData.performers?.length) return;

  const currentPerformers = extractCurrentPerformerRefs(form);

  let perfAliasMap = new Map<string, PerformerAliasInfo>();
  try {
    const allNames = [
      ...currentPerformers.map((p) => p.name),
      ...scrapedData.performers,
    ];
    perfAliasMap = await fetchPerformerAliases(allNames);
  } catch (err) {
    console.warn("[rescrape] Could not fetch performer aliases:", err);
  }

  const {
    rows: performerRows,
    unmatchedCurrent,
    overallStatus,
  } = computePerformerRows(
    currentPerformers.map((p) => ({
      name: p.name,
      aliasInputValue: p.aliasInput?.value ?? null,
    })),
    scrapedData.performers,
    perfAliasMap,
    scrapedData.title,
    scrapedData.details,
  );

  const currentByName = new Map(currentPerformers.map((p) => [p.name, p]));

  const { details: perfDetails, badge: perfBadge } = addRow(
    dl,
    "Performers",
    overallStatus,
    overallStatus !== "match",
    (body) => {
      const makeUnregisteredAliasBadge = () => {
        const badge = document.createElement("span");
        badge.textContent = "⚠ not yet on profile";
        badge.title = "Unrecognized alias";
        badge.style.cssText =
          "color:#f97316;font-size:.7rem;margin-left:.3rem;";
        return badge;
      };

      const makeGuessBadge = () => {
        const badge = document.createElement("span");
        badge.textContent = "? guess";
        badge.title = "Double check before setting";
        badge.style.cssText =
          "color:#f97316;font-size:.7rem;margin-left:.3rem;";
        return badge;
      };

      performerRows.forEach((row: PerformerRowViewModel) => {
        const line = document.createElement("div");
        line.className = "editpage-item-row";

        if (row.kind === "matched") {
          const {
            scraped,
            currentName,
            via,
            aliasAlreadySet,
            isUnregisteredSceneAlias,
          } = row;
          const current = currentByName.get(currentName);

          if (via === "name") {
            line.style.color = "#22c55e";
            line.textContent = `✓ ${scraped}`;
          } else if (via === "alias") {
            line.style.color = aliasAlreadySet ? "#22c55e" : "#22c5af";
            const txt = document.createElement("span");
            txt.textContent = aliasAlreadySet
              ? `✓ ${scraped} (alias of ${currentName})`
              : `≈ ${scraped} → ${currentName}`;
            line.appendChild(txt);
            if (isUnregisteredSceneAlias) {
              line.appendChild(makeUnregisteredAliasBadge());
            }
            // Only offer "set alias" if the alias isn't already filled in
            if (!aliasAlreadySet && current?.aliasInput) {
              line.appendChild(
                makeSetAliasLink(
                  current.aliasInput,
                  scraped,
                  txt,
                  line,
                  body,
                  () => markDone(perfDetails, perfBadge),
                ),
              );
            }
          } else {
            // via === "guess"
            line.style.color = "#22c5af";
            const txt = document.createElement("span");
            txt.textContent = `≈ ${scraped} → ${currentName}`;
            line.appendChild(txt);
            line.appendChild(makeGuessBadge());
            if (current?.aliasInput) {
              line.appendChild(
                makeSetAliasLink(
                  current.aliasInput,
                  scraped,
                  txt,
                  line,
                  body,
                  () => markDone(perfDetails, perfBadge),
                ),
              );
            }
          }
        } else if (row.kind === "ambiguous") {
          // Multiple stash-box performers share this name - there's no way
          // to guess which one is correct, so link every candidate and let
          // the user examine them and pick one
          const { scraped, candidates } = row;
          line.style.color = "#ef4444";
          line.textContent = `? ${scraped} - multiple possible matches:`;
          body.appendChild(line);

          candidates.forEach((candidate) => {
            const candidateLine = document.createElement("div");
            candidateLine.style.cssText = "margin-left:1rem;color:#f97316;";

            const link = document.createElement("a");
            link.href = `${window.location.origin}/performers/${candidate.id}`;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = candidate.name;
            candidateLine.appendChild(link);

            if (candidate.disambiguation) {
              const disambiguation = document.createElement("span");
              disambiguation.style.cssText = "opacity:.7;margin-left:.3rem;";
              disambiguation.textContent = `(${candidate.disambiguation})`;
              candidateLine.appendChild(disambiguation);
            }

            candidateLine.appendChild(
              makeSetLink("add", async () => {
                const added = await addPerformerToForm(
                  form,
                  candidate.id,
                  `[rescrape] No results found for performer id "${candidate.id}"`,
                  (opts) => opts[0],
                );
                if (!added) return;
                candidateLine.querySelector(".editpage-set-link")?.remove();
                const done = document.createElement("span");
                done.style.color = "#22c55e";
                done.textContent = " ✓ added";
                candidateLine.appendChild(done);
                markDone(perfDetails, perfBadge);
              }),
            );

            body.appendChild(candidateLine);
          });
          return;
        } else {
          // Performer not on the form yet ("missing" or "unknown")
          const scraped = row.scraped;
          const canonicalName =
            row.kind === "missing" ? row.canonicalName : null;
          const isScrapedAlias =
            !!canonicalName && !sameText(canonicalName, scraped);
          const performerId = perfAliasMap.get(scraped)?.id;
          line.style.color = "#ef4444";
          const txt = document.createElement("span");
          txt.textContent = isScrapedAlias
            ? `+ ${scraped} (alias of ${canonicalName})`
            : `+ ${scraped}`;
          line.appendChild(txt);

          if (canonicalName === null) {
            const note = document.createElement("span");
            note.style.cssText =
              "color:#f97316;font-size:.75rem;margin-left:.4rem;";
            note.textContent = "(not found)";
            line.appendChild(note);
          } else {
            line.appendChild(
              makeSetLink("add", async () => {
                const nameToAdd = isScrapedAlias ? canonicalName! : scraped;
                const added = performerId
                  ? await addPerformerToForm(
                      form,
                      performerId,
                      `[rescrape] No results found for performer id "${performerId}"`,
                      (opts) => opts[0],
                    )
                  : await addPerformerToForm(
                      form,
                      nameToAdd,
                      `[rescrape] No results found for performer "${nameToAdd}"`,
                      (opts) =>
                        opts.find((o) =>
                          o.textContent
                            .trim()
                            .toLowerCase()
                            .startsWith(nameToAdd.toLowerCase()),
                        ),
                    );
                if (!added) {
                  txt.title = "Couldn't confidently match this performer";
                  return;
                }

                if (isScrapedAlias) {
                  await new Promise((r) => setTimeout(r, 200));
                  const newPerformerEls = Array.from(
                    form.querySelectorAll(".performer-item"),
                  );
                  const newEntry = newPerformerEls.find((el) =>
                    sameText(
                      el
                        .querySelector(".performer-name b")
                        ?.textContent?.trim() ?? "",
                      nameToAdd,
                    ),
                  );
                  const aliasInput =
                    newEntry?.querySelector<HTMLInputElement>(
                      ".rbt-input-main",
                    );
                  if (aliasInput) {
                    setNativeValue(aliasInput, scraped);
                    closeTypeaheadMenu(aliasInput);
                    flashField(aliasInput);
                  }
                }

                txt.style.color = "#22c55e";
                txt.textContent = isScrapedAlias
                  ? `✓ ${canonicalName} (alias: ${scraped})`
                  : `✓ ${scraped}`;
                line.querySelector(".editpage-set-link")?.remove();
                markDone(perfDetails, perfBadge);
              }),
            );
          }
        }
        body.appendChild(line);
      });

      unmatchedCurrent.forEach((cp) => {
        const line = document.createElement("div");
        if (cp.mention) {
          line.style.cssText = "color:#22c55e;margin-bottom:.2rem;";
          line.textContent = `✓ ${cp.name} (mentioned in ${cp.mention})`;
        } else {
          line.style.cssText = "color:#f97316;margin-bottom:.2rem;";
          line.textContent = `− ${cp.name} (not in scrape)`;
        }
        body.appendChild(line);
      });
    },
  );
}

async function renderTagRow(
  dl: HTMLDListElement,
  form: HTMLFormElement,
  scrapedData: ResolvedScrapedScene,
) {
  if (!scrapedData.tags?.length) return;

  const currentTags = extractCurrentTags(form);

  let tagAliasMap = new Map();
  try {
    tagAliasMap = await fetchTagAliases(scrapedData.tags);
  } catch (err) {
    console.warn("[rescrape] Could not fetch tag aliases:", err);
  }

  const { alreadyPresentTags, missingTags, unknownTags } = matchTags(
    scrapedData.tags,
    currentTags,
    tagAliasMap,
  );

  const tagStatus =
    missingTags.length || unknownTags.length ? "approx" : "match";
  // Tags are optional, we never want to show this expanded
  const startExpanded = false;

  const { details: tagDetails, badge: tagBadge } = addRow(
    dl,
    "Tags",
    tagStatus,
    startExpanded,
    (body, summary) => {
      const addTagToForm = async (name: string) => {
        const searchInput = form.querySelector<HTMLInputElement>(
          ".TagSelect-container .react-select__input",
        );
        if (!searchInput) {
          console.error("[rescrape] Could not find tag search box");
          return;
        }
        setNativeValue(searchInput, name);
        const searchContainer = searchInput.closest(
          ".react-select__control",
        )?.parentElement;
        const appeared = await waitForReactSelectOption(
          () => !!searchContainer?.querySelector(".react-select__option"),
          document.body,
          1000,
        );
        if (!appeared) {
          console.error(
            `[rescrape] No results found for tag "${name}" in search widget`,
          );
          return "not-found";
        }

        const nameLower = name.toLowerCase().trim();
        const opts = Array.from(
          searchContainer?.querySelectorAll<HTMLElement>(
            ".react-select__option",
          ) ?? [],
        );
        const exactOpt = opts.find((opt) => {
          const visibleName =
            opt.querySelector(".TagSelect-select-value")?.textContent?.trim() ??
            "";
          // Happy path: the exact name we entered is a match
          if (visibleName.toLowerCase() === nameLower) return true;

          // Longer path: we entered an alias
          // title attribute contains a bulleted list of tag aliases
          const title = opt.querySelector("[title]")?.getAttribute("title");
          if (!title) return false;
          const aliases = parseAliasTitleAttribute(title);
          return aliases.some((a) => a.toLowerCase() === nameLower);
        });

        if (!exactOpt) {
          console.error(
            `[rescrape] No exact match for tag "${name}" in search results`,
          );
          return "not-found";
        }
        exactOpt.click();
      };

      const tagRows = buildTagRows({
        alreadyPresentTags,
        missingTags,
        unknownTags,
      });

      const rowActions: RowAction[] = [];

      tagRows.forEach((row) => {
        const line = document.createElement("div");
        line.className = "editpage-item-row";
        line.style.color = row.color;
        line.textContent = row.text;
        if (row.title) line.title = row.title;
        if (row.addableCanonicalName) {
          const canonical = row.addableCanonicalName;
          const performAdd = () => addTagToForm(canonical);
          const markRowDone = () => {
            line.querySelector(".editpage-set-link")?.remove();
            line.textContent = `✓ ${row.name}`;
            line.style.color = "#22c55e";
            if (!body.querySelectorAll(".editpage-set-link").length)
              markDone(tagDetails, tagBadge);
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

// Most scrapers hand back the studio's own scene URL, which has no fixed
// pattern to detect against (every studio's site is different) - stash-box's
// auto-detect will almost always come up empty for those, so we fall back
// to manually selecting the generic "Studio" site type rather than failing

// NOTE: this is admittedly biased towards StashDB which I know has a Studio link type
async function addUrlToForm(
  form: HTMLFormElement,
  url: string,
): Promise<boolean> {
  const urlInput = form.querySelector(".URLInput");
  const input = urlInput?.querySelector<HTMLInputElement>(
    "input[placeholder='URL']",
  );
  const select = urlInput?.querySelector<HTMLSelectElement>("select");
  if (!input || !select) {
    console.error("[rescrape] Could not find URL input");
    return false;
  }

  setNativeValue(input, url);
  input.dispatchEvent(new Event("focusout", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));

  if (!select.value) {
    const studioOption = Array.from(select.options).find(
      (o) => o.textContent?.trim().toLowerCase() === "studio",
    );
    if (studioOption) setNativeValue(select, studioOption.value);
  }

  if (!select.value) {
    console.error(
      `[rescrape] Could not detect a matching site for URL "${url}"`,
    );
    return false;
  }

  const addButton = Array.from(
    urlInput!.querySelectorAll<HTMLButtonElement>("button"),
  ).find((b) => b.textContent?.trim() === "Add");
  if (!addButton || addButton.disabled) {
    console.error(`[rescrape] "Add" button not ready for URL "${url}"`);
    return false;
  }
  addButton.click();
  return true;
}

function renderUrlRow(
  dl: HTMLDListElement,
  form: HTMLFormElement,
  scrapedData: ResolvedScrapedScene,
) {
  if (!scrapedData.urls?.length) return;

  const currentUrls = extractCurrentUrls(form);
  const { status, missingUrls } = computeMissingUrls(
    currentUrls,
    scrapedData.urls,
  );
  const missingSet = new Set(missingUrls);

  const { details: urlDetails, badge: urlBadge } = addRow(
    dl,
    "Links",
    status,
    status !== "match",
    (body, summary) => {
      const rowActions: RowAction[] = [];

      scrapedData.urls!.forEach((url) => {
        const line = document.createElement("div");
        line.className = "editpage-item-row";

        if (!missingSet.has(url)) {
          line.style.color = "#22c55e";
          line.textContent = `✓ ${url}`;
        } else {
          line.style.color = "#ef4444";
          const txt = document.createElement("span");
          txt.textContent = `+ ${url}`;
          line.appendChild(txt);

          const performAdd = () => addUrlToForm(form, url);
          const markRowDone = () => {
            line.querySelector(".editpage-set-link")?.remove();
            txt.textContent = `✓ ${url}`;
            line.style.color = "#22c55e";
            if (!body.querySelectorAll(".editpage-set-link").length)
              markDone(urlDetails, urlBadge);
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

function renderImageRow(
  dl: HTMLDListElement,
  form: HTMLFormElement,
  scrapedData: ResolvedScrapedScene,
) {
  if (!scrapedData.image?.src) return;

  const src = scrapedData.image.src;
  const scrapedDims = {
    height: scrapedData.image.height,
    width: scrapedData.image.width,
  };

  const existingImg = form.querySelector<HTMLImageElement>(".EditImages img");
  let existingDims = null;
  if (existingImg?.complete && existingImg.naturalWidth) {
    existingDims = {
      width: existingImg.naturalWidth,
      height: existingImg.naturalHeight,
    };
  }

  const status = compareImageDimensions(existingDims, scrapedDims);
  const btnLabel = status === "missing" ? "add image" : "replace image";

  const { details: imgDetails, badge: imgBadge } = addRow(
    dl,
    "Image",
    status,
    status !== "match",
    (body, summary) => {
      const dimLine = document.createElement("div");
      dimLine.style.cssText =
        "font-size:.75rem; color:#aaa; white-space:pre; font-family:ui-monospace, monospace;";
      dimLine.textContent = formatDimensionComparison(
        existingDims,
        scrapedDims,
      );

      body.appendChild(dimLine);
      body.insertBefore(createThumbnailImage(src), dimLine);
      summary.appendChild(
        makeSetLink(btnLabel, async () => {
          try {
            const blob = await fetchBlob(src);
            const ok = await applyImage(blob, src, form);
            if (ok !== false) markDone(imgDetails, imgBadge);
          } catch (err) {
            console.error(
              "[rescrape] Failed to fetch image:",
              err instanceof Error ? err.message : err,
            );
          }
        }),
      );
    },
  );
  attachImageComparison(form, src);
}

export async function showSceneResults(
  form: HTMLFormElement,
  scrapedData: ResolvedScrapedScene,
  scraperName: string,
) {
  const { dl } = createResultPanel(form, scraperName);

  renderField(dl, form, "Title", scrapedData.title, "title", compareExact);
  renderField(
    dl,
    form,
    "Date",
    scrapedData.date,
    "date",
    compareCaseInsensitive,
  );
  // These are async because they might run GQL queries for alias matching
  await renderPerformerRow(dl, form, scrapedData);
  await renderStudioRow(dl, form, scrapedData);
  renderField(
    dl,
    form,
    "Studio Code",
    scrapedData.code,
    "code",
    compareCaseInsensitive,
  );
  renderField(
    dl,
    form,
    "Details",
    scrapedData.details,
    "details",
    compareExact,
  );
  renderField(
    dl,
    form,
    "Director",
    scrapedData.director,
    "director",
    compareCaseInsensitive,
  );
  await renderTagRow(dl, form, scrapedData);
  renderUrlRow(dl, form, scrapedData);
  renderImageRow(dl, form, scrapedData);
}
