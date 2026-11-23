'use client';
import { useMemo, useState } from 'react';
import { Boxes, CalendarDays, Coins, Factory, MapPinned, Navigation, TrendingUp, Users } from 'lucide-react';
import { useData } from '@/store/data';
import { Card, CurvaBadge, DayDots, Kpi, KpiGrid, Badge } from '@/components/ui';
import { BarChart, DAY_COLORS, useChartTheme } from '@/components/charts';
import { DataTable, type Column } from '@/components/ui/DataTable';
import MapView from '@/components/map/MapView';
import { clientPopup } from '@/components/map/popup';
import type { Client } from '@/lib/types';
import { DAYS, DAY_LABEL, DAY_SHORT, type DayKey, fmtBRL, fmtBRLc, fmtKm, fmtNum, formatDoc, pathKm } from '@/lib/utils';
import type { MapLine, MapPoint } from '@/components/map/types';

export default function PorPromotor() {
  const { model, filters, setFilter } = useData();
  const m = model!;
  const [hover, setHover] = useState<string | null>(null);
  const [dayFocus, setDayFocus] = useState<DayKey | ''>('');

  const proms = useMemo(() => m.promotores.filter((p) => !filters.supervisor || p.supervisor === filters.supervisor), [m, filters.supervisor]);
  const p = proms.find((x) => x.nome === filters.promotor) ?? proms.find((x) => !x.semRoteiro) ?? proms[0];
  const clients = useMemo(() => (p ? p.clientes.map((id) => m.clients.get(id)!).filter(Boolean) : []), [p, m]);

  const fornAgg = useMemo(() => {
    const map = new Map<string, number>();
    clients.forEach((c) => c.forn.forEach(([f, v]) => map.set(f, (map.get(f) || 0) + v)));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [clients]);

  const dayKm = useMemo(() => {
    const out = {} as Record<DayKey, number>;
    if (!p) return out;
    DAYS.forEach((d) => {
      const pts = p.porDia[d].map((id) => m.clients.get(id)!).filter((c) => c?.hasCoord).map((c) => ({ lat: c.lat!, lon: c.lon! }));
      out[d] = pathKm(pts);
    });
    return out;
  }, [p, m]);

  const { points, lines } = useMemo(() => {
    const pts: MapPoint[] = []; const ln: MapLine[] = [];
    if (!p) return { points: pts, lines: ln };
    const seen = new Set<string>();
    DAYS.forEach((d) => {
      if (dayFocus && d !== dayFocus) return;
      const cl = p.porDia[d].map((id) => m.clients.get(id)!).filter((c) => c?.hasCoord);
      cl.forEach((c, i) => {
        const id = seen.has(c.id) ? `${c.id}~${d}` : c.id;
        seen.add(c.id);
        pts.push({ id, lat: c.lat!, lon: c.lon!, color: DAY_COLORS[d], label: String(i + 1), title: `${DAY_SHORT[d]} · ${c.nome}`, popup: clientPopup(c, { rota: `${DAY_LABEL[d]} · parada ${i + 1}`, cor: DAY_COLORS[d] }) });
      });
      if (cl.length > 1) ln.push({ id: d, latlngs: cl.map((c) => [c.lat!, c.lon!]), color: DAY_COLORS[d], weight: 3, opacity: 0.8 });
    });
    return { points: pts, lines: ln };
  }, [p, m, dayFocus]);

  if (!p) return <div className="glass p-6 text-sm">Nenhum promotor para o filtro selecionado.</div>;

  const columns: Column<Client>[] = [
    { key: 'id', header: 'Código', value: (c) => c.id },
    { key: 'nome', header: 'Cliente', value: (c) => c.nome, render: (c) => <div className="max-w-[260px]"><div className="truncate font-medium">{c.nome}</div><div className="truncate text-[11px] text-slate-500">{c.ramoFmt}</div></div> },
    { key: 'doc', header: 'CNPJ', value: (c) => formatDoc(c.doc), className: 'whitespace-nowrap text-[12px]' },
    { key: 'cidade', header: 'Cidade', value: (c) => c.cidadeLabel, className: 'whitespace-nowrap' },
    { key: 'dias', header: 'Dias de visita', value: (c) => c.visitas.filter((v) => v.promotor === p.nome).map((v) => v.dia).join(' '), render: (c) => <DayDots days={DAYS.filter((d) => p.porDia[d].includes(c.id))} /> },
    { key: 'media', header: 'Média mensal', align: 'right', value: (c) => Math.round(c.media), render: (c) => fmtBRL(c.media) },
    { key: 'sku', header: 'SKUs', align: 'right', value: (c) => c.nSku },
    { key: 'forn', header: 'Fornec.', align: 'right', value: (c) => c.nForn },
    { key: 'curva', header: 'Curva', align: 'center', value: (c) => c.curva, render: (c) => <CurvaBadge c={c.curva} /> },
    { key: 'outros', header: 'Outros promotores', value: (c) => c.promotores.filter((x) => x !== p.nome).join(', '), render: (c) => { const o = c.promotores.filter((x) => x !== p.nome); return o.length ? <Badge tone="amber" title={o.join(', ')}>+{o.length} promotor(es)</Badge> : <span className="text-slate-400">—</span>; } },
  ];

  return (
    <div className="space-y-5">
      <div className="glass flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[200px]">
          <label className="label">Supervisor</label>
          <select className="input" value={filters.supervisor || ''} onChange={(e) => setFilter('supervisor', e.target.value || undefined)}>
            <option value="">Todos</option>
            {m.supervisores.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="min-w-[280px] flex-1">
          <label className="label">Promotor</label>
          <select className="input" value={p.nome} onChange={(e) => setFilter('promotor', e.target.value)}>
            {proms.map((x) => <option key={x.nome} value={x.nome}>{x.nome}{x.cod ? ` (${x.cod})` : ''}{x.semRoteiro ? ' — SEM ROTEIRO' : ''}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {p.roteiros.map((r) => <Badge key={r} tone="brand">{r}</Badge>)}
          {p.semRoteiro && <Badge tone="red">Sem roteiro cadastrado</Badge>}
        </div>
      </div>

      <KpiGrid cols="sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Clientes na carteira" value={fmtNum(p.clientes.length)} hint={`${p.cidades.length} cidade(s)`} icon={Users} />
        <Kpi label="Visitas por semana" value={fmtNum(p.visitasSemana)} hint={`${(p.visitasSemana / 6).toFixed(1).replace('.', ',')} por dia útil (Seg–Sáb)`} icon={CalendarDays} tone="violet" />
        <Kpi label="Faturamento YTD" value={fmtBRLc(p.total)} hint={`Média mensal ${fmtBRLc(p.media)}`} icon={Coins} tone="accent" />
        <Kpi label="Faturamento por visita/mês" value={fmtBRLc(p.visitasSemana ? p.media / (p.visitasSemana * 4.33) : 0)} hint="média mensal ÷ visitas no mês" icon={TrendingUp} tone="green" />
        <Kpi label="Mix de SKUs únicos" value={fmtNum(p.skus)} hint="produtos distintos comprados pela carteira" icon={Boxes} />
        <Kpi label="Fornecedores únicos" value={fmtNum(p.forn)} hint="indústrias atendidas" icon={Factory} tone="slate" />
        <Kpi label="Km/semana (sequência atual)" value={fmtKm(p.kmSemana)} hint={`Otimizado: ${fmtKm(p.kmOtimizado)}`} icon={Navigation} tone="red" />
        <Kpi label="Economia potencial" value={fmtKm(Math.max(0, p.kmSemana - p.kmOtimizado))} hint={p.kmSemana ? `${Math.round((1 - p.kmOtimizado / p.kmSemana) * 100)}% do percurso semanal` : '—'} icon={MapPinned} tone="green" />
      </KpiGrid>

      <Card title="Agenda semanal" sub="Sequência conforme o relatório de roteiros · distância Haversine entre paradas consecutivas">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {DAYS.map((d) => {
            const ids = p.porDia[d];
            const media = ids.reduce((s, id) => s + (m.clients.get(id)?.media ?? 0), 0);
            return (
              <div key={d} role="button" tabIndex={0} onClick={() => setDayFocus((x) => (x === d ? '' : d))} onKeyDown={(e) => e.key === 'Enter' && setDayFocus((x) => (x === d ? '' : d))}
                className={`cursor-pointer rounded-xl border p-3 text-left transition ${dayFocus === d ? 'border-brand-400 ring-2 ring-brand-400/30' : 'border-[var(--border)] hover:border-brand-300'} bg-white/50 dark:bg-slate-900/40`}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: DAY_COLORS[d] }} />{DAY_LABEL[d]}</span>
                  <span className="text-[11px] text-slate-500">{ids.length} · {fmtKm(dayKm[d])}</span>
                </div>
                <ol className="space-y-1">
                  {ids.map((id, i) => {
                    const c = m.clients.get(id);
                    return (
                      <li key={id} className="flex items-start gap-1.5 text-[12px]" onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)}>
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: DAY_COLORS[d] }}>{i + 1}</span>
                        <span className="min-w-0"><span className="block truncate font-medium">{c?.fantasia || c?.nome || id}</span><span className="block truncate text-[10.5px] text-slate-500">{c?.cidadeLabel} · {fmtBRLc(c?.media ?? 0)}/mês</span></span>
                      </li>
                    );
                  })}
                  {!ids.length && <li className="text-[12px] text-slate-400">Sem visitas</li>}
                </ol>
                {ids.length > 0 && <div className="mt-2 border-t border-[var(--border)] pt-1.5 text-[11px] text-slate-500">Média do dia: <b className="text-slate-700 dark:text-slate-200">{fmtBRLc(media)}</b></div>}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="Mapa de atuação" sub={dayFocus ? `Somente ${DAY_LABEL[dayFocus]} · clique no dia novamente para ver todos` : 'Cores por dia da semana · número = ordem da visita'} className="xl:col-span-2" bodyClass="p-2">
          <MapView points={points} lines={lines} highlightId={hover} height={460} fitKey={`${p.nome}|${dayFocus}`} />
          <div className="flex flex-wrap gap-3 px-2 pt-2 text-[11px] text-slate-500">
            {DAYS.map((d) => <span key={d} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: DAY_COLORS[d] }} />{DAY_LABEL[d]}</span>)}
          </div>
        </Card>
        <Card title="Top fornecedores da carteira" sub="Venda YTD por indústria">
          <FornChart data={fornAgg} names={m.base.fornecedores} />
        </Card>
      </div>

      <Card title={`Carteira de ${p.nome}`}>
        <DataTable rows={clients} columns={columns} rowKey={(c) => c.id} exportName={`carteira_${p.nome.replace(/\s+/g, '_')}`} onRowHover={(c) => setHover(c?.id ?? null)} initialSort={{ key: 'media', dir: 'desc' }} />
      </Card>
    </div>
  );
}

function FornChart({ data, names }: { data: [string, number][]; names: Record<string, string> }) {
  const t = useChartTheme();
  const short = (s: string) => s.replace(/\b(LTDA|S\/?A|COMERCIAL|INDUSTRIA|IND|COM|DO BRASIL|BRASIL)\b\.?/gi, '').replace(/\s+/g, ' ').trim().slice(0, 22);
  return <BarChart horizontal labels={data.map(([f]) => short(names[f] || f))} data={data.map(([, v]) => v)} fmt={fmtBRLc} height={420} color={t.series[1]} />;
}
