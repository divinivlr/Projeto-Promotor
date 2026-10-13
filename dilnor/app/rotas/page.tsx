'use client';
import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Crosshair, Eye, EyeOff, Layers, Route as RouteIcon, Search, Spline } from 'lucide-react';
import { useData } from '@/store/data';
import MapView from '@/components/map/MapView';
import { clientPopup } from '@/components/map/popup';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { CurvaBadge, DayDots, Badge, Segmented } from '@/components/ui';
import type { Client } from '@/lib/types';
import { DAYS, DAY_LABEL, type DayKey, fmtBRL, fmtBRLc, fmtKm, fmtNum, formatDoc, optimizeOrder, pathKm, routePalette, stripAccents, uniq } from '@/lib/utils';
import type { MapLine, MapPoint } from '@/components/map/types';

type Mode = 'nova' | 'atual';
type Status = '' | 'ativo' | 'bloqueado' | 'A' | 'B' | 'C' | 'D';

export default function RotasPage() {
  const { model } = useData();
  const m = model!;
  const [mode, setMode] = useState<Mode>('nova');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [rota, setRota] = useState('');
  const [cidade, setCidade] = useState('');
  const [dia, setDia] = useState<DayKey | ''>('');
  const [status, setStatus] = useState<Status>('');
  const [q, setQ] = useState('');
  const [cluster, setCluster] = useState(false);
  const [lines, setLines] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [tableOpen, setTableOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false); // no celular, filtros recolhidos (desktop sempre visível)

  // Grupos (rotas) e cores
  const { groups, groupOf, daysOf, universe } = useMemo(() => {
    if (mode === 'nova') {
      return {
        groups: m.rotasNova,
        groupOf: (c: Client) => [c.rotaNova!],
        daysOf: (c: Client) => c.diasNova,
        universe: m.nova,
      };
    }
    const proms = m.promotores.filter((p) => p.clientes.length).map((p) => p.nome).sort();
    return {
      groups: proms,
      groupOf: (c: Client) => c.promotores,
      daysOf: (c: Client) => c.dias,
      universe: m.carteira,
    };
  }, [mode, m]);
  const colors = useMemo(() => {
    const pal = routePalette(groups.length);
    return new Map(groups.map((g, i) => [g, pal[i]]));
  }, [groups]);
  const short = useCallback((g: string) => (mode === 'nova' ? g.replace(/\D/g, '') : g.split(' ').map((w) => w[0]).slice(0, 2).join('')), [mode]);

  const switchMode = (mo: Mode) => { setMode(mo); setHidden(new Set()); setRota(''); setHoverId(null); setFocusId(null); };

  // Filtros instantâneos (sem considerar visibilidade da legenda)
  const base = useMemo(() => {
    const terms = stripAccents(q.toLowerCase()).split(/\s+/).filter(Boolean);
    return universe.filter((c) => {
      const gs = groupOf(c);
      if (rota && !gs.includes(rota)) return false;
      if (cidade && c.cidadeLabel !== cidade) return false;
      if (dia && !daysOf(c).includes(dia)) return false;
      if (status === 'ativo' && c.bloqueado) return false;
      if (status === 'bloqueado' && !c.bloqueado) return false;
      if (['A', 'B', 'C', 'D'].includes(status) && c.curva !== status) return false;
      if (terms.length) {
        const hay = stripAccents(`${c.nome} ${c.fantasia} ${c.id} ${c.doc} ${formatDoc(c.doc)}`.toLowerCase());
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }, [universe, groupOf, daysOf, rota, cidade, dia, status, q]);

  const visible = useMemo(() => base.filter((c) => groupOf(c).some((g) => !hidden.has(g))), [base, hidden, groupOf]);
  const primary = useCallback((c: Client) => groupOf(c).find((g) => !hidden.has(g)) ?? groupOf(c)[0], [groupOf, hidden]);

  const counts = useMemo(() => {
    const map = new Map<string, { n: number; media: number }>();
    base.forEach((c) => groupOf(c).forEach((g) => { const x = map.get(g) || { n: 0, media: 0 }; x.n++; x.media += c.media; map.set(g, x); }));
    return map;
  }, [base, groupOf]);

  const points: MapPoint[] = useMemo(() => visible.filter((c) => c.hasCoord).map((c) => {
    const g = primary(c);
    const col = colors.get(g) ?? '#0E4DA4';
    return { id: c.id, lat: c.lat!, lon: c.lon!, color: col, label: short(g), title: `${c.nome} · ${g}`, popup: clientPopup(c, { rota: g, cor: col, linhas: mode === 'nova' ? [['Dias (proposta)', daysOf(c).map((d) => DAY_LABEL[d].slice(0, 3)).join(' · ') || '—']] : undefined }) };
  }), [visible, primary, colors, short, mode, daysOf]);

  // Linhas de rota (sequência otimizada por dia)
  const routeLines: MapLine[] = useMemo(() => {
    if (!lines) return [];
    const out: MapLine[] = [];
    const byG = new Map<string, Client[]>();
    visible.forEach((c) => { if (!c.hasCoord) return; groupOf(c).forEach((g) => { if (hidden.has(g)) return; const a = byG.get(g) || []; a.push(c); byG.set(g, a); }); });
    byG.forEach((cl, g) => {
      for (const d of dia ? [dia] : DAYS) {
        const pts = cl.filter((c) => daysOf(c).includes(d)).map((c) => ({ lat: c.lat!, lon: c.lon! }));
        if (pts.length < 2) continue;
        out.push({ id: `${g}-${d}`, latlngs: optimizeOrder(pts).map((p) => [p.lat, p.lon]), color: colors.get(g)!, weight: 2.5, opacity: 0.75 });
      }
    });
    return out;
  }, [lines, visible, groupOf, hidden, dia, daysOf, colors]);

  const summary = useMemo(() => {
    const media = visible.reduce((s, c) => s + c.media, 0);
    const cidades = uniq(visible.map((c) => c.cidadeLabel)).length;
    let km = 0;
    const gs = groups.filter((g) => !hidden.has(g) && (!rota || g === rota));
    for (const g of gs) for (const d of dia ? [dia] : DAYS) {
      const pts = visible.filter((c) => c.hasCoord && groupOf(c).includes(g) && daysOf(c).includes(d)).map((c) => ({ lat: c.lat!, lon: c.lon! }));
      km += pathKm(optimizeOrder(pts));
    }
    return { n: visible.length, media, cidades, km, semCoord: visible.filter((c) => !c.hasCoord).length, rotas: gs.length };
  }, [visible, groups, hidden, rota, dia, groupOf, daysOf]);

  const cidades = useMemo(() => uniq(universe.map((c) => c.cidadeLabel).filter(Boolean)).sort(), [universe]);
  const toggle = (g: string) => setHidden((h) => { const n = new Set(h); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  const solo = (g: string) => setHidden(new Set(groups.filter((x) => x !== g)));

  const columns: Column<Client>[] = [
    {
      key: 'rota', header: mode === 'nova' ? 'Rota' : 'Promotor', value: (c) => groupOf(c).join(', '),
      render: (c) => (
        <div className="flex flex-wrap gap-1">
          {groupOf(c).map((g) => (
            <span key={g} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold text-white" style={{ background: colors.get(g) }}>
              {mode === 'nova' ? g : g.split(' ').slice(0, 2).join(' ')}
            </span>
          ))}
        </div>
      ),
    },
    { key: 'id', header: 'Código', value: (c) => c.id },
    { key: 'nome', header: 'Cliente', value: (c) => c.nome, render: (c) => <div className="max-w-[280px]"><div className="truncate font-medium">{c.nome}</div>{c.fantasia && c.fantasia !== c.nome && <div className="truncate text-[11px] text-slate-500">{c.fantasia}</div>}</div> },
    { key: 'doc', header: 'CNPJ/CPF', value: (c) => formatDoc(c.doc), className: 'whitespace-nowrap text-[12px]' },
    { key: 'cidade', header: 'Cidade', value: (c) => c.cidadeLabel, render: (c) => <span className="whitespace-nowrap">{c.cidadeLabel}{c.bairro && <span className="text-slate-400"> · {c.bairro}</span>}</span> },
    { key: 'dias', header: 'Dias', value: (c) => daysOf(c).join(' '), render: (c) => <DayDots days={daysOf(c)} color={colors.get(primary(c))} /> },
    ...(mode === 'nova' ? [{ key: 'prom', header: 'Promotor atual', value: (c: Client) => c.promotores.join(', ') || '—', render: (c: Client) => <span className="text-[12px]">{c.promotores.map((p) => p.split(' ').slice(0, 2).join(' ')).join(', ') || '—'}</span> }] : []),
    { key: 'media', header: 'Média mensal', align: 'right', value: (c) => Math.round(c.media), render: (c) => fmtBRL(c.media) },
    { key: 'curva', header: 'Curva', align: 'center', value: (c) => c.curva, render: (c) => <CurvaBadge c={c.curva} /> },
    { key: 'status', header: 'Status', value: (c) => (c.bloqueado ? 'Bloqueado' : c.hasCoord ? 'Ativo' : 'Sem coordenada'), render: (c) => c.bloqueado ? <Badge tone="red">Bloqueado</Badge> : !c.hasCoord ? <Badge tone="amber">Sem coord.</Badge> : <Badge tone="green">Ativo</Badge> },
  ];

  return (
    <div className="flex flex-col lg:h-[calc(100vh-64px)] lg:flex-row">
      {/* Painel lateral: filtros + legenda */}
      <aside className="flex shrink-0 flex-col border-b border-[var(--border)] bg-[var(--surface)] backdrop-blur-xl lg:w-[330px] lg:border-b-0 lg:border-r">
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <Segmented value={mode} onChange={switchMode} items={[{ id: 'nova', label: 'Rota Nova (35)' }, { id: 'atual', label: 'Operação Atual' }]} />
            <button className="btn-ghost p-1.5 lg:hidden" onClick={() => setPanelOpen((o) => !o)} aria-label="Mostrar filtros">{panelOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
          </div>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-8" placeholder="Buscar por nome, código ou CNPJ…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className={`grid grid-cols-2 gap-2 ${panelOpen ? '' : 'hidden lg:grid'}`}>
            <div className="col-span-2">
              <label className="label">{mode === 'nova' ? 'Rota' : 'Promotor'}</label>
              <select className="input" value={rota} onChange={(e) => setRota(e.target.value)}>
                <option value="">Todas</option>
                {groups.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Cidade</label>
              <select className="input" value={cidade} onChange={(e) => setCidade(e.target.value)}>
                <option value="">Todas</option>
                {cidades.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Dia da semana</label>
              <select className="input" value={dia} onChange={(e) => setDia(e.target.value as DayKey | '')}>
                <option value="">Todos</option>
                {DAYS.map((d) => <option key={d} value={d}>{DAY_LABEL[d]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                <option value="">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="bloqueado">Bloqueado</option>
                {['A', 'B', 'C', 'D'].map((c) => <option key={c} value={c}>Curva {c}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={`btn-outline px-2.5 py-1 text-xs ${cluster ? '!border-brand-400 !text-brand-600 dark:!text-brand-300' : ''}`} onClick={() => setCluster((v) => !v)}><Layers size={14} /> Agrupar</button>
            <button className={`btn-outline px-2.5 py-1 text-xs ${lines ? '!border-brand-400 !text-brand-600 dark:!text-brand-300' : ''}`} onClick={() => setLines((v) => !v)}><Spline size={14} /> Traçado</button>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-900/[.035] p-3 text-xs dark:bg-white/5">
            <Stat l="Clientes" v={fmtNum(summary.n)} />
            <Stat l="Média mensal" v={fmtBRLc(summary.media)} />
            <Stat l={mode === 'nova' ? 'Rotas visíveis' : 'Promotores'} v={fmtNum(summary.rotas)} />
            <Stat l="Cidades" v={fmtNum(summary.cidades)} />
            <Stat l="Km/semana (estim.)" v={fmtKm(summary.km)} />
            <Stat l="Sem coordenada" v={fmtNum(summary.semCoord)} />
          </div>
        </div>
        <div className={`flex min-h-0 flex-1 flex-col border-t border-[var(--border)] ${panelOpen ? '' : 'hidden lg:flex'}`}>
          <div className="flex items-center justify-between px-4 py-2">
            <span className="label !mb-0">Legenda · {groups.length} {mode === 'nova' ? 'rotas' : 'promotores'}</span>
            <div className="flex gap-1">
              <button className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => setHidden(new Set())}><Eye size={13} /> Todas</button>
              <button className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => setHidden(new Set(groups))}><EyeOff size={13} /> Nenhuma</button>
            </div>
          </div>
          <ul className="scroll-thin max-h-[280px] flex-1 overflow-y-auto px-2 pb-3 lg:max-h-none">
            {groups.map((g) => {
              const on = !hidden.has(g);
              const ct = counts.get(g);
              return (
                <li key={g} className="group flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-900/5 dark:hover:bg-white/5">
                  <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => toggle(g)} title="Mostrar/ocultar">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white transition ${on ? '' : 'opacity-25 grayscale'}`} style={{ background: colors.get(g) }}>{short(g)}</span>
                    <span className={`min-w-0 flex-1 truncate text-[12.5px] ${on ? 'font-medium text-slate-800 dark:text-slate-100' : 'text-slate-400 line-through'}`}>{g}</span>
                    <span className="num text-[11px] text-slate-500">{ct?.n ?? 0}</span>
                  </button>
                  <button className="rounded p-1 text-slate-400 opacity-0 hover:text-brand-600 group-hover:opacity-100" onClick={() => solo(g)} title="Exibir somente esta"><Crosshair size={13} /></button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      {/* Mapa + tabela sincronizada */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="relative h-[62vh] min-h-[360px] lg:h-auto lg:flex-1">
          <MapView
            points={points} lines={routeLines} cluster={cluster} highlightId={hoverId} focusId={focusId}
            onPointClick={(id) => setHoverId(id)} fitKey={`${mode}|${rota}|${cidade}|${dia}|${status}|${q}`}
            height="100%" className="!rounded-none"
          />
        </div>
        <div className={`border-t border-[var(--border)] bg-[var(--surface-solid)] ${tableOpen ? 'lg:h-[38%]' : ''} flex flex-col`}>
          <button className="flex items-center justify-between px-4 py-2 text-left text-sm font-semibold" onClick={() => setTableOpen((o) => !o)}>
            <span className="flex items-center gap-2"><RouteIcon size={15} className="text-brand-600" /> Clientes ({fmtNum(visible.length)}) <span className="text-xs font-normal text-slate-500">passe o mouse para destacar no mapa · clique para localizar</span></span>
            {tableOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
          {tableOpen && (
            <div className="scroll-thin min-h-0 flex-1 overflow-auto px-4 pb-3">
              <DataTable rows={visible} columns={columns} rowKey={(c) => c.id} pageSize={50} searchable={false} dense
                exportName={mode === 'nova' ? 'rota_nova_clientes' : 'operacao_atual_clientes'}
                onRowHover={(c) => setHoverId(c?.id ?? null)} onRowClick={(c) => setFocusId(`${c.id}#${Date.now()}`)} highlightKey={hoverId}
                initialSort={{ key: 'rota', dir: 'asc' }} />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ l, v }: { l: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{l}</div>
      <div className="num text-sm font-bold text-slate-900 dark:text-white">{v}</div>
    </div>
  );
}
