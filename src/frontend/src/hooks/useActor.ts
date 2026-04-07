/**
 * Local useActor shim for Odin Mario.
 *
 * The @caffeineai/core-infrastructure useActor hook requires a createActor
 * factory function. This shim wraps it with the backend's createActor so all
 * game components can simply call `useActor()` without arguments.
 *
 * Since the backend IDL is currently empty (no canister methods exposed via
 * bindgen), we return a typed-as-any actor so existing game code that calls
 * actor.submitScore() etc. compiles without errors and falls back gracefully
 * at runtime when the canister is not available.
 */

import { createActorWithConfig } from "@caffeineai/core-infrastructure";
import { useCallback, useEffect, useRef, useState } from "react";
import { createActor } from "../backend";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyActor = any;

interface UseActorResult {
  actor: AnyActor | null;
  isFetching: boolean;
}

let cachedActor: AnyActor | null = null;
let cachePromise: Promise<AnyActor | null> | null = null;

async function resolveActor(): Promise<AnyActor | null> {
  if (cachedActor) return cachedActor;
  if (cachePromise) return cachePromise;

  cachePromise = createActorWithConfig(
    createActor as Parameters<typeof createActorWithConfig>[0],
  )
    .then((a) => {
      cachedActor = a;
      return a;
    })
    .catch(() => null);

  return cachePromise;
}

export function useActor(): UseActorResult {
  const [actor, setActor] = useState<AnyActor | null>(cachedActor);
  const [isFetching, setIsFetching] = useState(!cachedActor);
  const mountedRef = useRef(true);

  const init = useCallback(async () => {
    if (cachedActor) {
      setActor(cachedActor);
      setIsFetching(false);
      return;
    }
    setIsFetching(true);
    const a = await resolveActor();
    if (mountedRef.current) {
      setActor(a);
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    init();
    return () => {
      mountedRef.current = false;
    };
  }, [init]);

  return { actor, isFetching };
}
