import type { StashBoxScene } from "../../extract/editcard";
import type { FieldStatus } from "../../compare/compare";
import {
  matchPerformers,
  computePerformerAlignment,
  mergeSceneAliases,
} from "../../compare/matching";
import {
  fetchPerformerAliases,
  type PerformerAliasInfo,
} from "../../stashbox/graphql";
import { makeToggle } from "../../ui/dom";
import { makeCommentIcon } from "../comments";
import type { ResolvedScrapedScene } from "../../scraper-dispatch";
import { createMissingRow, SCENE_FIELD_ORDER } from "./fields";

function createMissingPerformersRow(editCard: Element): HTMLDivElement {
  const { row, col } = createMissingRow(
    editCard,
    "performers",
    "Performers",
    "ListChangeRow-Performers",
    "col-2 text-end",
    SCENE_FIELD_ORDER,
  );
  const listWrapper = document.createElement("div");
  listWrapper.className = "ListChangeRow";
  listWrapper.appendChild(document.createElement("ul"));
  col.appendChild(listWrapper);
  return row;
}

export async function addPerformerIntegration(
  editCard: Element,
  originalData: StashBoxScene,
  scrapedData: ResolvedScrapedScene,
) {
  const row =
    editCard.querySelector<HTMLDivElement>(".ListChangeRow-Performers.row") ??
    (scrapedData.performers?.length
      ? createMissingPerformersRow(editCard)
      : null);
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

  let aliasMap = new Map<string, PerformerAliasInfo>();
  try {
    aliasMap = await fetchPerformerAliases([
      ...originalData.performers.map((p) => p.name),
      ...scrapedData.performers,
    ]);
  } catch (err) {
    console.warn("[rescrape] Could not fetch performer aliases:", err);
  }

  const sceneAwareAliasMap = mergeSceneAliases(
    originalData.performers,
    aliasMap,
  );
  const currentPerformerNames = originalData.performers.map((p) => p.name);

  const {
    alreadyPresentPerformers,
    missingPerformers,
    unknownPerformers,
    ambiguousPerformers,
  } = matchPerformers(
    scrapedData.performers,
    currentPerformerNames,
    sceneAwareAliasMap,
  );

  const hasMissing =
    missingPerformers.length > 0 ||
    unknownPerformers.length > 0 ||
    ambiguousPerformers.length > 0;
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
    currentPerformerNames,
    scrapedData.performers,
    {
      alreadyPresentPerformers,
      missingPerformers,
      unknownPerformers,
      ambiguousPerformers,
    },
    scrapedData.title,
    scrapedData.details,
  );

  if (originalData.performers.length > 0) {
    const originalColumn = document.createElement("div");
    originalColumn.className =
      "rescrape-performers-column rescrape-unwrap-target";
    originalList.insertAdjacentElement("beforebegin", originalColumn);
    originalColumn.appendChild(originalList);
  } else {
    originalList.remove();
  }

  const scrapedColumn = document.createElement("div");
  scrapedColumn.className = "rescrape-performers-column rescrape-injected";

  const scrapedList = document.createElement("ul");
  scrapedList.className = "rescrape-performers-scraped";

  const performerRef = (name: string, lookupKey: string) => {
    const id = sceneAwareAliasMap.get(lookupKey)?.id;
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
        badge.textContent = "- missing alias";
        badge.title = `Scraped as "${entry.scraped}"`;
        li.appendChild(badge);
        li.appendChild(
          makeCommentIcon(
            editCard,
            `Missing scene alias '${entry.scraped}' for ${performerRef(entry.canonical, entry.canonical)}`,
          ),
        );
      } else {
        badge.textContent = "+ new alias";
        badge.title = `Credited as "${entry.scraped}" in the scrape which is not a registered alias for ${entry.canonical}`;
        li.appendChild(badge);
        li.appendChild(
          makeCommentIcon(
            editCard,
            `Missing scene alias '${entry.scraped}' for ${performerRef(entry.canonical, entry.canonical)}`,
          ),
        );
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
    } else if (entry.kind === "ambiguous") {
      // No confident canonical match to suggest a comment for - just link
      // out to every candidate so a human can tell them apart and decide
      li.classList.add("rescrape-missing");
      const txt = document.createElement("span");
      txt.textContent = `? ${entry.scraped} - multiple possible matches:`;
      li.appendChild(txt);

      const candidateList = document.createElement("ul");
      candidateList.className = "rescrape-ambiguous-candidates";
      entry.candidates.forEach((candidate) => {
        const candidateLi = document.createElement("li");
        const link = document.createElement("a");
        link.href = `${window.location.origin}/performers/${candidate.id}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = candidate.name;
        candidateLi.appendChild(link);
        if (candidate.disambiguation) {
          const disambiguation = document.createElement("small");
          disambiguation.textContent = ` (${candidate.disambiguation})`;
          candidateLi.appendChild(disambiguation);
        }
        candidateList.appendChild(candidateLi);
      });
      li.appendChild(candidateList);
    }

    scrapedList.appendChild(li);
  }

  scrapedColumn.appendChild(scrapedList);
  container.classList.add("rescrape-side-by-side");
  container.appendChild(scrapedColumn);

  label.classList.add("has-diff");
  makeToggle(label, overallStatus !== "match", (showingComparison) => {
    scrapedColumn.style.display = showingComparison ? "" : "none";
  });
}
