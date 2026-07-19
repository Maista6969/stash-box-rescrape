const CONFIG_KEY = "stash-box-rescrape";
type Mode = "local" | "remote";
type Endpoint = {
  endpoint: string;
  apiKey: string;
};
export type PanelPosition = { top: number; left: number } | null;
export type PanelSize = { width: number; height: number } | null;
export type Config = {
  mode: Mode;
  local: Endpoint;
  remote: Endpoint;
  // Remembers the position of the "Scraped with" panel on edit pages
  panelPosition: PanelPosition;
  panelSize: PanelSize;
};

const defaultConfig: Config = {
  mode: "local",
  local: { endpoint: "http://localhost:9999/graphql", apiKey: "" },
  remote: {
    endpoint: "https://scrape.feederbox.cc/api/scrape",
    apiKey: "",
  },
  panelPosition: null,
  panelSize: null,
};
export const loadConfig = () => {
  try {
    return { ...defaultConfig, ...JSON.parse(GM_getValue(CONFIG_KEY, "{}")) };
  } catch {
    return { ...defaultConfig };
  }
};
export const saveConfig = (cfg: Config) =>
  GM_setValue(CONFIG_KEY, JSON.stringify(cfg));
