'use client';

import { useSyncExternalStore } from 'react';

export type PhaseType = 'verify' | 'shape' | 'blueprint' | 'synthesize';

export interface PhaseRun {
  runId: string;
  isRunning: boolean;
  ideaId: string;
  output: string;
  error: string | null;
  extra?: Record<string, unknown>;
}

const runs: Record<PhaseType, PhaseRun | null> = {
  verify: null,
  shape: null,
  blueprint: null,
  synthesize: null,
};

const aborts: Record<PhaseType, AbortController | null> = {
  verify: null,
  shape: null,
  blueprint: null,
  synthesize: null,
};

let nextRunId = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function getPhaseRun(phase: PhaseType): PhaseRun | null {
  return runs[phase];
}

export function startPhaseRun(
  phase: PhaseType,
  ideaId: string,
  ac: AbortController,
  extra?: Record<string, unknown>,
): string {
  aborts[phase]?.abort();
  const runId = String(++nextRunId);
  runs[phase] = { runId, isRunning: true, ideaId, output: '', error: null, extra };
  aborts[phase] = ac;
  notify();
  return runId;
}

export function updatePhaseOutput(phase: PhaseType, runId: string, output: string) {
  if (runs[phase]?.runId === runId) {
    runs[phase] = { ...runs[phase]!, output };
    notify();
  }
}

export function completePhaseRun(phase: PhaseType, runId: string) {
  if (runs[phase]?.runId === runId) {
    runs[phase] = { ...runs[phase]!, isRunning: false };
    notify();
  }
}

export function failPhaseRun(phase: PhaseType, runId: string, error: string) {
  if (runs[phase]?.runId === runId) {
    runs[phase] = { ...runs[phase]!, isRunning: false, error };
    notify();
  }
}

export function clearPhaseRun(phase: PhaseType) {
  runs[phase] = null;
  aborts[phase] = null;
  notify();
}

export function stopPhaseRun(phase: PhaseType) {
  aborts[phase]?.abort();
  if (runs[phase]) {
    runs[phase] = { ...runs[phase]!, isRunning: false };
  }
  aborts[phase] = null;
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePhaseRun(phase: PhaseType): PhaseRun | null {
  return useSyncExternalStore(subscribe, () => runs[phase], () => runs[phase]);
}
