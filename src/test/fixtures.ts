import { readFileSync } from "node:fs";
import path from "node:path";

const FIXTURES_DIR = path.resolve(__dirname, "../../example_pages");

export type FixtureName =
  | "edit-scene.html"
  | "edit-performer.html"
  | "editcard-performer.html"
  | "editcard-scene.html";

export function loadFixtureDocument(name: FixtureName): Document {
  const html = readFileSync(path.join(FIXTURES_DIR, name), "utf-8");
  return new DOMParser().parseFromString(html, "text/html");
}

export function documentFromHTML(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}
