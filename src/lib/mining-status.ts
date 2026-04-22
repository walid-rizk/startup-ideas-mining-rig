'use client';

import { useSyncExternalStore } from 'react';

export type MiningPhase = 'idle' | 'generating' | 'critiquing' | 'complete';

interface MiningStatus {
  isRunning: boolean;
  phase: MiningPhase;
  currentBatch: number;
}

let status: MiningStatus = { isRunning: false, phase: 'idle', currentBatch: 0 };
let abort: AbortController | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function getMiningStatus(): MiningStatus {
  return status;
}

export function setMiningStatus(patch: Partial<MiningStatus>) {
  status = { ...status, ...patch };
  notify();
}

export function setMiningAbort(ac: AbortController | null) {
  abort = ac;
}

export function getMiningAbort(): AbortController | null {
  return abort;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMiningStatus(): MiningStatus {
  return useSyncExternalStore(subscribe, getMiningStatus, getMiningStatus);
}
