import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Templates from "./pages/Templates";

// Recipients Pages
import RecipientsPage from "./pages/recipients/RecipientsPage";
import RecipientListsPage from "./pages/recipients/RecipientListsPage";
import ImportRecipientsPage from "./pages/recipients/ImportRecipientsPage";

// Campaigns Pages
import CampaignsPage from "./pages/campaigns/CampaignsPage";
import CreateCampaignPage from "./pages/campaigns/CreateCampaignPage";
import CampaignDetailsPage from "./pages/campaigns/CampaignDetailsPage";

// SMTP Page
import SMTPPage from "./pages/smtp/SMTPPage";

// Reports Pages
import ReportsPage from "./pages/reports/ReportsPage";
import CampaignReportPage from "./pages/reports/CampaignReportPage";

// Settings Page
import SettingsPage from "./pages/settings/SettingsPage";
import PlatformAdmin from "./pages/PlatformAdmin";
import PlatformOverview from "./pages/platform/PlatformOverview";
import PlatformOrganizations from "./pages/platform/PlatformOrganizations";
import PlatformBilling from "./pages/platform/PlatformBilling";
import PlatformBroadcasts from "./pages/platform/PlatformBroadcasts";
import PlatformSessions from "./pages/platform/PlatformSessions";
import PlatformUsers from "./pages/platform/PlatformUsers";
import PlatformPlans from "./pages/platform/PlatformPlans";
import PlatformSettings from "./pages/platform/PlatformSettings";
import AccountAdmin from "./pages/AccountAdmin";
import Landing from "./pages/Landing";
import Register from "./pages/Register";
import Subscribe from "./pages/Subscribe";
import Payment from "./pages/Payment";
import HelpSupport from "./pages/HelpSupport";
import MailWorkspace from "./pages/MailWorkspace";
import NotificationsPage from "./pages/NotificationsPage";

import { getUser, isAuthenticated } from "./utils/auth";
import { ToastProvider } from "./context/ToastContext";

function ProtectedRoute({ element, roles }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(getUser().role)) return <Navigate to="/dashboard" replace />;
  return element;
}

const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
  { path: "/login", element: <Login /> },
  { path: "/register", element: <Register /> },
  { path: "/signup", element: <Register /> },
  { path: "/subscribe/:planSlug", element: <Subscribe /> },
  { path: "/payment/:invoiceId", element: <Payment /> },
  { path: "/help", element: <HelpSupport /> },
  {
    element: <AppLayout />,
    children: [
      { path: "/dashboard", element: <ProtectedRoute element={<Dashboard />} /> },
      { path: "/templates", element: <ProtectedRoute element={<Templates />} /> },

      { path: "/recipients", element: <ProtectedRoute element={<RecipientsPage />} /> },
      { path: "/recipients/lists", element: <ProtectedRoute element={<RecipientListsPage />} /> },
      { path: "/recipients/import", element: <ProtectedRoute roles={["owner", "admin", "manager"]} element={<ImportRecipientsPage />} /> },

      { path: "/campaigns", element: <ProtectedRoute element={<CampaignsPage />} /> },
      { path: "/campaigns/new", element: <ProtectedRoute roles={["owner", "admin", "manager"]} element={<CreateCampaignPage />} /> },
      { path: "/campaigns/:campaignId", element: <ProtectedRoute element={<CampaignDetailsPage />} /> },

      { path: "/smtp", element: <ProtectedRoute element={<SMTPPage />} /> },

      { path: "/reports", element: <ProtectedRoute element={<ReportsPage />} /> },
      { path: "/reports/campaigns/:campaignId", element: <ProtectedRoute element={<CampaignReportPage />} /> },

      { path: "/support", element: <ProtectedRoute element={<HelpSupport />} /> },
      { path: "/mail-workspace", element: <ProtectedRoute roles={["owner", "admin"]} element={<MailWorkspace />} /> },
      { path: "/notifications", element: <ProtectedRoute element={<NotificationsPage />} /> },

      { path: "/settings", element: <ProtectedRoute roles={["admin"]} element={<SettingsPage />} /> },
      {
        path: "/platform",
        element: <ProtectedRoute roles={["owner"]} element={<PlatformAdmin />} />,
        children: [
          { index: true, element: <PlatformOverview /> },
          { path: "organizations", element: <PlatformOrganizations /> },
          { path: "users", element: <PlatformUsers /> },
          { path: "plans", element: <PlatformPlans /> },
          { path: "billing", element: <PlatformBilling /> },
          { path: "broadcasts", element: <PlatformBroadcasts /> },
          { path: "sessions", element: <PlatformSessions /> },
          { path: "settings", element: <PlatformSettings /> },
        ],
      },
      { path: "/account", element: <ProtectedRoute roles={["admin", "manager", "operator", "viewer"]} element={<AccountAdmin />} /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export default function App() {
  return <ToastProvider><RouterProvider router={router} /></ToastProvider>;
}
