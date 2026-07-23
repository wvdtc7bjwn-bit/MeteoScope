import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [styles, index] = await Promise.all([
  readFile(new URL("../src/style.css", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8")
]);

assert.match(styles, /--sidebar-width:\s*clamp\(300px,\s*24vw,\s*380px\)/);
assert.match(styles, /grid-template-columns:\s*var\(--sidebar-width\)\s+minmax\(0,\s*1fr\)/);
assert.match(
  styles,
  /@media \(orientation: landscape\) and \(max-width: 1024px\) and \(max-height: 600px\)/
);
assert.match(styles, /#main-tabs\s*\{[\s\S]*?bottom:\s*max\(8px,\s*env\(safe-area-inset-bottom\)\)/);
assert.match(styles, /#map-attribution\s*\{[\s\S]*?max-height:\s*24px;[\s\S]*?white-space:\s*nowrap;/);

assert.match(index, /width=device-width/);
assert.match(index, /viewport-fit=cover/);

console.log("Responsive layouts: OK");
