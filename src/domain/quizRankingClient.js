const SESSION_KEY = "meteoscope.quiz.session.v1";

function isExternalWebHost() {
  return globalThis.location?.hostname?.endsWith("github.io") === true;
}

function apiURL(path) {
  const base = isExternalWebHost() ? "https://meteoscope.pages.dev/api/quiz" : "/api/quiz";
  return `${base}/${path.replace(/^\//u, "")}`;
}

function storedToken() {
  try { return sessionStorage.getItem(SESSION_KEY) ?? ""; } catch { return ""; }
}

export function getMeteoScopeAccountSessionToken() {
  return storedToken();
}

function saveToken(token) {
  try {
    if (token) sessionStorage.setItem(SESSION_KEY, token);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Same-origin Pages sessions continue to work through the HttpOnly cookie.
  }
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  const token = storedToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  let response;
  try {
    response = await fetch(apiURL(path), { ...options, headers, credentials: "include", cache: "no-store" });
  } catch {
    throw new Error("ランキングサーバーへ接続できませんでした。");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) saveToken("");
    const error = new Error(result.error || "ランキングを処理できませんでした。");
    error.status = response.status;
    throw error;
  }
  if (result.sessionToken) saveToken(result.sessionToken);
  return result;
}

function accountPayload(values) {
  return JSON.stringify({
    ...values,
    client: isExternalWebHost() ? "web-external" : "web"
  });
}

export const QuizRankingClient = Object.freeze({
  configuration: () => request("config"),
  account: () => request("account"),
  async updateProfile(values) {
    let result;
    try { result = await request("account", { method: "PUT", body: JSON.stringify(values) }); }
    catch (error) {
      if (error.status === 404) throw new Error("保存機能がサーバーにまだ反映されていないため、変更は保存されていません。");
      throw error;
    }
    globalThis.dispatchEvent?.(new Event("meteoscope:account-change"));
    return result;
  },
  async register(values) {
    const result = await request("register", { method: "POST", body: accountPayload(values) });
    globalThis.dispatchEvent?.(new Event("meteoscope:account-change"));
    return result;
  },
  async login(values) {
    const result = await request("login", { method: "POST", body: accountPayload(values) });
    globalThis.dispatchEvent?.(new Event("meteoscope:account-change"));
    return result;
  },
  async logout() {
    try { await request("logout", { method: "POST", body: "{}" }); }
    finally { saveToken(""); globalThis.dispatchEvent?.(new Event("meteoscope:account-change")); }
  },
  async deleteAccount(password) {
    const result = await request("account", { method: "DELETE", body: JSON.stringify({ password }) });
    saveToken("");
    globalThis.dispatchEvent?.(new Event("meteoscope:account-change"));
    return result;
  },
  leaderboard: (difficulty) => request(`leaderboard?difficulty=${encodeURIComponent(difficulty)}`),
  challenge: (difficulty) => request("challenge", { method: "POST", body: JSON.stringify({ difficulty }) }),
  submit: (challengeID, answers) => request("submit", {
    method: "POST",
    body: JSON.stringify({ challengeID, answers })
  })
});
