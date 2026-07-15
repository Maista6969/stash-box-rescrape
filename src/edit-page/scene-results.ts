import {
  compareExact,
  compareLoose,
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
} from "../stashbox/graphql";
import {
  extractCurrentPerformerRefs,
  extractCurrentTags,
  extractCurrentStudioName,
} from "../extract/scene-form";
import type { ResolvedScrapedScene } from "../scraper-dispatch";
import { createResultPanel, addRow, markDone } from "./panel";
import { appendWordDiff } from "../ui/diff";
import {
  setNativeValue,
  flashField,
  currentFieldValue,
  sameText,
  makeSetLink,
  waitForReactSelectOption,
} from "../ui/dom";
import {
  createThumbnailImage,
  determineImageAction,
  fetchBlob,
  applyImage,
  attachImageComparison,
} from "../ui/image-slider";

// A react-select tag option's `title` attribute holds a bulleted list of
// that tag's known aliases (one per line, "• alias"), used to recognize
// when the moderator (or a scraper) typed in an alias rather than the
// canonical tag name
export function parseAliasTitleAttribute(title: string): string[] {
  return title
    .split("\n")
    .map((a) => a.replace(/^[•\s]+/, "").trim())
    .filter(Boolean);
}

// Renders "current: W x H" / "scraped: W x H" (only the scraped line when
// there's nothing to compare against), digits right-aligned within each
// dimension's own column so the two lines line up under a monospace font
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

