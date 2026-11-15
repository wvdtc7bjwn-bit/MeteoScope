import assert from "node:assert/strict";
import { createSimulationPlayer } from "../src/simulation/simulationPlayer.js";

let clock = 0;
let next = 0;
const frames = new Map();
const snapshots = [];
const player = createSimulationPlayer({ duration: 30, now: () => clock, requestFrame: callback => { frames.set(++next, callback); return next; }, cancelFrame: id => frames.delete(id), onFrame: state => snapshots.push(state) });
function advance(ms) { clock += ms; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(clock)); }
player.play(); player.play(); assert.equal(frames.size, 1, "one animation loop");
advance(1500); assert.equal(player.snapshot().elapsed, 1.5);
player.pause(); assert.equal(frames.size, 0);
advance(10000); assert.equal(player.snapshot().elapsed, 1.5, "pause is independent of wall clock");
player.seek(10); player.play(); advance(1000); assert.equal(player.snapshot().elapsed, 11);
player.setSpeed(2); assert.equal(frames.size, 1); advance(1000); assert.equal(player.snapshot().elapsed, 13);
player.seek(2); advance(500); assert.equal(player.snapshot().elapsed, 3, "backward seek resets playback epoch");
player.setSpeed(999); assert.equal(player.snapshot().speed, 2);
player.seek(-100); assert.equal(player.snapshot().elapsed, 0);
advance(20000); assert.equal(player.snapshot().elapsed, 30); assert.equal(player.snapshot().running, false); assert.equal(frames.size, 0);
player.seek(0); player.play(); advance(500); assert.equal(player.snapshot().elapsed, 1);
player.dispose(); assert.equal(frames.size, 0); const count = snapshots.length;
player.play(); player.seek(12); player.setSpeed(1); advance(1000); assert.equal(snapshots.length, count, "no frames after disposal");
console.log("Simulation playback: pause, seek, speed, completion, replay and disposal passed");
