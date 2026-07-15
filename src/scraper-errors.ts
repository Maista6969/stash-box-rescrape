export class EmptyScrapeResultError extends Error {
  constructor(url: string) {
    super(
      `Scraper returned an empty result for '${url}': every field was null or empty`,
    );
    this.name = "EmptyScrapeResultError";
  }
}

export class ScraperCrashedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScraperCrashedError";
  }
}
