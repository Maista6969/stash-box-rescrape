import type {
  ScraperPattern,
  ScrapedScene,
  ScrapedPerformer,
} from "../scraper-shared/types";
import { guessNationality } from "../scraper-shared/nationality";
import { parseMeasurements } from "../scraper-shared/measurements";
import { toName } from "../scraper-shared/names";

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
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
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
      onload: ({ status, response }) => {
        console.debug(
          `Scrape debug page at ${endpoint.replace("api/scrape", "scene?id=" + response.jobId)}`,
        );
        if (status != 200) {
          let errors = response.errors
            .map((e: { message: any }) => e.message)
            .join("\n");
          return reject(`Scraping scene from '${url}' failed: ${errors}`);
        }
        if (!response.result) {
          return reject(
            `Scraper returned no data for '${url}', possibly broken or geoblocked`,
          );
        }
        return resolve(normalizeScrapeCiSceneResult(response.result));
      },
      onerror: (error) => {
        return reject(`Request error for ${url}: ${error}`);
      },
    });
  });
}

export function normalizeScrapeCiPerformerResult(
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
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
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
      onload: ({ status, response }) => {
        console.debug(
          `Scrape debug page at ${endpoint.replace("api/scrape", "performer?id=" + response.jobId)}`,
        );
        if (status != 200) {
          let errors = response.errors
            .map((e: { message: any }) => e.message)
            .join("\n");
          return reject(`Scraping performer from '${url}' failed: ${errors}`);
        }
        // A crashed/outdated scraper returns a null/empty result rather
        // than an error
        if (!response.result) {
          return reject(
            `Scraper returned no data for '${url}', possibly broken or geoblocked`,
          );
        }
        return resolve(normalizeScrapeCiPerformerResult(response.result));
      },
      onerror: (error) => {
        reject(`Request error for ${url}: ${error}`);
      },
    });
  });
}

export default {
  fetchScraperPatterns,
  scrapeScene,
  scrapePerformer,
};
