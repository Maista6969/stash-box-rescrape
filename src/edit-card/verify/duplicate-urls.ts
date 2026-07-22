import {
  findDuplicatesByUrl,
  type UrlSearchMatch,
} from "../../stashbox/graphql";

export type DuplicateCheckCard = {
  editCard: Element;
  urls: string[];
};

function buildDuplicateWarning(
  matchesByUrl: Map<string, UrlSearchMatch[]>,
): HTMLDivElement {
  const warning = document.createElement("div");
  warning.className = "rescrape-duplicate-warning";

  const heading = document.createElement("div");
  heading.textContent = `⚠ Possible duplicate: matching URL${matchesByUrl.size > 1 ? "s" : ""} found elsewhere`;
  warning.appendChild(heading);

  const list = document.createElement("ul");
  matchesByUrl.forEach((matches, url) => {
    matches.forEach((match) => {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = `${window.location.origin}/${match.type}s/${match.id}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = match.name;
      li.appendChild(link);
      li.append(` contains ${url}`);

      list.appendChild(li);
    });
  });
  warning.appendChild(list);

  return warning;
}

function renderDuplicateWarning(
  editCard: Element,
  urls: string[],
  matchesByUrl: Map<string, UrlSearchMatch[]>,
) {
  const cardBody = editCard.querySelector(".card-body");
  if (!cardBody) return;

  const ownMatches = new Map(
    urls
      .filter((url) => matchesByUrl.has(url))
      .map((url) => [url, matchesByUrl.get(url)!] as const),
  );
  if (ownMatches.size === 0) return;

  cardBody.querySelector(".rescrape-duplicate-warning")?.remove();
  cardBody.insertBefore(buildDuplicateWarning(ownMatches), cardBody.firstChild);
}

export async function checkForDuplicateUrlsOnPage(
  cards: DuplicateCheckCard[],
): Promise<void> {
  const allUrls = [...new Set(cards.flatMap((card) => card.urls))];
  if (!allUrls.length) return;

  let matchesByUrl: Map<string, UrlSearchMatch[]>;
  try {
    matchesByUrl = await findDuplicatesByUrl(allUrls);
  } catch (err) {
    console.warn("[rescrape] Could not check for duplicate URLs:", err);
    return;
  }
  if (matchesByUrl.size === 0) return;

  for (const { editCard, urls } of cards) {
    renderDuplicateWarning(editCard, urls, matchesByUrl);
  }
}
