import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/ui/settingsModal.js', import.meta.url), 'utf8');
const frames = new Map();
let nextFrame = 0;
let reducedMotion = false;
const states = new WeakMap();
const context = vm.createContext({
  settingsGroupAnimations: states,
  requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
  cancelAnimationFrame(id) { frames.delete(id); },
  window: { matchMedia: () => ({ matches: reducedMotion }) }
});
vm.runInContext(source.slice(source.indexOf('function setSettingsGroupExpanded('), source.indexOf('function normalizeSettingsFilter(')), context);
function makeGroup() {
  const content = { hidden: true, inert: true };
  const scroller = { scrollTop: 230 };
  const toggle = { setAttribute(_, value) { toggle.expanded = value; } };
  const style = { removeProperty(name) { delete style[name]; } };
  const group = {
    hidden: false, expanded: false, expandedHeight: 350, style,
    classList: { toggle(_, value) { group.expanded = value; } },
    querySelector: selector => selector === '.settings-group-content' ? content : toggle,
    closest: () => scroller,
    getBoundingClientRect: () => ({ height: group.animation?.visibleHeight
      ?? (style.height ? parseFloat(style.height) : group.expanded ? group.expandedHeight : 54) }),
    animate(keyframes, options) {
      const animation = { keyframes, options, visibleHeight: parseFloat(keyframes[0].height),
        cancel() { animation.cancelled = true; if (group.animation === animation) group.animation = null; } };
      group.animation = animation;
      return animation;
    }
  };
  return { group, content, scroller, toggle };
}
function flushFrame() {
  const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn());
}
const { group, content, scroller, toggle } = makeGroup();
context.setSettingsGroupExpanded(group, true);
assert.equal(group.getBoundingClientRect().height, 54, 'opening must not expose full content before animation');
group.expandedHeight = 500; // Content may render lazily before the first animation frame.
flushFrame();
assert.equal(group.getBoundingClientRect().height, 54);
assert.equal(group.animation.keyframes[1].height, '500px');
assert.equal(scroller.scrollTop, 230);
group.animation.onfinish();
assert.equal(group.getBoundingClientRect().height, 500);
assert.equal(group.style.height, undefined);
assert.equal(content.hidden, false);
context.setSettingsGroupExpanded(group, false);
assert.equal(group.getBoundingClientRect().height, 500, 'closing must not collapse for a frame before animation');
flushFrame();
const closing = group.animation;
closing.visibleHeight = 180;
context.setSettingsGroupExpanded(group, true);
assert.ok(closing.cancelled);
assert.equal(group.getBoundingClientRect().height, 180, 'reversal starts at the visible height');
closing.onfinish();
assert.equal(toggle.expanded, 'true', 'stale completion must not undo a new toggle');
flushFrame();
assert.equal(group.animation.keyframes[0].height, '180px');
group.animation.onfinish();
context.setSettingsGroupExpanded(group, false);
context.setSettingsGroupExpanded(group, true); // Reverse before the queued frame.
assert.equal(frames.size, 1);
flushFrame();
group.animation.onfinish();
reducedMotion = true;
context.setSettingsGroupExpanded(group, false);
assert.equal(group.getBoundingClientRect().height, 54);
assert.equal(content.hidden, true);
assert.equal(content.inert, true);
assert.equal(group.style.height, undefined);
assert.equal(frames.size, 0);
console.log('Settings animation: no pre-frame height jumps, lazy content, scroll retention, rapid reversals and reduced motion passed');
