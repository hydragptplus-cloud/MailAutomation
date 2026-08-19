import apiClient from "./apiClient";

export const reportsApi = {
  getSummary: (params) => apiClient.get("/reports/summary/", { params }),
  getCampaignReports: (params) => apiClient.get("/reports/campaigns/", { params }),
  getCampaignReport: (id) => apiClient.get(`/reports/campaigns/${id}/`),
  getDeliveryLogs: (params) => apiClient.get("/reports/delivery-logs/", { params }),
  exportReports: (params) =>
    apiClient.get("/reports/export/", { params, responseType: "blob" }),
};

export default reportsApi;
