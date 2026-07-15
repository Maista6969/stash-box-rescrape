import type {
  ScraperPattern,
  ScrapedScene,
  ScrapedPerformer,
} from "../scraper-shared/types";
import { guessNationality } from "../scraper-shared/nationality";
import { parseMeasurements } from "../scraper-shared/measurements";
import { ScraperCrashedError } from "../scraper-errors";

type StashScraperDefinition = {
  name: string;
  scene: { urls: string[] } | null;
  performer: { urls: string[] } | null;
};

export function fetchScraperPatterns(
  endpoint: string,
  apiKey: string,
):
  | [ScraperPattern[], ScraperPattern[]]
  | PromiseLike<[ScraperPattern[], ScraperPattern[]]> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
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
      onload: (res) => {
        if (res.status != 200) {
          let errors = res.response.errors
            .map((e: { message: any }) => e.message)
            .join("\n");
          return reject(
            `Failed to fetch scraper patterns from ${endpoint}: ${errors}`,
          );
        }
        const scrapers: StashScraperDefinition[] =
          res.response.data.listScrapers;
        const patternsFor = (type: "scene" | "performer"): ScraperPattern[] =>
          scrapers.flatMap((scraper) => {
            const urls = scraper[type]?.urls;
            if (!urls) return [];
            return urls.map((url) => ({
              scraperName: scraper.name,
              pattern: url,
            }));
          });
        return resolve([patternsFor("scene"), patternsFor("performer")]);
      },
      onerror: (req) =>
        reject({
          // @ts-ignore: we know finalUrl exists in ViolentMonkey but should check for compat with other userscript engines
          msg: `HTTP Request failed when fetching scene scrapers: ${req.finalUrl} returned ${req.status}`,
        }),
    });
  });
}

/*
Scrape results from local look like this:
- any field can be null or empty
- tags and performers need to be flattened (just "Teen", {name: "Teen"})
{
  "title": "The Boss Let Me Fuck All of My Coworkers: Freeuse On the Job",
  "date": "2026-07-15",
  "performers": [
    {
      "name": "Jewelz Blu",
      "gender": "FEMALE",
    },
    {
      "name": "Adriana Maya",
      "gender": "FEMALE",
    },
    {
      "name": "Luna Luxe",
      "gender": "FEMALE",
    },
    {
      "name": "Eric John",
      "gender": "MALE",
    },
    {
      "name": "Troy Francisco",
      "gender": "MALE",
    }
  ],
  "image": "https://images.psmcdn.net/teamskeet/fuf/adriana_maya_jewelz_blu/shared/hi.jpg",
  "code": "32286",
  "details": "Is this the best job ever? It just might be… I had been doing so well that the boss offered me a special perk - I could use the women at the office as my personal fuck toys, all day long, no questions asked. Huh?! Is this cool with HR? I mean, who am I to turn down a good time? If I’m fucking all day long, you know I’m happy! Asriana, Jewelz, and Luna are there for me to use however I want. No restrictions, just unlimited fun. I’ll be logging a LOT of overtime this quarter…",
  "studio": {
    "name": "Freeuse Fantasy",
    "parent": {
      "name": "Freeuse",
    }
  },
  "urls": [
    "https://www.teamskeet.com/movies/the-boss-let-me-fuck-all-of-my-coworkers-freeuse-on-the-job",
    "https://app.reptyle.com/movies/32286"
  ],
  "tags": [
    {
      "name": "African American"
    },
    {
      "name": "Black"
    },
    {
      "name": "Black Hair"
    },
    {
      "name": "Blue Hair"
    },
    {
      "name": "Dreadlocks"
    },
    {
      "name": "Ebony"
    },
    {
      "name": "Long Hair"
    },
    {
      "name": "Medium Height"
    },
    {
      "name": "Office"
    },
    {
      "name": "Standing Doggystyle"
    },
    {
      "name": "Straight"
    },
    {
      "name": "Teen"
    },
  ]
}
*/
export function normalizeStashScrapeResult(src: any): ScrapedScene {
  return {
    ...src,
    studio: src.studio?.name || null,
    performers: (src.performers || []).map((p: any) => p.name),
    tags: (src.tags || []).map((p: any) => p.name),
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
      onload: ({ status, response }) => {
        if (response.errors?.length) {
          const message = response.errors
            .map((e: { message: string }) => e.message)
            .join("\n");
          return reject(new ScraperCrashedError(message));
        }
        if (status != 200) {
          return reject(
            `Scraping scene from '${url}' failed with HTTP ${status}`,
          );
        }
        const src = response.data.scrapeSceneURL;
        if (!src) {
          return reject(
            `Scraper returned no data for '${url}', possibly broken or geoblocked`,
          );
        }

        resolve(normalizeStashScrapeResult(src));
      },
      onerror: (error) => {
        reject(`Request error for ${url}: ${error}`);
      },
    });
  });
}

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
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
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
      onload: ({ status, response }) => {
        if (response.errors?.length) {
          const message = response.errors
            .map((e: { message: any }) => e.message)
            .join("\n");
          return reject(new ScraperCrashedError(message));
        }
        if (status != 200) {
          return reject(
            `Scraping performer from '${url}' failed with HTTP ${status}`,
          );
        }
        const raw = response.data.scrapePerformerURL;
        if (!raw) {
          return reject(
            `Scraper returned no data for '${url}', possibly broken or geoblocked`,
          );
        }

        resolve(normalizeStashPerformerResult(raw));
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
