"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { clientAuth, clientDb } from "@/lib/firebase-client";
import { apiFetch } from "@/lib/api-client";
import type { BrandProfile, UserDoc } from "@/lib/contracts";

export interface Session {
  status: "loading" | "signed-out" | "signed-in";
  user: User | null;
  /** Live `users/{uid}`; null until the first snapshot arrives. */
  profile: UserDoc | null;
  /** Live `users/{uid}/brands`, sorted by name; null until the first snapshot arrives. */
  brands: BrandProfile[] | null;
  activeBrand: BrandProfile | null;
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

  useEffect(() => onAuthStateChanged(clientAuth(), setUser), []);

  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    const db = clientDb();
    const fail = (err: Error) => setError({ uid, value: err.message });

    // Creates users/{uid} on first sign-in; the profile listener picks it up.
    apiFetch("/api/me").catch(fail);
    const stopProfile = onSnapshot(
      doc(db, "users", uid),
      (snap) => setProfile({ uid, value: snap.exists() ? (snap.data() as UserDoc) : null }),
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
      error: mine(error),
    };
  }, [uid, user, profile, brands, error]);

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
