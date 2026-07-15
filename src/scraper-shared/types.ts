export type ScraperPattern = {
  scraperName: string;
  pattern: string;
};

export type SizedImage = {
  src: string;
  height: number;
  width: number;
};

// Needs to match the GraphQL query for scene scrapes
// `image` is the raw scraped URL; `getImageDimensions` resolves it to a `SizedImage` before display/comparison
export type ScrapedScene = {
  title: string | null;
  code: string | null;
  details: string | null;
  urls: string[] | null;
  date: string | null;
  image: string | null;
  director: string | null;
  studio: string | null;
  tags: string[] | null;
  performers: string[] | null;
};

// Needs to match the GraphQL query for performer scrapes
export type ScrapedPerformer = {
  name: string | null;
  gender: string | null;
  birthdate: string | null;
  death_date: string | null;
  ethnicity: string | null;
  country: string | null;
  eye_color: string | null;
  hair_color: string | null;
  height: string | null;
  measurements: {
    bandSize: string | null;
    cupSize: string | null;
    waistSize: string | null;
    hipSize: string | null;
  } | null;
  fake_tits: string | null;
  aliases: string[] | null;
};
