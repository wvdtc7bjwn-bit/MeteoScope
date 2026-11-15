// Playback uses a monotonic clock. Pausing, seeking or changing speed never
// rewrites the real EEW clock or starts a second animation loop.
export function createSimulationPlayer({ duration, onFrame, now = () => performance.now(), requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame, frameInterval = 100 }) {
  let elapsed = 0;
  let speed = 1;
  let running = false;
  let disposed = false;
  let request = null;
  let previous = 0;
  let lastPaint = -Infinity;
  let interrupted = false;
  const snapshot = () => ({ elapsed, speed, running, interrupted, completed: elapsed >= duration, duration });
  const emit = () => onFrame(snapshot());
  const tick = timestamp => {
    request = null;
    if (!running || disposed) return;
    // Browser suspension or a long blocked main thread must not skip the scene.
    if (timestamp - previous > 2500) { running = false; interrupted = true; emit(); return; }
    elapsed = Math.min(duration, elapsed + Math.max(0, timestamp - previous) / 1000 * speed);
    previous = timestamp;
    if (elapsed >= duration) running = false;
    if (timestamp - lastPaint >= frameInterval || !running) { lastPaint = timestamp; emit(); }
    if (running) request = requestFrame(tick);
  };
  const pause = () => {
    if (disposed) return;
    if (running && now() - previous <= 2500) elapsed = Math.min(duration, elapsed + Math.max(0, now() - previous) / 1000 * speed);
    running = false;
    if (request != null) cancelFrame(request);
    request = null;
    emit();
  };
  return {
    play() {
      if (disposed || running || elapsed >= duration) return;
      running = true;
      interrupted = false;
      previous = now();
      lastPaint = -Infinity;
      emit();
      if (running && !disposed) request = requestFrame(tick);
    },
    pause,
    suspend() {
      if (disposed || !running) return;
      running = false; interrupted = true;
      if (request != null) cancelFrame(request);
      request = null;
      emit();
    },
    seek(value) {
      if (disposed || !Number.isFinite(Number(value))) return;
      elapsed = Math.max(0, Math.min(duration, Number(value)));
      previous = now();
      emit();
    },
    setSpeed(value) {
      if (disposed || ![.5, 1, 2, 5].includes(Number(value))) return;
      const resume = running;
      pause(); speed = Number(value); emit(); if (resume) this.play();
    },
    snapshot,
    dispose() {
      running = false; disposed = true;
      if (request != null) cancelFrame(request);
      request = null;
    }
  };
}
