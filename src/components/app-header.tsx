'use client';

import Link from 'next/link';
import type { ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import { SessionToolbar } from '@/components/session-toolbar';
import {
  Pickaxe,
  Search,
  FileText,
  Code2,
  Package,
  Terminal,
  Home,
} from 'lucide-react';

export type PhaseKey =
  | 'home'
  | 'intake'
  | 'mine'
  | 'verify'
  | 'shape'
  | 'blueprint'
  | 'synthesize';

interface PhaseDef {
  key: PhaseKey;
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  outlineClass: string;
  activeClass: string;
}

const PHASES: PhaseDef[] = [
  {
    key: 'home',
    href: '/',
    label: 'Home',
    icon: Home,
    outlineClass:
      'border-zinc-700 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200',
    activeClass:
      'bg-zinc-700 text-white border-zinc-600 hover:bg-zinc-600 hover:text-white',
  },
  {
    key: 'intake',
    href: '/intake',
    label: 'Intake',
    icon: Terminal,
    outlineClass:
      'border-emerald-800 text-emerald-400 hover:bg-emerald-950 hover:text-emerald-300',
    activeClass:
      'bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-700 hover:text-white',
  },
  {
    key: 'mine',
    href: '/mine',
    label: 'Mine',
    icon: Pickaxe,
    outlineClass:
      'border-red-800 text-red-400 hover:bg-red-950 hover:text-red-300',
    activeClass:
      'bg-red-600 text-white border-red-500 hover:bg-red-700 hover:text-white',
  },
  {
    key: 'verify',
    href: '/verify',
    label: 'Verify',
    icon: Search,
    outlineClass:
      'border-yellow-800 text-yellow-400 hover:bg-yellow-950 hover:text-yellow-300',
    activeClass:
      'bg-yellow-600 text-white border-yellow-500 hover:bg-yellow-700 hover:text-white',
  },
  {
    key: 'shape',
    href: '/shape',
    label: 'Shape',
    icon: FileText,
    outlineClass:
      'border-blue-800 text-blue-400 hover:bg-blue-950 hover:text-blue-300',
    activeClass:
      'bg-blue-600 text-white border-blue-500 hover:bg-blue-700 hover:text-white',
  },
  {
    key: 'blueprint',
    href: '/blueprint',
    label: 'Architect',
    icon: Code2,
    outlineClass:
      'border-purple-800 text-purple-400 hover:bg-purple-950 hover:text-purple-300',
    activeClass:
      'bg-purple-600 text-white border-purple-500 hover:bg-purple-700 hover:text-white',
  },
  {
    key: 'synthesize',
    href: '/synthesize',
    label: 'Synthesize',
    icon: Package,
    outlineClass:
      'border-emerald-800 text-emerald-400 hover:bg-emerald-950 hover:text-emerald-300',
    activeClass:
      'bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-700 hover:text-white',
  },
];

export function AppHeader({ currentPhase }: { currentPhase?: PhaseKey }) {
  return (
    <header className="border-b border-zinc-800 px-6 py-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/"
            className="flex items-center gap-3 hover:opacity-90 transition-opacity"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500" />
            <div>
              <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">
                Startup Idea Mining Rig
              </h1>
              <p className="text-xs text-zinc-500 font-mono">
                STARTUP IDEA VALIDATOR v0.1
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-zinc-500 font-mono">SYSTEM ONLINE</span>
            </div>
            <SessionToolbar compact />
          </div>
        </div>
        <nav className="grid grid-cols-7 gap-3">
          {PHASES.map((p) => {
            const isActive = p.key === currentPhase;
            const Icon = p.icon;
            return (
              <Link key={p.key} href={p.href} className="w-full">
                <Button
                  variant="outline"
                  size="sm"
                  className={`w-full font-mono ${isActive ? p.activeClass : p.outlineClass}`}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {p.label}
                </Button>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
