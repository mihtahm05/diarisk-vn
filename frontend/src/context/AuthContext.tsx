import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, setUnauthorizedHandler, tokenStore } from "../services/api";
import { authService } from "../services/authService";
import type { AuthUser, LoginPayload } from "../types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn(payload: LoginPayload): Promise<AuthUser>;
  signOut(): Promise<void>;
  refreshUser(): Promise<AuthUser>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const current = await authService.me();
    setUser(current);
    return current;
  }, []);

  const signIn = useCallback(async (payload: LoginPayload) => {
    const result = await authService.login(payload);
    setUser(result.user);
    return result.user;
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      tokenStore.clear();
      setUser(null);
    });
    if (!tokenStore.get()) {
      setLoading(false);
      return () => setUnauthorizedHandler(null);
    }

    void authService.me()
      .then(setUser)
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status !== 0) tokenStore.clear();
      })
      .finally(() => setLoading(false));
    return () => setUnauthorizedHandler(null);
  }, []);

  const value = useMemo(() => ({ user, loading, signIn, signOut, refreshUser }), [
    user, loading, signIn, signOut, refreshUser,
  ]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
