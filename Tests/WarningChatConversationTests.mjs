import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createWarningChatConversation} from "../src/ui/warningChatConversation.js";

class Element {
  constructor(doc) { this.ownerDocument = doc; this.children = []; this.events = {}; this.attrs = {}; this.hidden = false; this.top = 200; }
  append(...nodes) { for (const node of nodes) {node.parent = this; this.children.push(node);} }
  replaceChildren(...nodes) { for (const node of this.children) node.parent = null; this.children = []; this.append(...nodes); }
  setAttribute(key, value) {this.attrs[key] = value;}
  addEventListener(type, fn) {(this.events[type] ??= []).push(fn);}
  emit(type, value = {}) {for (const fn of this.events[type] ?? []) fn(value);}
  remove() {if (this.parent) {this.parent.children = this.parent.children.filter(node => node !== this); this.parent = null;}}
  replaceWith(node) {const parent = this.parent; const at = parent.children.indexOf(this); this.parent = null; node.parent = parent; parent.children[at] = node;}
  contains(node) {return this.children.includes(node) || this.children.some(child => child.contains(node));}
  getBoundingClientRect() {return {top: this.top};}
  focus(options) {this.focusOptions = options;}
  scrollTo(options) {this.scrollCalls.push(options); this.scrollTop = options.top;}
}
const doc = {createElement() {return new Element(doc);}};
const messages = new Element(doc), latestButton = new Element(doc), viewport = new Element(doc);
viewport.top = 100; viewport.scrollHeight = 1000; viewport.clientHeight = 200; viewport.scrollTop = 800; viewport.scrollCalls = [];
let reduced = false, next = 0;
const frames = new Map();
const presentation = createWarningChatConversation({viewport, messages, latestButton,
  requestFrame(fn) {const id = ++next; frames.set(id, fn); return id;}, cancelFrame(id) {frames.delete(id);}, reducedMotion: () => reduced});
const flush = () => {for (const [id, fn] of [...frames]) {frames.delete(id); fn();}};
presentation.addQuestion("あなた", "試験の質問");
presentation.startPending(); presentation.startPending();
assert.equal(messages.children.length, 2, "No duplicate wait indicators");
assert.equal(messages.attrs["aria-busy"], "true");
assert.equal(messages.children[1].attrs["aria-hidden"], "true", "One announcement uses the existing status region");
assert.equal(messages.children[1].children[1].children.length, 3);
assert.equal(frames.size, 1, "Only one pending scroll frame");
flush(); assert.equal(viewport.scrollCalls.at(-1).behavior, "smooth");
presentation.addAnswer("資料から確認", "検証済みの全文");
assert.equal(messages.children.length, 2); assert.equal(messages.children[1].children[1].textContent, "検証済みの全文");
assert.equal(messages.attrs["aria-busy"], "false"); assert.equal(latestButton.hidden, true);
flush();

presentation.addQuestion("あなた", "次の質問"); presentation.startPending(); flush();
viewport.scrollTop = 100; viewport.emit("wheel");
const priorScrolls = viewport.scrollCalls.length;
presentation.addAnswer("資料から確認", "次の回答全文"); flush();
assert.equal(viewport.scrollCalls.length, priorScrolls, "Do not pull a reader away from older messages");
assert.equal(latestButton.hidden, false);
latestButton.emit("click"); flush();
assert.equal(latestButton.hidden, true);
assert.deepEqual(messages.children.at(-1).focusOptions, {preventScroll: true});

presentation.addQuestion("あなた", "現在の質問"); presentation.startPending();
const question = messages.children.at(-2), pending = messages.children.at(-1);
presentation.clear({keepCurrentTurn: true});
assert.deepEqual(messages.children, [question, pending], "A context revision keeps the same nodes without replaying the question animation");
assert.equal(frames.size, 0);
presentation.stopPending(); assert.deepEqual(messages.children, [question]);
assert.equal(messages.attrs["aria-busy"], "false");

reduced = true; presentation.addQuestion("あなた", "動きを減らす設定"); flush();
assert.equal(viewport.scrollCalls.at(-1).behavior, "instant");
presentation.startPending(); presentation.clear(); flush();
assert.equal(messages.children.length, 0); assert.equal(frames.size, 0); assert.equal(latestButton.hidden, true);
presentation.startPending(); viewport.emit("touchmove"); assert.equal(frames.size, 0, "Touch input cancels a queued programmatic scroll");
presentation.clear(); presentation.addQuestion("あなた", "再度開いた状態"); presentation.startPending();
assert.equal(messages.children.length, 2); presentation.stopPending();
assert.equal(messages.children.length, 1, "Failure/abort cleanup leaves the question for review");
const css = await readFile(new URL("../src/styles/12-warning-chat.css", import.meta.url), "utf8");
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(css, /warning-chat-pending-dots i\) \{ animation: none;/);
assert.doesNotMatch(css, /box-shadow|linear-gradient/);
console.log("Chat conversation: pending lifecycle, full answers, interrupted scrolling, unread control, reduced motion, context revision and cleanup passed.");
