import type {
  ScraperPattern,
  ScrapedScene,
  ScrapedPerformer,
} from "../scraper-shared/types";
import { guessNationality } from "../scraper-shared/nationality";
import { parseMeasurements } from "../scraper-shared/measurements";
import { ScraperCrashedError } from "../scraper-errors";
import { gmRequest, type GraphQLError } from "../gm-request";

type StashScraperDefinition = {
  name: string;
  scene: { urls: string[] } | null;
  performer: { urls: string[] } | null;
};

export async function fetchScraperPatterns(
  endpoint: string,
  apiKey: string,
): Promise<[ScraperPattern[], ScraperPattern[]]> {
  const { status, response } = await gmRequest<{
    data: { listScrapers: StashScraperDefinition[] };
    errors?: GraphQLError[];
  }>({
    method: "POST",
    responseType: "json",
    url: endpoint,
    headers: {
      "Content-Type": "application/json",
      ApiKey: apiKey,
    },
    data: JSON.stringify({
      query: `
          query {
            listScrapers(types: [SCENE, PERFORMER]) {
              name
              scene {
                urls
              }
              performer {
                urls
              }
            }
          }`,
    }),
  });
  if (status != 200) {
    const errors = response.errors?.map((e) => e.message).join("\n");
    throw new Error(
      `Failed to fetch scraper patterns from ${endpoint}: ${errors}`,
    );
  }
  const scrapers = response.data.listScrapers;
  const patternsFor = (type: "scene" | "performer"): ScraperPattern[] =>
    scrapers.flatMap((scraper) => {
      const urls = scraper[type]?.urls;
      if (!urls) return [];
      return urls.map((url) => ({
        scraperName: scraper.name,
        pattern: url,
      }));
    });
  return [patternsFor("scene"), patternsFor("performer")];
}

// Scrape results from local Stash need flattening for `studio`, `performers`,
// and `tags` (e.g. `{name: "Teen"}` -> `"Teen"`); any other field can be null
// or empty. `src` is untyped raw JSON off the wire, a defensible boundary
// `any` rather than a real type gap.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeStashScrapeResult(src: any): ScrapedScene {
  return {
    ...src,
    studio: src.studio?.name || null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    performers: (src.performers || []).map((p: any) => p.name),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tags: (src.tags || []).map((p: any) => p.name),
  };
}

async function scrapeScene(
  url: string,
  endpoint: string,
  apiKey: string,
): Promise<ScrapedScene> {
  const { status, response } = await gmRequest<{
    data: { scrapeSceneURL: unknown };
    errors?: GraphQLError[];
  }>({
    method: "POST",
    url: endpoint,
    responseType: "json",
    headers: {
      "Content-Type": "application/json",
      ApiKey: apiKey,
    },
    data: JSON.stringify({
      query: `
        query ScrapeSceneURL($url: String!) {
          scrapeSceneURL(url: $url) {
            title
            code
            details
            urls
            date
            image
            director
            studio {
              name
              parent {
                name
              }
            }
            tags {
              name
            }
            performers {
              name
              gender
            }
          }
        }
        `,
      variables: { url },
    }),
  });
  if (response.errors?.length) {
    const message = response.errors.map((e) => e.message).join("\n");
    throw new ScraperCrashedError(message);
  }
  if (status != 200) {
    throw new Error(`Scraping scene from '${url}' failed with HTTP ${status}`);
  }
  const src = response.data.scrapeSceneURL;
  if (!src) {
    throw new Error(
      `Scraper returned no data for '${url}', possibly broken or geoblocked`,
    );
  }

  return normalizeStashScrapeResult(src);
}

// `raw` is untyped raw JSON off the wire, a defensible boundary `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeStashPerformerResult(raw: any): ScrapedPerformer {
  return {
    ...raw,
    aliases: raw.aliases
      ? raw.aliases.split(",").map((a: string) => a.trim())
      : null,
    country: guessNationality(raw.country),
    measurements: parseMeasurements(raw.measurements),
  };
}

async function scrapePerformer(
  url: string,
  endpoint: string,
  apiKey: string,
): Promise<ScrapedPerformer> {
  const { status, response } = await gmRequest<{
    data: { scrapePerformerURL: unknown };
    errors?: GraphQLError[];
  }>({
    method: "POST",
    url: endpoint,
    responseType: "json",
    headers: {
      "Content-Type": "application/json",
      ApiKey: apiKey,
    },
    data: JSON.stringify({
      query: `
          query ScrapePerformerURL($url: String!) {
            scrapePerformerURL(url: $url) {
              name
              gender
              birthdate
              death_date
              ethnicity
              country
              eye_color
              hair_color
              height
              measurements
              fake_tits
              aliases
            }
          }
          `,
      variables: { url },
    }),
  });
  if (response.errors?.length) {
    const message = response.errors.map((e) => e.message).join("\n");
    throw new ScraperCrashedError(message);
  }
  if (status != 200) {
    throw new Error(
      `Scraping performer from '${url}' failed with HTTP ${status}`,
    );
  }
  const raw = response.data.scrapePerformerURL;
  if (!raw) {
    throw new Error(
      `Scraper returned no data for '${url}', possibly broken or geoblocked`,
    );
  }

  return normalizeStashPerformerResult(raw);
}

export default {
  fetchScraperPatterns,
  scrapeScene,
  scrapePerformer,
};
