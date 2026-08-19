function getTokenValue(key) {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}

export function getAccessToken() {
  return getTokenValue("access_token");
}

export function getRefreshToken() {
  return getTokenValue("refresh_token");
}

export function setTokens(access, refresh) {
  if (access) localStorage.setItem("access_token", access);
  if (refresh) localStorage.setItem("refresh_token", refresh);
}

export function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user_info");
}

export function decodeJwt(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
  try {
    const json = atob(padded);
    return JSON.parse(json);
  } catch (_e) {
    return null;
  }
}

export function isTokenValid(token) {
  const payload = decodeJwt(token);
  if (!payload || !payload.exp) return false;
  return payload.exp * 1000 > Date.now() + 30000;
}

export function isAuthenticated() {
  const token = getAccessToken();
  return Boolean(token && isTokenValid(token));
}

export function getUser() {
  const stored = localStorage.getItem("user_info");
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (_e) {
      // fallback
    }
  }
  const token = getAccessToken();
  const payload = decodeJwt(token);
  if (payload) {
    return {
      username: payload.username || payload.user_id || "User",
      email: payload.email || "",
      role: payload.role || "viewer",
      organization: payload.organization_id || null,
    };
  }
  return { username: "", email: "", role: "viewer", organization: null };
}

export function setUser(userInfo) {
  localStorage.setItem("user_info", JSON.stringify(userInfo));
}
