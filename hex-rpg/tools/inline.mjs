/**
 * Fold a Vite build into one self-contained .html file.
 *
 * Artifacts are served under a strict CSP that blocks every external host, so a page
 * that links out to /assets/index.js renders as a blank screen with no error anybody
 * can see. Everything has to be inline.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "dist-play";
const out = process.argv[3] ?? "dist-play/hex-rpg.html";

let html = readFileSync(join(dir, "index.html"), "utf8");
const assets = readdirSync(join(dir, "assets"));

for (const file of assets) {
  const body = readFileSync(join(dir, "assets", file), "utf8");
  // A function replacer, never a string one: bundled JS and minified CSS are full of
  // `$&` and `$\'` sequences, and String.replace expands those, which silently pastes
  // the original <script src=...> tag back into the middle of the code.
  if (file.endsWith(".js")) {
    html = html.replace(
      new RegExp(`<script[^>]*src="[^"]*${file}"[^>]*></script>`),
      () => `<script type="module">${body}</script>`,
    );
  } else if (file.endsWith(".css")) {
    html = html.replace(
      new RegExp(`<link[^>]*href="[^"]*${file}"[^>]*>`),
      () => `<style>${body}</style>`,
    );
  }
}

const leftovers = html.match(/(src|href)="[^"]*\/assets\/[^"]*"/g);
if (leftovers) {
  console.error("Not everything was inlined:", leftovers);
  process.exit(1);
}

writeFileSync(out, html);
console.log(`${out}  ${(html.length / 1024).toFixed(0)} KB`);

/*
 * The artifact host wraps whatever it is given in its own doctype/head/body, so the
 * standalone page cannot be published as-is - a second <html> inside a document does
 * not mount. Emit a fragment too: title, styles, the root node, and the bundle after
 * it, in that order, because the script mounts into #root the moment it runs.
 */
const pick = (re) => (html.match(re) ?? [""])[0];
const fragment = [
  pick(/<title>[\s\S]*?<\/title>/),
  pick(/<style>[\s\S]*?<\/style>/),
  '<div id="root"></div>',
  pick(/<script type="module">[\s\S]*?<\/script>/),
].join("\n");

const fragmentPath = out.replace(/\.html$/, "-artifact.html");
writeFileSync(fragmentPath, fragment);
console.log(`${fragmentPath}  ${(fragment.length / 1024).toFixed(0)} KB`);
