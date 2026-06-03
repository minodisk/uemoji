import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ejs from "ejs";

const here = import.meta.dirname;
const root = resolve(here, "../../..");

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const template = readFileSync(resolve(here, "../src/manifest.json"), "utf8");
// Chrome requires version to be 1-4 dot-separated integers, so the
// local-dev fallback must not contain a suffix like "-dev".
const version = (process.env.VERSION ?? "0.0.0").replace(/^v/, "");

const out = ejs.render(template, { ...pkg, version });
const outPath = resolve(root, "out/manifest.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, out);
console.log(`wrote ${outPath} (version: ${version})`);
