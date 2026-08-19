import apiClient from "./apiClient";

export const smtpApi = {
  getServers: (params) => apiClient.get("/smtp-accounts/", { params }),
  getServer: (id) => apiClient.get(`/smtp-accounts/${id}/`),
  createServer: (data) => apiClient.post("/smtp-accounts/", data),
  updateServer: (id, data) => apiClient.patch(`/smtp-accounts/${id}/`, data),
  deleteServer: (id) => apiClient.delete(`/smtp-accounts/${id}/`),

  testConnection: (id) => apiClient.post(`/smtp-accounts/${id}/test-connection/`),
  sendTestEmail: (id, data) => apiClient.post(`/smtp-accounts/${id}/send-test/`, data),
};

export default smtpApi;

