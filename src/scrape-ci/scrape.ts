import type {
  ScraperPattern,
  ScrapedScene,
  ScrapedPerformer,
} from "../scraper-shared/types";
import { guessNationality } from "../scraper-shared/nationality";
import { parseMeasurements } from "../scraper-shared/measurements";
import { toName } from "../scraper-shared/names";
import { gmRequest, type GraphQLError } from "../gm-request";

// Scrape-CI doesn't share its scrapers like local Stash does
// so we reconstruct its list of scrapers from the same source it uses
type GitHubScraperDefinition = {
  filename: string;
  name: string;
  sites: string[];
  searchTypes: {
    scene: { url: boolean };
    performer: { url: boolean };
  };
};

async function fetchScraperPatterns(): Promise<
  [ScraperPattern[], ScraperPattern[]]
> {
  const response = await fetch(
    "https://stashapp.github.io/CommunityScrapers/assets/scrapers.json",
  );
  const scrapers: GitHubScraperDefinition[] = await response.json();
  const patternsFor = (type: "scene" | "performer"): ScraperPattern[] =>
    scrapers
      .filter((scraper) => scraper.searchTypes[type].url)
      .flatMap((scraper) =>
        scraper.sites.map((url) => ({
          scraperName: scraper.name,
          pattern: url,
        })),
      );
  return [patternsFor("scene"), patternsFor("performer")];
}

// `result` is untyped raw JSON off the wire, a defensible boundary `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeScrapeCiSceneResult(result: any): ScrapedScene {
  return {
    ...result,
    studio: result.studio ? toName(result.studio) : null,
    performers: (result.performers || []).map(toName),
    tags: (result.tags || []).map(toName),
  };
}

async function scrapeScene(
  url: string,
  endpoint: string,
  apiKey: string,
): Promise<ScrapedScene> {
  const { status, response } = await gmRequest<{
    jobId: string;
    result: unknown;
    errors?: GraphQLError[];
  }>({
    method: "POST",
    url: endpoint,
    responseType: "json",
    headers: {
      "Content-Type": "application/json",
    },
    data: JSON.stringify({
      url,
      scrapeType: "scene",
      auth: apiKey,
    }),
  });
  console.debug(
    `Scrape debug page at ${endpoint.replace("api/scrape", "scene?id=" + response.jobId)}`,
  );
  if (status != 200) {
    const errors = response.errors?.map((e) => e.message).join("\n");
    throw new Error(`Scraping scene from '${url}' failed: ${errors}`);
  }
  if (!response.result) {
    throw new Error(
      `Scraper returned no data for '${url}', possibly broken or geoblocked`,
    );
  }
  return normalizeScrapeCiSceneResult(response.result);
}

// `result` is untyped raw JSON off the wire, a defensible boundary `any`.
export function normalizeScrapeCiPerformerResult(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any,
): ScrapedPerformer {
  return {
    ...result,
    measurements: parseMeasurements(result.measurements),
    country: guessNationality(result.country),
  };
}

async function scrapePerformer(
  url: string,
  endpoint: string,
  apiKey: string,
): Promise<ScrapedPerformer> {
  const { status, response } = await gmRequest<{
    jobId: string;
    result: unknown;
    errors?: GraphQLError[];
  }>({
    method: "POST",
    url: endpoint,
    responseType: "json",
    headers: {
      "Content-Type": "application/json",
    },
    data: JSON.stringify({
      url,
      scrapeType: "performer",
      auth: apiKey,
    }),
  });
  console.debug(
    `Scrape debug page at ${endpoint.replace("api/scrape", "performer?id=" + response.jobId)}`,
  );
  if (status != 200) {
    const errors = response.errors?.map((e) => e.message).join("\n");
    throw new Error(`Scraping performer from '${url}' failed: ${errors}`);
  }
  // A crashed/outdated scraper returns a null/empty result rather
  // than an error
  if (!response.result) {
    throw new Error(
      `Scraper returned no data for '${url}', possibly broken or geoblocked`,
    );
  }
  return normalizeScrapeCiPerformerResult(response.result);
}

export default {
  fetchScraperPatterns,
  scrapeScene,
  scrapePerformer,
};
