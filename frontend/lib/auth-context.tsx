"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { getMe } from "./api";

interface Tenant {
  id: string;
  name: string;
  email: string;
  plan: string;
}

interface AuthCtx {
  tenant: Tenant | null;
  loading: boolean;
  setAuth: (token: string, tenant: Tenant) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthCtx>({ tenant: null, loading: true, setAuth: () => {}, logout: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("crm_token");
    if (token) {
      getMe()
        .then(t => setTenant(t))
        .catch(() => localStorage.removeItem("crm_token"))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  function setAuth(token: string, t: Tenant) {
    localStorage.setItem("crm_token", token);
    setTenant(t);
  }

  function logout() {
    localStorage.removeItem("crm_token");
    setTenant(null);
  }

  return <AuthContext.Provider value={{ tenant, loading, setAuth, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
