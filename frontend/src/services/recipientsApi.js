import apiClient from "./apiClient";

export const recipientsApi = {
  // Recipient Lists
  getLists: (params) => apiClient.get("/recipient-lists/", { params }),
  createList: (data) =>
    apiClient.post("/recipient-lists/", {
      list_name: data.list_name || data.name,
      description: data.description || "",
    }),
  updateList: (id, data) =>
    apiClient.patch(`/recipient-lists/${id}/`, {
      list_name: data.list_name || data.name,
      description: data.description,
    }),
  deleteList: (id) => apiClient.delete(`/recipient-lists/${id}/`),

  // Recipients
  getRecipients: (params) => apiClient.get("/recipients/", { params }),
  getRecipient: (id) => apiClient.get(`/recipients/${id}/`),
  createRecipient: (data) =>
    apiClient.post("/recipients/", {
      ...data,
      recipient_list: data.recipient_list || data.list_id,
    }),
  updateRecipient: (id, data) =>
    apiClient.patch(`/recipients/${id}/`, {
      ...data,
      recipient_list: data.recipient_list || data.list_id,
    }),
  deleteRecipient: (id) => apiClient.delete(`/recipients/${id}/`),

  // Bulk & Import/Export
  importRecipients: (formData) =>
    apiClient.post("/recipients/import_file/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  exportRecipients: (params) =>
    apiClient.get("/recipients/export_file/", { params, responseType: "blob" }),
  bulkUpdate: (data) => apiClient.post("/recipients/bulk_update/", data),
  bulkDelete: (ids) => apiClient.post("/recipients/bulk_delete/", { ids }),
};

export default recipientsApi;
