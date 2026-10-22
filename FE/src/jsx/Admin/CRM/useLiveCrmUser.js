import { useCallback, useEffect, useState } from "react";
import { useAuthUser } from "react-auth-kit";
import { allUsersApi, signleUsersApi } from "../../../Api/Service";
import { isPermissionOn } from "./crmPermissions";

const LIVE_ROLES = new Set(["admin", "subadmin"]);

export default function useLiveCrmUser() {
  const authUser = useAuthUser();
  const identity = authUser()?.user || null;
  const role = identity?.role || "";
  const needsLivePermissions = LIVE_ROLES.has(role);
  const [user, setUser] = useState(needsLivePermissions ? null : identity);
  const [ready, setReady] = useState(!needsLivePermissions);

  const load = useCallback(async () => {
    const current = authUser()?.user || null;
    if (!current?._id) return;
    if (!LIVE_ROLES.has(current.role)) {
      setUser(current);
      setReady(true);
      return;
    }

    try {
      const response = await signleUsersApi(current._id);
      let fresh = response?.signleUser;
      if (!fresh) {
        const list = await allUsersApi({ search: current._id, limit: 1 });
        fresh = list?.allUsers?.[0] || null;
      }
      if (fresh) setUser(fresh);
    } catch (error) {
      console.error("Failed to load live permissions:", error);
    } finally {
      setReady(true);
    }
  }, [authUser]);

  useEffect(() => {
    load();
    if (!needsLivePermissions) return undefined;

    const interval = setInterval(load, 15000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [load, needsLivePermissions]);

  const can = useCallback((key) => {
    if (role === "superadmin") return true;
    if (!needsLivePermissions || !ready || !user) return false;
    return isPermissionOn(user, key);
  }, [role, needsLivePermissions, ready, user]);

  return {
    user,
    role,
    ready,
    can,
  };
};
