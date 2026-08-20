import apiClient from "./apiClient";

export const settingsApi = {
  getSettings: () => apiClient.get("/settings/"),
  updateSettings: (data) => apiClient.patch("/settings/", data),

  getProfile: () => apiClient.get("/profile/"),
  updateProfile: (data) => apiClient.patch("/profile/", data),
  changePassword: (data) => apiClient.post("/profile/change-password/", data),
};

export default settingsApi;
