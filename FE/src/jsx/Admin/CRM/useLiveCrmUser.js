import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthUser } from "react-auth-kit";
import { allUsersApi, signleUsersApi } from "../../../Api/Service";
import { isPermissionOn } from "./crmPermissions";

const LIVE_ROLES = new Set(["admin", "subadmin"]);

const samePermissions = (previous, next) => {
  if (!previous || !next) return false;
  return previous.role === next.role
    && JSON.stringify(previous.permissions || null) === JSON.stringify(next.permissions || null)
    && JSON.stringify(previous.adminPermissions || null) === JSON.stringify(next.adminPermissions || null);
};

export default function useLiveCrmUser() {
  const authUser = useAuthUser();
  const identity = authUser()?.user || null;
  const userId = identity?._id || "";
  const role = identity?.role || "";
  const needsLivePermissions = LIVE_ROLES.has(role);
  const [user, setUser] = useState(needsLivePermissions ? null : identity);
  const [ready, setReady] = useState(!needsLivePermissions);
  const identityRef = useRef(identity);
  identityRef.current = identity;

  const load = useCallback(async () => {
    if (!userId) return;
    if (!LIVE_ROLES.has(role)) {
      const currentIdentity = identityRef.current;
      setUser((current) => current?._id === userId ? current : currentIdentity);
      setReady(true);
      return;
    }

    try {
      const response = await signleUsersApi(userId);
      let fresh = response?.signleUser;
      if (!fresh) {
        const list = await allUsersApi({ search: userId, limit: 1 });
        fresh = list?.allUsers?.[0] || null;
      }
      if (fresh) {
        setUser((current) => (samePermissions(current, fresh) ? current : fresh));
      }
    } catch (error) {
      console.error("Failed to load live permissions:", error);
    } finally {
      setReady(true);
    }
  }, [userId, role]);

  useEffect(() => {
    load();
    if (!needsLivePermissions) return undefined;

    const interval = setInterval(load, 60000);
    let focusTimer = null;
    const onFocus = () => {
      clearTimeout(focusTimer);
      focusTimer = setTimeout(load, 1000);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      clearTimeout(focusTimer);
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
