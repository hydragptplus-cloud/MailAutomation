import axios from "axios";
import apiClient from "./apiClient";

const baseURL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
const publicClient = axios.create({ baseURL, timeout: 20000, withCredentials: true });

function getCookie(name) {
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")[1] || "";
}

async function ensureCsrf() {
  const cookieToken = getCookie("csrftoken");
  if (cookieToken) return decodeURIComponent(cookieToken);
  const response = await publicClient.get("/billing/csrf/");
  return response.data?.csrfToken || "";
}

publicClient.interceptors.request.use(async (config) => {
  const method = (config.method || "get").toLowerCase();
  if (!["get", "head", "options", "trace"].includes(method)) {
    const csrfToken = await ensureCsrf();
    config.headers["X-CSRFToken"] = csrfToken;
  }
  return config;
});

export const getPlans = () => publicClient.get("/billing/plans/").then((response) => response.data);
export const createFreeAccount = (payload) => publicClient.post("/billing/signup/free/", payload).then((response) => response.data);
export const startCheckoutEmail = (email, turnstileToken = "") => publicClient.post("/billing/checkout/email/start/", { email, turnstile_token: turnstileToken }).then((response) => response.data);
export const verifyCheckoutEmail = (email, code) => publicClient.post("/billing/checkout/email/verify/", { email, code }).then((response) => response.data);
export const createInvoice = (payload) => publicClient.post("/billing/invoices/", payload).then((response) => response.data);
export const createAccountInvoice = (payload) => apiClient.post("/billing/account/invoices/", payload).then((response) => response.data);
export const exchangeInvoiceCode = (id, code) => publicClient.post(`/billing/invoices/${id}/session/`, { code }).then((response) => response.data);
export const getInvoice = (id) => publicClient.get(`/billing/invoices/${id}/`).then((response) => response.data);
export const getCurrentInvoice = () => publicClient.get("/billing/invoices/current/").then((response) => response.data);
export const verifyInvoice = (id, transaction) => publicClient.post(`/billing/invoices/${id}/verify/`, { transaction }).then((response) => response.data);
export const recoverInvoice = (email) => publicClient.post("/billing/invoices/recover/", { email }).then((response) => response.data);
export const replaceInvoice = (id, password) => publicClient.post(`/billing/invoices/${id}/replace/`, { password }).then((response) => response.data);
export const cancelInvoice = (id) => publicClient.post(`/billing/invoices/${id}/cancel/`, {}).then((response) => response.data);

export function apiError(error, fallback = "Something went wrong. Please try again.") {
  const data = error?.response?.data;
  if (typeof data?.detail === "string") return data.detail;
  if (data && typeof data === "object") {
    const first = Object.values(data)[0];
    if (Array.isArray(first)) return first[0];
    if (typeof first === "string") return first;
  }
  return fallback;
}
