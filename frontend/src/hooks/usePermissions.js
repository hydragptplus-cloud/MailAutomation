import { useMemo } from "react";
import { getUser } from "../utils/auth";

const ROLE_PERMISSIONS = {
  owner: [
    "manage_organizations",
    "manage_users",
    "manage_recipients",
    "manage_templates",
    "manage_smtp",
    "create_campaigns",
    "launch_campaigns",
    "view_reports",
    "change_settings",
  ],
  admin: [
    "manage_users",
    "manage_recipients",
    "manage_templates",
    "manage_smtp",
    "create_campaigns",
    "launch_campaigns",
    "view_reports",
    "change_settings",
  ],
  manager: [
    "manage_recipients",
    "manage_templates",
    "create_campaigns",
    "launch_campaigns",
    "view_reports",
  ],
  operator: ["launch_campaigns", "view_reports"],
  viewer: [
    "view_reports",
  ],
};

export function usePermissions() {
  const user = getUser();
  const role = (user?.role || "viewer").toLowerCase();

  const permissions = useMemo(() => {
    return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer;
  }, [role]);

  const hasPermission = (permissionKey) => {
    return permissions.includes(permissionKey);
  };

  const isAdmin = role === "admin" || role === "owner";
  const isManager = role === "manager" || isAdmin;

  return {
    role,
    permissions,
    hasPermission,
    isAdmin,
    isManager,
  };
}

export default usePermissions;
