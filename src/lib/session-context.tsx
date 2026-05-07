"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { Session } from "./types";
import {
  createEmptySession,
  loadSession,
  saveSession,
  clearSession as clearPersistedSession,
  exportSession,
  importSessionFromFile,
} from "./session";

interface SessionContextValue {
  session: Session;
  ready: boolean;
  update: (patch: Partial<Session> | ((prev: Session) => Partial<Session>)) => void;
  reset: () => void;
  exportSession: () => void;
  importSession: (file: File) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const DEBOUNCE_MS = 500;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(() => createEmptySession());
  const [ready, setReady] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from IndexedDB on mount (migrates localStorage automatically)
  useEffect(() => {
    loadSession().then((loaded) => {
      if (loaded) setSession(loaded);
      setReady(true);
    });
  }, []);

  // Debounced persist on changes
  useEffect(() => {
    if (!ready) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      saveSession(session);
    }, DEBOUNCE_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [session, ready]);

  const update = useCallback(
    (patch: Partial<Session> | ((prev: Session) => Partial<Session>)) => {
      setSession((prev) => {
        const delta = typeof patch === "function" ? patch(prev) : patch;
        return { ...prev, ...delta };
      });
    },
    [],
  );

  const reset = useCallback(() => {
    clearPersistedSession().then(() => setSession(createEmptySession()));
  }, []);

  const doExport = useCallback(() => {
    exportSession(session);
  }, [session]);

  const doImport = useCallback(async (file: File) => {
    const imported = await importSessionFromFile(file);
    setSession(imported);
    await saveSession(imported);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      ready,
      update,
      reset,
      exportSession: doExport,
      importSession: doImport,
    }),
    [session, ready, update, reset, doExport, doImport],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
