import apiClient from "./apiClient";

export const templatesApi = {
  getTemplates: (params) => apiClient.get("/templates/", { params }),
  getTemplate: (id) => apiClient.get(`/templates/${id}/`),
  createTemplate: (data) => apiClient.post("/templates/", data),
  updateTemplate: (id, data) => apiClient.patch(`/templates/${id}/`, data),
  deleteTemplate: (id) => apiClient.delete(`/templates/${id}/`),
  renderLayout: (json_layout) => apiClient.post("/templates/render_layout/", { json_layout }),
};

export default templatesApi;
