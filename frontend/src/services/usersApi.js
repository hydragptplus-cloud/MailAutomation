import apiClient from "./apiClient";

const usersApi = {
  listUsers: (params) => apiClient.get("/users/", { params }),
  createUser: (data) => apiClient.post("/users/", data),
  updateUser: (id, data) => apiClient.patch(`/users/${id}/`, data),
  deleteUser: (id) => apiClient.delete(`/users/${id}/`),
  setPassword: (id, password) =>
    apiClient.post(`/users/${id}/set-password/`, { password }),
  deactivateUser: (id) => apiClient.post(`/users/${id}/deactivate/`),
  reactivateUser: (id) => apiClient.post(`/users/${id}/reactivate/`),
  revokeSessions: (id) => apiClient.post(`/users/${id}/revoke-sessions/`),
};

export default usersApi;
