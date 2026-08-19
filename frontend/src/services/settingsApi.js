import apiClient from "./apiClient";

export const settingsApi = {
  getSettings: () => apiClient.get("/settings/"),
  updateSettings: (data) => apiClient.patch("/settings/", data),

  getUsers: (params) => apiClient.get("/users/", { params }),
  createUser: (data) => apiClient.post("/users/", data),
  updateUser: (id, data) => apiClient.patch(`/users/${id}/`, data),
  deleteUser: (id) => apiClient.delete(`/users/${id}/`),

  getProfile: () => apiClient.get("/profile/"),
  updateProfile: (data) => apiClient.patch("/profile/", data),
  changePassword: (data) => apiClient.post("/profile/change-password/", data),
};

export default settingsApi;
