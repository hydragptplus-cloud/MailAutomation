import axios from "axios";
import { clearTokens } from "../utils/auth";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

let isRefreshing = false;
let failedQueue = [];
let csrfToken = "";
let csrfPromise = null;

async function getCsrfToken() {
  const cookieToken = document.cookie.split("; ").find((row) => row.startsWith("csrftoken="))?.split("=")[1];
  if (cookieToken) return decodeURIComponent(cookieToken);
  if (csrfToken) return csrfToken;
  if (!csrfPromise) {
    csrfPromise = axios
      .get(`${BASE_URL}/billing/csrf/`, { withCredentials: true })
      .then((response) => {
        csrfToken = response.data?.csrfToken || "";
        return csrfToken;
      })
      .finally(() => { csrfPromise = null; });
  }
  return csrfPromise;
}

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.request.use(
  async (config) => {
    delete config.headers.Authorization;
    const method = (config.method || "get").toLowerCase();
    if (!["get", "head", "options", "trace"].includes(method) && typeof document !== "undefined") {
      const csrf = await getCsrfToken();
      if (csrf) config.headers["X-CSRFToken"] = decodeURIComponent(csrf);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle token expiry and 401 response
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => apiClient(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await axios.post(`${BASE_URL}/auth/token/refresh/`, {}, { withCredentials: true });

        processQueue(null, true);
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearTokens();
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
