import {
  findPerformerNameMatches,
  type PerformerNameMatch,
} from "../../stashbox/graphql";
import { makeCommentIcon } from "../comments";

export type NameSearchCard = {
  editCard: Element;
  names: string[];
  // The performer this very edit created, if it's already been applied - a
  // name match against this id is the edit's own performer, not a candidate
  ownEntityId: string | null;
};

// A hit found via more than one submitted name/alias carries every term that
// led to it, so the render step can highlight exactly which of the
// candidate's own name/aliases is the overlap
type RenderableMatch = PerformerNameMatch & { matchedTerms: string[] };

function displayName(match: PerformerNameMatch): string {
  return match.disambiguation
    ? `${match.name} (${match.disambiguation})`
    : match.name;
}

function isMatchedTerm(match: RenderableMatch, value: string): boolean {
  const normalized = value.toLowerCase().trim();
  return match.matchedTerms.some(
    (term) => term.toLowerCase().trim() === normalized,
  );
}

function buildMetaLine(match: RenderableMatch): HTMLDivElement | null {
  const factBits = [match.country, match.birthDate].filter(
    (part): part is string => !!part,
  );
  if (!factBits.length && !match.aliases.length) return null;

  const meta = document.createElement("div");
  meta.className = "rescrape-name-match-meta";

  const pieces: Node[] = [];
  if (factBits.length) {
    pieces.push(document.createTextNode(factBits.join(" • ")));
  }
  if (match.aliases.length) {
    const aka = document.createElement("span");
    aka.append("aka ");
    match.aliases.forEach((alias, i) => {
      if (i > 0) aka.append(", ");
      if (isMatchedTerm(match, alias)) {
        const hint = document.createElement("span");
        hint.className = "rescrape-name-match-hint";
        hint.textContent = alias;
        aka.appendChild(hint);
      } else {
        aka.append(alias);
      }
    });
    pieces.push(aka);
  }

  pieces.forEach((piece, i) => {
    if (i > 0) meta.append(" • ");
    meta.appendChild(piece);
  });

  return meta;
}

function buildMatchItem(
  match: RenderableMatch,
  editCard: Element,
): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "rescrape-name-match-item";

  if (match.imageUrl) {
    const thumb = document.createElement("img");
    thumb.className = "rescrape-name-match-thumb";
    thumb.alt = "";
    thumb.src = match.imageUrl;
    li.appendChild(thumb);
  }

  const info = document.createElement("div");
  info.className = "rescrape-name-match-info";

  const nameLink = document.createElement("a");
  nameLink.className = "rescrape-name-match-name";
  if (isMatchedTerm(match, match.name)) {
    nameLink.classList.add("rescrape-name-match-hint");
  }
  const profileUrl = `${window.location.origin}/performers/${match.id}`;
  nameLink.href = profileUrl;
  nameLink.target = "_blank";
  nameLink.rel = "noopener noreferrer";
  nameLink.textContent = displayName(match);
  info.appendChild(nameLink);

  const meta = buildMetaLine(match);
  if (meta) info.appendChild(meta);

  li.appendChild(info);
  li.appendChild(
    makeCommentIcon(
      editCard,
      `Already exists as [${displayName(match)}](${profileUrl})`,
    ),
  );
  return li;
}

function buildMatchList(
  matches: RenderableMatch[],
  editCard: Element,
): HTMLUListElement {
  const list = document.createElement("ul");
  list.className = "rescrape-name-match-list";
  matches.forEach((match) => list.appendChild(buildMatchItem(match, editCard)));
  return list;
}

// A single hit doesn't need a moderator to open anything to see it - only
// wrap this in a collapsed <details> once there's more than one to sift through
function buildSingleMatchNotice(
  match: RenderableMatch,
  editCard: Element,
): HTMLDivElement {
  const container = document.createElement("div");
  container.className = "rescrape-name-matches";

  const heading = document.createElement("div");
  heading.className = "rescrape-name-match-heading";
  heading.textContent =
    "Performer with a matching name - please check this isn't the same person";
  container.appendChild(heading);

  container.appendChild(buildMatchList([match], editCard));
  return container;
}

function buildNameMatchesDetails(
  matches: RenderableMatch[],
  editCard: Element,
): HTMLDetailsElement {
  const details = document.createElement("details");
  details.className = "rescrape-name-matches";

  const summary = document.createElement("summary");
  summary.textContent = `Performers with matching names (${matches.length}) - please check these aren't the same person`;
  details.appendChild(summary);

  details.appendChild(buildMatchList(matches, editCard));
  return details;
}

function renderNameMatches(
  { editCard, names, ownEntityId }: NameSearchCard,
  matchesByName: Map<string, PerformerNameMatch[]>,
) {
  const cardBody = editCard.querySelector(".card-body");
  if (!cardBody) return;

  // The same performer can surface under more than one searched name/alias -
  // dedupe by id and remember every term that hit them
  const byId = new Map<string, RenderableMatch>();
  for (const name of names) {
    for (const match of matchesByName.get(name) ?? []) {
      if (match.id === ownEntityId) continue;
      const existing = byId.get(match.id);
      if (existing) {
        existing.matchedTerms.push(name);
      } else {
        byId.set(match.id, { ...match, matchedTerms: [name] });
      }
    }
  }
  if (byId.size === 0) return;

  const matches = [...byId.values()];

  cardBody.querySelector(".rescrape-name-matches")?.remove();

  // Something the moderator should weigh before looking at the rest of the
  // submission, so it goes at the top of the card rather than the bottom
  const element =
    matches.length === 1
      ? buildSingleMatchNotice(matches[0], editCard)
      : buildNameMatchesDetails(matches, editCard);
  cardBody.insertBefore(element, cardBody.firstChild);
}

// Informational, not a warning: same-named performers are extremely common
// in adult entertainment, so this just hands the moderator a quick way to
// double check rather than asserting anything is actually wrong
export async function checkPerformerNameMatchesOnPage(
  cards: NameSearchCard[],
): Promise<void> {
  const allNames = [...new Set(cards.flatMap((card) => card.names))];
  if (!allNames.length) return;

  let matchesByName: Map<string, PerformerNameMatch[]>;
  try {
    matchesByName = await findPerformerNameMatches(allNames);
  } catch (err) {
    console.warn("[rescrape] Could not check for performer name matches:", err);
    return;
  }
  if (matchesByName.size === 0) return;

  for (const card of cards) {
    renderNameMatches(card, matchesByName);
  }
}
