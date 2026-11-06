"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { clientAuth, clientDb } from "@/lib/firebase-client";
import { apiFetch } from "@/lib/api-client";
import type { BrandProfile, UserDoc } from "@/lib/contracts";

export type ActiveRole = "superadmin" | "admin" | "ad_agent" | "supporter";

export interface Session {
  status: "loading" | "signed-out" | "signed-in";
  user: User | null;
  /** Live `users/{uid}`; null until the first snapshot arrives. */
  profile: UserDoc | null;
  /** Live `users/{uid}/brands`, sorted by name; null until the first snapshot arrives. */
  brands: BrandProfile[] | null;
  activeBrand: BrandProfile | null;
  isAdmin: boolean;
  role: ActiveRole;
  realRole: ActiveRole;
  isSuperAdmin: boolean;
  actingAsRole: ActiveRole | null;
  setActingRole: (role: ActiveRole) => void;
  resetRole: () => void;
  claims: Record<string, unknown> | null;
  error: string | null;
}

const SessionContext = createContext<Session | null>(null);

// Snapshot results are tagged with their uid so a previous account's data never leaks
// into the next one without resetting state inside the effect.
type Owned<T> = { uid: string; value: T };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [profile, setProfile] = useState<Owned<UserDoc | null> | null>(null);
  const [brands, setBrands] = useState<Owned<BrandProfile[]> | null>(null);
  const [error, setError] = useState<Owned<string> | null>(null);
  const [claims, setClaims] = useState<Owned<Record<string, unknown>> | null>(null);

  useEffect(() => {
    if (!user) return;
    const currentUid = user.uid;
    user.getIdTokenResult().then((res) => {
      setClaims({ uid: currentUid, value: res.claims || {} });
    }).catch(() => {
      setClaims({ uid: currentUid, value: {} });
    });
  }, [user]);

  const myClaims = user && claims?.uid === user.uid ? claims.value : null;

  const envAdmins = (process.env.NEXT_PUBLIC_DATABASE_ADMIN_EMAIL || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const DATABASE_ADMIN_EMAILS = new Set([
    "davidrobertson.info@gmail.com",
    "support@aifoundation.net.au",
    ...envAdmins,
  ]);

  const isSuperAdminEmail = (email?: string | null) => {
    const e = (email || "").toLowerCase().trim();
    return Boolean(e && DATABASE_ADMIN_EMAILS.has(e));
  };

  // The superadmin should only be the firebase database admin email. Everyone else starts at supporter level.
  const isSuper = isSuperAdminEmail(user?.email);
  const isMainAdmin = !isSuper && (myClaims?.role === "admin" || myClaims?.admin === true);
  const isAdAgentRole = !isSuper && !isMainAdmin && myClaims?.role === "ad_agent";
  const realRole: ActiveRole = isSuper ? "superadmin" : isMainAdmin ? "admin" : isAdAgentRole ? "ad_agent" : "supporter";

  const [actingAsRole, setActingAsRoleState] = useState<ActiveRole | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && isSuper) {
      const saved = localStorage.getItem("adradar_acting_role") as ActiveRole | null;
      if (saved && (saved === "superadmin" || saved === "admin" || saved === "ad_agent" || saved === "supporter")) {
        setActingAsRoleState(saved);
      }
    }
  }, [isSuper]);

  const setActingRole = (targetRole: ActiveRole) => {
    if (!isSuper) return;
    setActingAsRoleState(targetRole);
    if (typeof window !== "undefined") {
      localStorage.setItem("adradar_acting_role", targetRole);
    }
  };

  const resetRole = () => {
    setActingAsRoleState("superadmin");
    if (typeof window !== "undefined") {
      localStorage.removeItem("adradar_acting_role");
    }
  };

  // Determine active effective role for UI preview and action simulation
  const effectiveRole: ActiveRole = isSuper && actingAsRole ? actingAsRole : realRole;
  const effectiveIsAdmin = effectiveRole === "superadmin" || effectiveRole === "admin";

  useEffect(() => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        setUser((prev) => (prev === undefined ? (clientAuth().currentUser ?? null) : prev));
      }
    }, 3500);

    try {
      const unsub = onAuthStateChanged(
        clientAuth(),
        (u) => {
          settled = true;
          clearTimeout(timer);
          setUser(u);
        },
        () => {
          settled = true;
          clearTimeout(timer);
          setUser(null);
        },
      );
      return () => {
        clearTimeout(timer);
        unsub();
      };
    } catch {
      clearTimeout(timer);
      setUser(null);
      return;
    }
  }, []);

  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    const db = clientDb();
    const fail = (err: Error) => {
      if (err.name === "FirebaseError" && (err as { code?: string }).code === "unavailable") {
        console.warn("[session] firestore backend temporarily unavailable; operating offline");
        return;
      }
      setError({ uid, value: err.message });
    };

    // Creates users/{uid} on first sign-in and immediately hydrates profile + brands
    apiFetch<{ user?: UserDoc; brands?: BrandProfile[] }>("/api/me")
      .then((res) => {
        if (res?.user) {
          const normalizedUser: UserDoc = {
            ...res.user,
            tokenBalance: Math.max(0, Math.round(Number(res.user.tokenBalance ?? 0))),
          };
          setProfile((prev) => (prev?.uid === uid && prev.value ? prev : { uid, value: normalizedUser }));
        }
        if (Array.isArray(res?.brands)) {
          setBrands((prev) => (prev?.uid === uid ? prev : { uid, value: res.brands! }));
        }
      })
      .catch(fail);

    const stopProfile = onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        if (!snap.exists()) {
          setProfile({ uid, value: null });
          return;
        }
        const raw = snap.data() as UserDoc;
        setProfile({
          uid,
          value: {
            ...raw,
            tokenBalance: Math.max(0, Math.round(Number(raw.tokenBalance ?? 0))),
          },
        });
      },
      fail,
    );
    const stopBrands = onSnapshot(
      collection(db, "users", uid, "brands"),
      (snap) =>
        setBrands({
          uid,
          value: snap.docs.map((d) => d.data() as BrandProfile).sort((a, b) => a.brandName.localeCompare(b.brandName)),
        }),
      fail,
    );
    return () => {
      stopProfile();
      stopBrands();
    };
  }, [uid]);

  const session = useMemo<Session>(() => {
    const mine = <T,>(owned: Owned<T> | null) => (owned && owned.uid === uid ? owned.value : null);
    const myProfile = mine(profile);
    const myBrands = mine(brands);
    return {
      status: user === undefined ? "loading" : user ? "signed-in" : "signed-out",
      user: user ?? null,
      profile: myProfile,
      brands: myBrands,
      activeBrand: myBrands?.find((b) => b.brandId === myProfile?.activeBrandId) ?? null,
      isAdmin: effectiveIsAdmin,
      role: effectiveRole,
      realRole,
      isSuperAdmin: isSuper,
      actingAsRole: isSuper ? actingAsRole : null,
      setActingRole,
      resetRole,
      claims: myClaims,
      error: mine(error),
    };
  }, [uid, user, profile, brands, error, effectiveIsAdmin, effectiveRole, realRole, isSuper, actingAsRole, myClaims]);

  return <SessionContext value={session}>{children}</SessionContext>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside <SessionProvider>");
  return session;
}

/** Google sign-in popup. Resolves quietly if the user closes the popup. */
export async function signInWithGoogle() {
  try {
    await signInWithPopup(clientAuth(), new GoogleAuthProvider());
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
    throw err;
  }
}

export const signOutUser = () => signOut(clientAuth());
