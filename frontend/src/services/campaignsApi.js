import apiClient from "./apiClient";

export const campaignsApi = {
  getCampaigns: (params) => apiClient.get("/campaigns/", { params }),
  getCampaign: (id) => apiClient.get(`/campaigns/${id}/`),
  createCampaign: (data) => apiClient.post("/campaigns/", data),
  updateCampaign: (id, data) => apiClient.patch(`/campaigns/${id}/`, data),
  deleteCampaign: (id) => apiClient.delete(`/campaigns/${id}/`),

  startCampaign: (id) => apiClient.post(`/campaigns/${id}/launch/`),
  pauseCampaign: (id) => apiClient.post(`/campaigns/${id}/pause/`),
  resumeCampaign: (id) => apiClient.post(`/campaigns/${id}/resume/`),
  cancelCampaign: (id) => apiClient.post(`/campaigns/${id}/cancel/`),
  retryFailed: (id) => apiClient.post(`/campaigns/${id}/retry_failed/`),
  getLogs: (id, params) => apiClient.get(`/campaign-logs/`, { params: { campaign: id, ...params } }),
};

export default campaignsApi;
