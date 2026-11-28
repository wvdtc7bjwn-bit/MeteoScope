const sidebarStates = new WeakMap();

// Capture the outgoing offset before its content is replaced and restore only
// on navigation. Live updates within a panel must not move the user's reading.
export function prepareSidebarScroll(sidebar, key, { loading = false } = {}) {
  if (!sidebar) return () => {};
  let state = sidebarStates.get(sidebar);
  if (!state) {
    state = { key, positions: new Map(), pendingTop: null };
    sidebarStates.set(sidebar, state);
    return () => {};
  }
  const changed = state.key !== key;
  if (changed) {
    state.positions.set(state.key, state.pendingTop ?? sidebar.scrollTop);
    state.key = key;
    state.pendingTop = state.positions.get(key) ?? 0;
  }
  if (loading) {
    state.pendingTop ??= sidebar.scrollTop;
    return changed ? () => { sidebar.scrollTop = 0; } : () => {};
  }
  if (state.pendingTop === null) return () => {};
  const top = state.pendingTop;
  state.pendingTop = null;
  return () => { sidebar.scrollTop = top; };
}
