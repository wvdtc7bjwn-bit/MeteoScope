import assert from "node:assert/strict";
import { escapeHtml, escapeHtmlString, escapeHtmlPadded, escapeHtmlStringPadded } from "../src/utils/html.js";

for (const serialize of [escapeHtml, escapeHtmlString, escapeHtmlPadded, escapeHtmlStringPadded]) {
  const apostrophe = serialize === escapeHtmlPadded || serialize === escapeHtmlStringPadded ? "&#039;" : "&#39;";
  assert.equal(serialize('<a title="x">&\'</a>'), `&lt;a title=&quot;x&quot;&gt;&amp;${apostrophe}&lt;/a&gt;`);
  assert.equal(serialize("&#39;"), "&amp;#39;", "already escaped input remains literal text");
  assert.equal(serialize("地震・雨雲😀\n"), "地震・雨雲😀\n");
  assert.equal(serialize(0), "0");
  assert.equal(serialize(false), "false");
}
for (const serialize of [escapeHtml, escapeHtmlPadded]) {
  assert.equal(serialize(null), "");
  assert.equal(serialize(undefined), "");
}
for (const serialize of [escapeHtmlString, escapeHtmlStringPadded]) {
  assert.equal(serialize(null), "null");
  assert.equal(serialize(undefined), "undefined");
}
console.log("HTML escaping: safe text, quoted attributes and legacy serializers passed");
