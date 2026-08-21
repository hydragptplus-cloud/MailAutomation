import axios from "axios";
import apiClient from "./apiClient";

const apiBase = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

const twoFactorApi = {
  // Authenticated - setup & management
  setup: () => apiClient.post("/auth/2fa/setup/"),
  confirm: ({ secret, code }) => apiClient.post("/auth/2fa/confirm/", { secret, code }),
  disable: ({ password }) => apiClient.post("/auth/2fa/disable/", { password }),
  regenerateBackupCodes: ({ password }) =>
    apiClient.post("/auth/2fa/regenerate-backup-codes/", { password }),

  // Public - login verification (no auth header needed)
  verifyLogin: ({ challenge_token, code }) =>
    axios.post(`${apiBase}/auth/2fa/verify-login/`, { challenge_token, code }, { withCredentials: true }),
};

export default twoFactorApi;
