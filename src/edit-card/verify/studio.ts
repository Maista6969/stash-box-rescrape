import type { StashBoxScene } from "../../extract/editcard";
import { compareLoose } from "../../compare/compare";
import {
  resolveStudioAlias,
  relaxStudioComparison,
} from "../../compare/matching";
import { fetchStudioAliases } from "../../stashbox/graphql";
import { makeCommentIcon } from "../comments";
import type { ResolvedScrapedScene } from "../../scraper-dispatch";
import { createMissingRow, SCENE_FIELD_ORDER } from "./fields";
import { createFontAwesomeIcon } from "../../ui/icons";

function createMissingStudioRow(editCard: Element): HTMLDivElement {
  const { row, col } = createMissingRow(
    editCard,
    "studio",
    "Studio",
    "mb-2",
    "col-2 text-end pt-1",
    SCENE_FIELD_ORDER,
  );
  col.appendChild(document.createElement("div")).className = "EditDiff";
  return row;
}

export async function addStudioComparison(
  editCard: Element,
  originalData: StashBoxScene,
  scrapedData: ResolvedScrapedScene,
) {
  const row =
    Array.from(editCard.querySelectorAll<HTMLDivElement>(".row")).find(
      (r) =>
        r.querySelector("b")?.textContent?.trim().toLowerCase() === "studio",
    ) ?? (scrapedData.studio ? createMissingStudioRow(editCard) : null);
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

  const arrow = createFontAwesomeIcon(
    "arrow-right",
    "rescrape-arrow",
    "rescrape-injected",
  );
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
    : `Studio should be \`${canonicalName}\``;
  valueRow.appendChild(makeCommentIcon(editCard, commentText));
}
