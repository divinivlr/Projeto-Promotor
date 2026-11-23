'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle, BarChart3, CalendarRange, ChevronsLeft, ChevronsRight, Database, Filter, Gauge, LayoutDashboard,
  Map as MapIcon, Menu, Moon, Route, ShieldCheck, Sun, Target, Trophy, Users, UserSquare2, X, Loader2,
} from 'lucide-react';
import { useData } from '@/store/data';
import { BRAND } from '@/lib/brand';
import { FILTER_LABEL, activeFilterCount, type Filters } from '@/lib/filters';
import { DAYS, DAY_LABEL } from '@/lib/utils';
import { lsGet, lsSet } from '@/lib/idb';

const NAV = [
  { group: 'Territorial', items: [{ href: '/rotas', label: 'Visualizador de Rotas', icon: MapIcon }] },
  {
    group: 'Análise de Promotores',
    items: [
      { href: '/', label: 'Visão Geral', icon: LayoutDashboard },
      { href: '/promotores', label: 'Por Promotor', icon: UserSquare2 },
      { href: '/clientes', label: 'Por Cliente', icon: Users },
      { href: '/ineficiencias', label: 'Ineficiências', icon: AlertTriangle },
      { href: '/potencial', label: 'Potencial Sem Promotor', icon: Target },
      { href: '/abcd', label: 'Classificação ABCD', icon: BarChart3 },
      { href: '/roteiro-semanal', label: 'Roteiro Semanal', icon: CalendarRange },
      { href: '/construtor', label: 'Construtor de Rotas', icon: Route },
      { href: '/executivo', label: 'Dashboard Executivo', icon: Trophy },
      { href: '/qualidade', label: 'Qualidade dos Dados', icon: ShieldCheck },
    ],
  },
  { group: 'Dados', items: [{ href: '/dados', label: 'Carga de Planilhas', icon: Database }] },
];

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" className="h-9 w-9 shrink-0" aria-hidden>
        <rect width="64" height="64" rx="16" fill={BRAND.primary} />
        <path d="M18 14h14c11 0 18 7.4 18 18s-7 18-18 18H18z" fill="#fff" />
        <path d="M27 23h5c5.3 0 9 3.6 9 9s-3.7 9-9 9h-5z" fill={BRAND.primary} />
        <circle cx="48" cy="48" r="6" fill={BRAND.accent} />
      </svg>
      {!collapsed && (
        <div className="leading-tight">
          <div className="text-[15px] font-extrabold tracking-tight text-slate-900 dark:text-white">{BRAND.name}<span className="text-accent-500">.</span></div>
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Distribuidora</div>
        </div>
      )}
    </div>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { status, error, model, theme, toggleTheme, filters, setFilter, clearFilters } = useData();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => { setCollapsed(lsGet('dilnor-sidebar', false)); }, []);
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  const toggleCollapse = () => setCollapsed((c) => { lsSet('dilnor-sidebar', !c); return !c; });

  const current = NAV.flatMap((g) => g.items).find((i) => i.href === pathname);
  const nFilters = activeFilterCount(filters);
  const isFullBleed = pathname === '/rotas';

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={`no-print fixed inset-y-0 left-0 z-[1100] flex flex-col border-r border-[var(--border)] bg-[var(--surface-solid)]/95 backdrop-blur-xl transition-all duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'lg:w-[72px]' : 'lg:w-64'} w-64`}
      >
        <div className="flex h-16 items-center justify-between px-4">
          <Link href="/" className="min-w-0"><Logo collapsed={collapsed} /></Link>
          <button className="btn-ghost p-1.5 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"><X size={18} /></button>
        </div>
        <nav className="scroll-thin flex-1 overflow-y-auto px-3 pb-4">
          {NAV.map((g) => (
            <div key={g.group} className="mt-3">
              {!collapsed && <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{g.group}</div>}
              {g.items.map((it) => {
                const active = pathname === it.href;
                const Icon = it.icon;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    title={it.label}
                    className={`group mb-0.5 flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium transition ${
                      active
                        ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30'
                        : 'text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10'
                    } ${collapsed ? 'lg:justify-center' : ''}`}
                  >
                    <Icon size={18} className="shrink-0" />
                    <span className={collapsed ? 'lg:hidden' : ''}>{it.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="hidden border-t border-[var(--border)] p-3 lg:block">
          <button className="btn-ghost w-full justify-center" onClick={toggleCollapse} aria-label="Recolher menu">
            {collapsed ? <ChevronsRight size={18} /> : <><ChevronsLeft size={18} /> <span>Recolher</span></>}
          </button>
        </div>
      </aside>
      {mobileOpen && <div className="fixed inset-0 z-[1050] bg-slate-900/40 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Conteúdo */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-[1000] border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
            <button className="btn-ghost p-1.5 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold tracking-tight text-slate-900 dark:text-white sm:text-lg">{current?.label ?? 'Painel'}</h1>
              <div className="hidden truncate text-xs text-slate-500 dark:text-slate-400 sm:block">
                {model ? (
                  <>Base {model.base.origin === 'embedded' ? 'oficial embutida' : 'enviada por upload'} · {model.carteira.length} clientes roteirizados · {model.promotores.length} promotores · {model.rotasNova.length} rotas propostas</>
                ) : 'Carregando dados…'}
              </div>
            </div>
            <button className={`btn-outline relative ${filterOpen ? 'ring-2 ring-brand-400/40' : ''}`} onClick={() => setFilterOpen((o) => !o)}>
              <Filter size={16} /> <span className="hidden sm:inline">Filtros</span>
              {nFilters > 0 && <span className="ml-1 rounded-full bg-accent-500 px-1.5 text-[10px] font-bold text-white">{nFilters}</span>}
            </button>
            <button className="btn-outline p-2" onClick={toggleTheme} aria-label="Alternar tema" title="Modo claro / escuro">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
          {(nFilters > 0 || filterOpen) && (
            <div className="border-t border-[var(--border)] px-4 py-2 lg:px-6">
              {filterOpen && model && <FilterPanel />}
              {nFilters > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-xs text-slate-500">Filtros ativos:</span>
                  {(Object.keys(filters) as (keyof Filters)[]).filter((k) => filters[k]).map((k) => (
                    <span key={k} className="chip">
                      {FILTER_LABEL[k]}: <b className="font-semibold">{k === 'dia' ? DAY_LABEL[filters.dia!] : String(filters[k])}</b>
                      <button onClick={() => setFilter(k, undefined)} aria-label={`Remover ${FILTER_LABEL[k]}`} className="ml-0.5 rounded-full p-0.5 hover:bg-brand-200/60"><X size={12} /></button>
                    </span>
                  ))}
                  <button className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300" onClick={clearFilters}>Limpar todos</button>
                </div>
              )}
            </div>
          )}
        </header>
        <main className={isFullBleed ? 'flex-1' : 'flex-1 px-4 py-5 lg:px-6'}>
          {status === 'loading' && (
            <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-slate-500"><Loader2 className="animate-spin" /> Carregando base de dados…</div>
          )}
          {status === 'error' && (
            <div className="glass mx-auto mt-10 max-w-lg p-6 text-center">
              <Gauge className="mx-auto mb-2 text-red-500" />
              <div className="font-semibold">Não foi possível carregar os dados</div>
              <div className="mt-1 text-sm text-slate-500">{error}</div>
              <Link href="/dados" className="btn-primary mt-4">Enviar planilhas</Link>
            </div>
          )}
          {status === 'ready' && model && children}
        </main>
      </div>
    </div>
  );
}

function FilterPanel() {
  const { model, filters, setFilter } = useData();
  const opts = useMemo(() => {
    if (!model) return null;
    const proms = model.promotores.filter((p) => !filters.supervisor || p.supervisor === filters.supervisor).map((p) => p.nome).sort();
    const ramos = Array.from(new Set(model.carteira.map((c) => c.ramoFmt))).sort();
    const cidades = Array.from(new Set(model.carteira.map((c) => c.cidadeLabel).filter(Boolean))).sort();
    return { proms, ramos, cidades };
  }, [model, filters.supervisor]);
  if (!model || !opts) return null;
  const sel = (k: keyof Filters, label: string, options: { v: string; l: string }[]) => (
    <div className="min-w-[150px] flex-1">
      <label className="label">{label}</label>
      <select className="input" value={(filters[k] as string) || ''} onChange={(e) => setFilter(k, (e.target.value || undefined) as never)}>
        <option value="">Todos</option>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
  return (
    <div className="flex flex-wrap gap-3 pb-2">
      {sel('supervisor', 'Supervisor', model.supervisores.map((s) => ({ v: s, l: s })))}
      {sel('promotor', 'Promotor', opts.proms.map((s) => ({ v: s, l: s })))}
      {sel('cidade', 'Cidade', opts.cidades.map((s) => ({ v: s, l: s })))}
      {sel('dia', 'Dia da semana', DAYS.map((d) => ({ v: d, l: DAY_LABEL[d] })))}
      {sel('curva', 'Curva ABCD', ['A', 'B', 'C', 'D'].map((s) => ({ v: s, l: `Curva ${s}` })))}
      {sel('status', 'Status', [{ v: 'ativo', l: 'Ativo' }, { v: 'bloqueado', l: 'Bloqueado' }])}
      {sel('ramo', 'Ramo', opts.ramos.map((s) => ({ v: s, l: s })))}
      {sel('rota', 'Rota Nova', model.rotasNova.map((s) => ({ v: s, l: s })))}
    </div>
  );
}
