'use client';
import { useEffect, type ReactNode } from 'react';
import { X, type LucideIcon } from 'lucide-react';
import type { Curva } from '@/lib/types';
import { DAYS, DAY_SHORT, type DayKey } from '@/lib/utils';

export function Card({ title, sub, actions, children, className = '', bodyClass = 'p-4' }: {
  title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string;
}) {
  return (
    <section className={`glass min-w-0 ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="card-title">{title}</h2>}
            {sub && <p className="card-sub mt-0.5">{sub}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, hint, icon: Icon, tone = 'brand', trend }: {
  label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; tone?: 'brand' | 'accent' | 'green' | 'red' | 'slate' | 'violet'; trend?: ReactNode;
}) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-600/10 text-brand-600 dark:bg-brand-400/15 dark:text-brand-300',
    accent: 'bg-accent-500/15 text-accent-600 dark:text-accent-400',
    green: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
    red: 'bg-red-500/12 text-red-600 dark:text-red-400',
    slate: 'bg-slate-500/12 text-slate-600 dark:text-slate-300',
    violet: 'bg-violet-500/12 text-violet-600 dark:text-violet-300',
  };
  return (
    <div className="glass relative overflow-hidden p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-[11px] font-semibold uppercase leading-snug tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
        {Icon && <div className={`-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 ${tones[tone]}`}><Icon size={16} /></div>}
      </div>
      <div className="num mt-1 whitespace-nowrap text-[clamp(18px,1.55vw,24px)] font-bold leading-tight tracking-tight text-slate-900 dark:text-white">{value}</div>
      {hint && <div className="mt-1 text-xs leading-snug text-slate-500 dark:text-slate-400">{hint}</div>}
      {trend}
    </div>
  );
}

export function KpiGrid({ children, cols = 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6' }: { children: ReactNode; cols?: string }) {
  return <div className={`grid grid-cols-1 gap-3 ${cols}`}>{children}</div>;
}

export function Badge({ children, tone = 'slate', title }: { children: ReactNode; tone?: 'slate' | 'green' | 'red' | 'amber' | 'brand' | 'violet'; title?: string }) {
  const t: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800',
    red: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-800',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800',
    brand: 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-900/40 dark:text-brand-200 dark:ring-brand-800',
    violet: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:ring-violet-800',
  };
  return <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${t[tone]}`}>{children}</span>;
}

// Curva ABCD: rampa ordinal azul (A mais escuro)
export const CURVA_COLOR: Record<Curva, string> = { A: '#104281', B: '#2a78d6', C: '#6da7ec', D: '#9aa4b2' };
export function CurvaBadge({ c }: { c: Curva | null | undefined }) {
  if (!c) return <span className="text-slate-400">—</span>;
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold text-white" style={{ background: CURVA_COLOR[c] }} title={`Curva ${c}`}>{c}</span>
  );
}

export function DayDots({ days, color = '#0E4DA4' }: { days: DayKey[]; color?: string }) {
  return (
    <div className="flex gap-0.5" aria-label={days.join(', ')}>
      {DAYS.map((d) => {
        const on = days.includes(d);
        return (
          <span key={d} title={DAY_SHORT[d]}
            className={`inline-flex h-5 w-6 items-center justify-center rounded text-[9px] font-bold ${on ? 'text-white' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'}`}
            style={on ? { background: color } : undefined}>
            {DAY_SHORT[d].slice(0, 3)}
          </span>
        );
      })}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="scroll-thin flex gap-1 overflow-x-auto rounded-xl bg-slate-900/5 p-1 dark:bg-white/5">
      {items.map((it) => (
        <button key={it.id} className={`tab ${value === it.id ? 'tab-active' : ''}`} onClick={() => onChange(it.id)}>
          {it.label}
          {it.count !== undefined && (
            <span className={`ml-1.5 rounded-full px-1.5 text-[10px] font-bold ${value === it.id ? 'bg-white/25' : 'bg-slate-900/10 dark:bg-white/10'}`}>{it.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-300/70 bg-white/60 p-0.5 dark:border-slate-600/60 dark:bg-slate-900/50">
      {items.map((it) => (
        <button key={it.id} onClick={() => onChange(it.id)}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${value === it.id ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10'}`}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Drawer({ open, onClose, title, children, width = 'max-w-2xl' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[2000]">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside className={`absolute inset-y-0 right-0 flex w-full ${width} flex-col bg-[var(--surface-solid)] shadow-2xl`}>
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">{title}</div>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>
        <div className="scroll-thin flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">{children}</div>;
}

export function Info({ children, tone = 'brand' }: { children: ReactNode; tone?: 'brand' | 'amber' }) {
  const c = tone === 'amber'
    ? 'border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-200'
    : 'border-brand-200 bg-brand-50/80 text-brand-900 dark:border-brand-800/60 dark:bg-brand-900/30 dark:text-brand-100';
  return <div className={`rounded-xl border px-4 py-3 text-sm ${c}`}>{children}</div>;
}

export function Bar({ value, max, color = '#2a78d6' }: { value: number; max: number; color?: string }) {
  const w = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-200/70 dark:bg-slate-700/60">
      <div className="h-1.5 rounded-full" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}
