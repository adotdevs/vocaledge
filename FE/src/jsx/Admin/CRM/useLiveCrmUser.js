import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthUser } from "react-auth-kit";
import { allUsersApi, signleUsersApi } from "../../../Api/Service";
import { isPermissionOn } from "./crmPermissions";

const LIVE_ROLES = new Set(["superadmin", "admin", "subadmin", "manager"]);

const samePermissions = (previous, next) => {
  if (!previous || !next) return false;
  const prevAv = previous.avatar?.url || (typeof previous.avatar === "string" ? previous.avatar : "");
  const nextAv = next.avatar?.url || (typeof next.avatar === "string" ? next.avatar : "");
  return previous.role === next.role
    && prevAv === nextAv
    && JSON.stringify(previous.permissions || null) === JSON.stringify(next.permissions || null)
    && JSON.stringify(previous.adminPermissions || null) === JSON.stringify(next.adminPermissions || null);
};

export default function useLiveCrmUser() {
  const authUser = useAuthUser();
  const identity = authUser()?.user || null;
  const userId = identity?._id || "";
  const role = identity?.role || "";
  const needsLivePermissions = LIVE_ROLES.has(role);

  const [user, setUser] = useState(() => {
    const cachedAvatar = typeof window !== "undefined" ? localStorage.getItem("user_avatar") : null;
    if (cachedAvatar && identity) {
      return {
        ...identity,
        avatar: { url: cachedAvatar },
      };
    }
    return needsLivePermissions ? null : identity;
  });

  const [ready, setReady] = useState(!needsLivePermissions || !!user);
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
        const freshAv = fresh.avatar?.url || (typeof fresh.avatar === "string" ? fresh.avatar : "");
        if (freshAv) {
          localStorage.setItem("user_avatar", freshAv);
        }
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

    const onProfileUpdated = (e) => {
      const updated = e.detail;
      if (updated) {
        const nextAv = updated.avatar?.url || (typeof updated.avatar === "string" ? updated.avatar : "");
        if (nextAv) {
          localStorage.setItem("user_avatar", nextAv);
        }
        setUser((current) => current ? { ...current, ...updated } : updated);
      }
    };
    window.addEventListener("crm-user-profile-updated", onProfileUpdated);

    return () => {
      clearInterval(interval);
      clearTimeout(focusTimer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("crm-user-profile-updated", onProfileUpdated);
    };
  }, [load, needsLivePermissions]);

  const can = useCallback((key) => {
    if (role === "superadmin" || role === "manager") return true;
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
