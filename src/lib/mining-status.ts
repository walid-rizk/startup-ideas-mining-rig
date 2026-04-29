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

// Separate store for streaming output — kept separate so that per-token
// updates don't re-render components that only care about isRunning/phase.

interface MiningOutput {
  generatedIdeas: string;
  critiqueOutput: string;
  error: string | null;
}

let output: MiningOutput = { generatedIdeas: '', critiqueOutput: '', error: null };
const outputListeners = new Set<() => void>();

function notifyOutput() {
  outputListeners.forEach((l) => l());
}

export function getMiningOutput(): MiningOutput {
  return output;
}

export function setMiningOutput(patch: Partial<MiningOutput>) {
  output = { ...output, ...patch };
  notifyOutput();
}

function subscribeOutput(listener: () => void) {
  outputListeners.add(listener);
  return () => {
    outputListeners.delete(listener);
  };
}

export function useMiningOutput(): MiningOutput {
  return useSyncExternalStore(subscribeOutput, getMiningOutput, getMiningOutput);
}
