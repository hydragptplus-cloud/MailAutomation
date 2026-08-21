import api from "./api";

export const supportApi = {
  createPublicTicket: (data) => api.post("/support/public/", data),
  createTicket: (data) => api.post("/support/tickets/", data),
  getTickets: (params) => api.get("/support/tickets/", { params }),
  updateTicket: (id, data) => api.patch(`/support/tickets/${id}/`, data),
  setStatus: (id, status) => api.post(`/support/tickets/${id}/set-status/`, { status }),
  reply: (id, data) => api.post(`/support/tickets/${id}/reply/`, data),
  getMailboxes: (params) => api.get("/support/mailboxes/", { params }),
  createMailbox: (data) => api.post("/support/mailboxes/", data),
  updateMailbox: (id, data) => api.patch(`/support/mailboxes/${id}/`, data),
  deleteMailbox: (id) => api.delete(`/support/mailboxes/${id}/`),
  syncMailbox: (id) => api.post(`/support/mailboxes/${id}/sync/`),
  workspaceAccess: () => api.get("/support/workspace-access/"),
};

export default supportApi;
