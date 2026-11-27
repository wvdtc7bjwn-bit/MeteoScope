import { DOMParser } from "@xmldom/xmldom";

// Adapt xmldom's NodeLists to the browser DOM interface used by JMA parsers.
export function installXmlDom() {
  const previous = globalThis.DOMParser;
  globalThis.DOMParser = class {
    parseFromString(text, type) {
      const document = new DOMParser().parseFromString(text, type);
      document.querySelector = selector => selector === "parsererror" ? document.getElementsByTagName("parsererror")[0] ?? null : null;
      const adapt = node => {
        if (node.getElementsByTagNameNS) {
          const getElements = node.getElementsByTagNameNS.bind(node);
          node.getElementsByTagNameNS = (...args) => Array.from(getElements(...args));
        }
        Object.defineProperty(node, "children", { get: () => Array.from(node.childNodes ?? []).filter(child => child.nodeType === 1) });
        for (const child of Array.from(node.childNodes ?? [])) adapt(child);
      };
      adapt(document);
      return document;
    }
  };
  return () => {
    if (previous === undefined) delete globalThis.DOMParser;
    else globalThis.DOMParser = previous;
  };
}
