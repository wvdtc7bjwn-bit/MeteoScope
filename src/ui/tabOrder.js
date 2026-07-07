export const TAB_ORDER_STORAGE_KEY = "meteoscope.tabOrder.v1";

export function getDefaultTabOrder(tabs = []) {
  return tabs.map((tab) => tab.id).filter(Boolean);
}

export function normalizeTabOrder(order, tabs = []) {
  const defaultOrder = getDefaultTabOrder(tabs);
  const knownIds = new Set(defaultOrder);
  const normalized = [];

  if (Array.isArray(order)) {
    order.forEach((id) => {
      if (knownIds.has(id) && !normalized.includes(id)) normalized.push(id);
    });
  }

  defaultOrder.forEach((id) => {
    if (!normalized.includes(id)) normalized.push(id);
  });

  return normalized;
}

export function loadTabOrder(tabs = []) {
  try {
    return normalizeTabOrder(JSON.parse(localStorage.getItem(TAB_ORDER_STORAGE_KEY) ?? "null"), tabs);
  } catch {
    return getDefaultTabOrder(tabs);
  }
}

export function saveTabOrder(order, tabs = []) {
  const normalized = normalizeTabOrder(order, tabs);
  try {
    localStorage.setItem(TAB_ORDER_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // localStorage can be unavailable in privacy-restricted environments.
  }
  return normalized;
}

export function resetTabOrder(tabs = []) {
  try {
    localStorage.removeItem(TAB_ORDER_STORAGE_KEY);
  } catch {
    // localStorage can be unavailable in privacy-restricted environments.
  }
  return getDefaultTabOrder(tabs);
}
