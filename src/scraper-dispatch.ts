import type {
  ScrapedScene,
  ScrapedPerformer,
  ScraperPattern,
  SizedImage,
} from "./scraper-shared/types";
import scrape_ci from "./scrape-ci/scrape";
import stash from "./stash/scrape";
import { getActiveEndpoint, loadConfig } from "./config";
import { showToast } from "./ui/toast";

export type ResolvedScrapedScene = Omit<ScrapedScene, "image"> & {
  image: SizedImage | null;
};

// Don't dump huge data URIs in my console thanks
export function summarizeForLog<T extends { image?: unknown }>(data: T): T {
  const image = data.image;
  if (typeof image === "string" && image.length > 300) {
    return { ...data, image: `[data URI, ${image.length} chars]` };
  }
  return data;
}

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "object")
    return Object.values(value).every(isEmptyValue);
  return false;
}

export function isEmptyScrapedScene(scene: ScrapedScene): boolean {
  return isEmptyValue(scene);
}

export function isEmptyScrapedPerformer(performer: ScrapedPerformer): boolean {
  return isEmptyValue(performer);
}

// Renders an image to get its exact dimensions
export function getImageDimensions(
  scrapeResult: ScrapedScene,
): Promise<ResolvedScrapedScene> {
  return new Promise((resolve) => {
    if (!scrapeResult.image) return resolve({ ...scrapeResult, image: null });
    const imgSource = scrapeResult.image;
    const img = new Image();
    img.onload = () =>
      resolve({
        ...scrapeResult,
        image: { src: imgSource, width: img.width, height: img.height },
      });
    img.onerror = () => {
      console.debug(
        "Unable to render image to resolve its dimensions",
        imgSource,
      );
      return resolve({ ...scrapeResult, image: null });
    };
    img.src = imgSource;
  });
}

// Store available scrapers and their URL patterns
let sceneScraperPatterns: ScraperPattern[] = [];
let performerScraperPatterns: ScraperPattern[] = [];

export function setScraperPatterns(
  scene: ScraperPattern[],
  performer: ScraperPattern[],
) {
  sceneScraperPatterns = scene;
  performerScraperPatterns = performer;
}

export function getScraperPatterns() {
  return { sceneScraperPatterns, performerScraperPatterns };
}

export async function fetchScraperPatterns(
  endpoint: string,
  apiKey: string,
  mode: string,
): Promise<[ScraperPattern[], ScraperPattern[]]> {
  if (mode === "local") {
    return stash.fetchScraperPatterns(endpoint, apiKey);
  } else if (mode === "remote") {
    return scrape_ci.fetchScraperPatterns();
  }
  console.error(`[rescrape] Unknown scrape mode: "${mode}"`);
  return [[], []];
}

export async function reloadScraperPatterns(): Promise<void> {
  const config = loadConfig();
  const { endpoint, apiKey } = getActiveEndpoint(config);
  try {
    const [sceneList, performerList] = await fetchScraperPatterns(
      endpoint,
      apiKey,
      config.mode,
    );
    setScraperPatterns(sceneList, performerList);
    console.log(
      `[rescrape] Reloaded ${sceneList.length} scene scraper patterns and ${performerList.length} performer scraper patterns from ${config.mode} endpoint ${endpoint}`,
    );
  } catch (error) {
    console.error("[rescrape] Failed to reload scraper patterns:", error);
  }

  const { sceneScraperPatterns, performerScraperPatterns } =
    getScraperPatterns();
  if (
    sceneScraperPatterns.length === 0 &&
    performerScraperPatterns.length === 0
  ) {
    showToast(
      "No scraper patterns were loaded, so rescrape features are disabled. Check your endpoint configuration.",
      "error",
      0,
    );
  }
}

export async function scrapeScene(
  url: string,
  endpoint: string,
  apiKey: string,
  mode: "local" | "remote",
): Promise<ScrapedScene> {
  if (mode === "local") {
    return stash.scrapeScene(url, endpoint, apiKey);
  } else if (mode === "remote") {
    return scrape_ci.scrapeScene(url, endpoint, apiKey);
  }
  console.error(`[rescrape] Unknown scrape mode: "${mode}"`, endpoint, apiKey);
  throw new Error(`Unknown scrape mode: "${mode}"`);
}

export async function scrapePerformer(
  url: string,
  endpoint: string,
  apiKey: string,
  mode: "local" | "remote",
): Promise<ScrapedPerformer> {
  if (mode === "local") {
    return stash.scrapePerformer(url, endpoint, apiKey);
  } else if (mode === "remote") {
    return scrape_ci.scrapePerformer(url, endpoint, apiKey);
  }
  console.error(`[rescrape] Unknown scrape mode: "${mode}"`, endpoint, apiKey);
  throw new Error(`Unknown scrape mode: "${mode}"`);
}

export function isURLScrapable(
  url: string,
  objectType?: "scene" | "performer",
) {
  if (objectType === "scene") {
    return sceneScraperPatterns.find(({ pattern }) => url.includes(pattern));
  }
  if (objectType === "performer") {
    return performerScraperPatterns.find(({ pattern }) =>
      url.includes(pattern),
    );
  }
  return (
    sceneScraperPatterns.find(({ pattern }) => url.includes(pattern)) ||
    performerScraperPatterns.find(({ pattern }) => url.includes(pattern))
  );
}
