import * as SecureStore from "expo-secure-store";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { API_URL, apiFetch, ORGANIZATION_KEY, SESSION_KEY } from "./api";
import type { Membership } from "./types";

type User = { id: string; email: string; name: string | null };

type SessionContextValue = {
  loading: boolean;
  signedIn: boolean;
  user: User | null;
  memberships: Membership[];
  organizationId: string | null;
  signInWithToken: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  selectOrganization: (organizationId: string) => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  const clearLocal = useCallback(async () => {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    await SecureStore.deleteItemAsync(ORGANIZATION_KEY);
    setUser(null);
    setMemberships([]);
    setOrganizationId(null);
  }, []);

  const refresh = useCallback(async () => {
    const token = await SecureStore.getItemAsync(SESSION_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch<{ user: User; memberships: Membership[] }>("/api/mobile/me");
      setUser(data.user);
      setMemberships(data.memberships);
      let selected = await SecureStore.getItemAsync(ORGANIZATION_KEY);
      if (!selected || !data.memberships.some((m) => m.organizationId === selected)) {
        selected = data.memberships[0]?.organizationId ?? null;
        if (selected) await SecureStore.setItemAsync(ORGANIZATION_KEY, selected);
      }
      setOrganizationId(selected);
    } catch {
      await clearLocal();
    } finally {
      setLoading(false);
    }
  }, [clearLocal]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signInWithToken = useCallback(async (token: string) => {
    const response = await fetch(`${API_URL}/api/mobile/auth/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to sign in.");
    await SecureStore.setItemAsync(SESSION_KEY, data.sessionToken);
    await SecureStore.setItemAsync(ORGANIZATION_KEY, data.defaultOrganizationId);
    setUser(data.user);
    setMemberships(data.memberships);
    setOrganizationId(data.defaultOrganizationId);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiFetch("/api/mobile/logout", { method: "POST" });
    } catch {
      // Always clear local token, even if the network request fails.
    }
    await clearLocal();
  }, [clearLocal]);

  const selectOrganization = useCallback(async (id: string) => {
    if (!memberships.some((m) => m.organizationId === id)) return;
    await SecureStore.setItemAsync(ORGANIZATION_KEY, id);
    setOrganizationId(id);
  }, [memberships]);

  const value = useMemo<SessionContextValue>(() => ({
    loading,
    signedIn: Boolean(user),
    user,
    memberships,
    organizationId,
    signInWithToken,
    signOut,
    refresh,
    selectOrganization
  }), [loading, user, memberships, organizationId, signInWithToken, signOut, refresh, selectOrganization]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