export async function showSceneResults(
  form: HTMLFormElement,
  scrapedData: ResolvedScrapedScene,
  scraperName?: string,
) {
  const { panel: _panel, dl } = createResultPanel(form, scraperName);
  const currentVal = (name: string) => currentFieldValue(form, name);

  // Guidelines say we want the _exact_ title and details, down to casing and punctuation
  // https://guidelines.stashdb.org/docs/scenes/edit/scene-title/correcting-scene-titles/
  // https://guidelines.stashdb.org/docs/scenes/edit/scene-description/correcting-scene-descriptions/
  const exactFields = [
    { label: "Title", scraped: scrapedData.title, fieldName: "title" },
    { label: "Details", scraped: scrapedData.details, fieldName: "details" },
  ];

  for (const { label, scraped, fieldName } of exactFields) {
    if (!scraped) continue;
    const current = currentVal(fieldName);
    const { status, diff } = compareExact(current, scraped);

    const { details, badge } = addRow(
      dl,
      label,
      status,
      status === "diff",
      (body, summary) => {
        if (status === "diff" && diff) {
          appendWordDiff(body, diff);
        } else {
          body.textContent = scraped;
        }
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
              setNativeValue(el, scraped);
              flashField(el);
              markDone(details, badge);
            }),
          );
        }
      },
    );
  }

  const simpleFields = [
    { label: "Date", scraped: scrapedData.date, fieldName: "date" },
    { label: "Studio Code", scraped: scrapedData.code, fieldName: "code" },
    { label: "Director", scraped: scrapedData.director, fieldName: "director" },
  ];

  for (const { label, scraped, fieldName } of simpleFields) {
    if (!scraped) continue;
    const current = currentVal(fieldName);
    const same = sameText(current, scraped);
    const status = same ? "match" : "diff";

    const { details, badge } = addRow(
      dl,
      label,
      status,
      !same,
      (body, summary) => {
        body.textContent = scraped;
        body.style.userSelect = "all";
        if (!same) {
          summary.appendChild(
            makeSetLink("set", () => {
              const el = form.querySelector<HTMLInputElement>(
                `*[name="${fieldName}"]`,
              );
              if (!el)
                return console.error(
                  `[rescrape] Field "${fieldName}" not found`,
                );
              setNativeValue(el, scraped);
              flashField(el);
              markDone(details, badge);
            }),
          );
        }
      },
    );
  }

  if (scrapedData.studio) {
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

    {
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
          if (studioMatchViaAlias)
            body.title = `Matched via alias ${studioName}`;
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
                if (!appeared)
                  return console.error("[rescrape] Studio search timed out");
                const opts = Array.from(
                  studioSelect.querySelectorAll<HTMLButtonElement>(
                    ".react-select__option",
                  ),
                );
                const exact = opts.find((o) =>
                  sameText(o.textContent, correctStudio.canonical),
                );
                if (!exact) {
                  return console.error(
                    `[rescrape] No exact match for studio "${correctStudio.canonical}" in search results`,
                  );
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
  }

  if (scrapedData.performers?.length) {
    const currentPerformers = extractCurrentPerformerRefs(form);

    let perfAliasMap = new Map();
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
        const addPerformerToForm = async (name: string): Promise<boolean> => {
          const searchInput = form.querySelector<HTMLInputElement>(
            ".add-performer .react-select__input",
          );
          if (!searchInput) {
            console.error("[rescrape] Could not find performer search box");
            return false;
          }
          setNativeValue(searchInput, name);
          const searchContainer = searchInput.closest(
            ".react-select__control",
          )?.parentElement;
          const appeared = await waitForReactSelectOption(
            () =>
              !!searchContainer?.querySelectorAll(".react-select__option")
                .length,
            document.body,
            3000,
          );
          if (!appeared) {
            console.error(
              `[rescrape] No results found for performer "${name}"`,
            );
            return false;
          }
          const opts = Array.from(
            searchContainer?.querySelectorAll<HTMLButtonElement>(
              ".react-select__option",
            ) ?? [],
          );
          const exact = opts.find((o) =>
            o.textContent.trim().toLowerCase().startsWith(name.toLowerCase()),
          );
          if (!exact) {
            console.error(
              `[rescrape] No confident match for performer "${name}" in search ` +
                `results (found: ${opts.map((o) => o.textContent).join(", ")})`,
            );
            return false;
          }
          exact.click();
          return true;
        };

        const addPerformerToFormById = async (id: string): Promise<boolean> => {
          const searchInput = form.querySelector<HTMLInputElement>(
            ".add-performer .react-select__input",
          );
          if (!searchInput) {
            console.error("[rescrape] Could not find performer search box");
            return false;
          }
          setNativeValue(searchInput, id);
          const searchContainer = searchInput.closest(
            ".react-select__control",
          )?.parentElement;
          const appeared = await waitForReactSelectOption(
            () =>
              !!searchContainer?.querySelectorAll(".react-select__option")
                .length,
            document.body,
            3000,
          );
          if (!appeared) {
            console.error(
              `[rescrape] No results found for performer id "${id}"`,
            );
            return false;
          }
          const opts = Array.from(
            searchContainer?.querySelectorAll<HTMLButtonElement>(
              ".react-select__option",
            ) ?? [],
          );
          opts[0].click();
          return true;
        };

        const makeUnregisteredAliasBadge = () => {
          const badge = document.createElement("span");
          badge.textContent = "⚠ not yet on profile";
          badge.title =
            "This scene alias isn't registered as an alias on the performer's own stash-box profile yet";
          badge.style.cssText =
            "color:#f97316;font-size:.7rem;margin-left:.3rem;";
          return badge;
        };

        const makeGuessBadge = () => {
          const badge = document.createElement("span");
          badge.textContent = "? guess";
          badge.title =
            "Guessed from a single name: not a confirmed match, double check before setting";
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
                const aliasInput = current.aliasInput;
                line.appendChild(
                  makeSetLink("set alias", () => {
                    setNativeValue(aliasInput, scraped);
                    flashField(aliasInput);
                    txt.style.textDecoration = "line-through";
                    txt.style.opacity = ".5";
                    const done = document.createElement("span");
                    done.style.color = "#22c55e";
                    done.textContent = "✓ alias set";
                    line.appendChild(done);
                    line.querySelector(".editpage-set-link")?.remove();
                    if (!body.querySelectorAll(".editpage-set-link").length)
                      markDone(perfDetails, perfBadge);
                  }),
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
                const aliasInput = current.aliasInput;
                line.appendChild(
                  makeSetLink("set alias", () => {
                    setNativeValue(aliasInput, scraped);
                    flashField(aliasInput);
                    txt.style.textDecoration = "line-through";
                    txt.style.opacity = ".5";
                    const done = document.createElement("span");
                    done.style.color = "#22c55e";
                    done.textContent = "✓ alias set";
                    line.appendChild(done);
                    line.querySelector(".editpage-set-link")?.remove();
                    if (!body.querySelectorAll(".editpage-set-link").length)
                      markDone(perfDetails, perfBadge);
                  }),
                );
              }
            }
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
              note.textContent =
                "(no stash-box profile found, probably needs to be created)";
              line.appendChild(note);
            } else {
              line.appendChild(
                makeSetLink("add", async () => {
                  const nameToAdd = isScrapedAlias ? canonicalName! : scraped;
                  const added = performerId
                    ? await addPerformerToFormById(performerId)
                    : await addPerformerToForm(nameToAdd);
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

  if (scrapedData.tags?.length) {
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

    // TODO: Tags should be considered a match if all scraped tags appear in already present tags
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
          if (!searchInput)
            return console.error("[rescrape] Could not find tag search box");
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
              opt
                .querySelector(".TagSelect-select-value")
                ?.textContent?.trim() ?? "";
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

        const rowActions: Array<{
          performAdd: () => Promise<unknown>;
          markRowDone: () => void;
        }> = [];

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

  if (scrapedData.image?.src) {
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

    const action = determineImageAction(scrapedDims, existingDims);
    const status =
      action === "same" ? "approx" : existingDims ? "diff" : "missing";
    const btnLabel = action === "replace" ? "replace image" : "add image";

    const { details: imgDetails, badge: imgBadge } = addRow(
      dl,
      "Image",
      status,
      action !== "same",
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
}
