// vite-plugin-monkey HMR hook: edits here reload live in the browser
// without needing to reinstall the userscript, as long as the dev
// server is running and the loader script is installed
if (import.meta.hot) {
  import.meta.hot.accept();
}
import css from "./styles.css?verbatim";
import {
  extractSceneEditCardData,
  extractPerformerEditCardData,
} from "./extract/editcard";
import stash from "./stash/scrape";
import {
  fetchStudioAliases,
  fetchPerformerAliases,
  fetchTagAliases,
} from "./stashbox/graphql";
import { extractPerformerFormData } from "./extract/performer-form";
import { extractSceneFormData } from "./extract/scene-form";
import { reloadScraperPatterns } from "./scraper-dispatch";
import { showConfigMenu } from "./config-menu";
import { initEditcardRescrape } from "./edit-card/verify";
import { initEditPageRescrape } from "./edit-page/inject";
import { watchPanelForResetMenuCommand } from "./edit-page/panel";

// @ts-ignore
unsafeWindow.rescrape = {
  extractPerformerFormData,
  extractSceneFormData,
  extractSceneEditCardData,
  extractPerformerEditCardData,
  stash,
  fetchStudioAliases,
  fetchPerformerAliases,
  fetchTagAliases,
};

GM_addStyle(css);

GM_registerMenuCommand("⚙️ Configure", showConfigMenu);

async function initialize() {
  try {
    await reloadScraperPatterns();
  } catch (error) {
    console.error("Failed to initialize scraper patterns:", error);
  }

  // Edit-card rescrape icons (edit queue and edits tab)
  initEditcardRescrape();

  // Edit-page rescrape panel (scene / performer edit forms)
  initEditPageRescrape();

  watchPanelForResetMenuCommand();

  // Re-run on SPA navigation
  const onNav = () => {
    console.debug(
      "[rescrape] SPA navigation detected, re-running initEditPageRescrape",
    );
    setTimeout(initEditPageRescrape, 300);
  };
  const { pushState, replaceState } = history;
  history.pushState = function (...args) {
    pushState.apply(history, args);
    onNav();
  };
  history.replaceState = function (...args) {
    replaceState.apply(history, args);
    onNav();
  };
  window.addEventListener("popstate", onNav);
  console.debug("[rescrape] SPA navigation hooks installed");
}

initialize();
