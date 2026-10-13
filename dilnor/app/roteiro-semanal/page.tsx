'use client';
import { useMemo, useState } from 'react';
import { ArrowRightLeft, CheckCircle2, ListOrdered, TriangleAlert } from 'lucide-react';
import { useData } from '@/store/data';
import { Badge, Card, CurvaBadge, Info, Segmented } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import MapView from '@/components/map/MapView';
import { clientPopup } from '@/components/map/popup';
import { DAY_COLORS } from '@/components/charts';
import { analyzePromotor, type Sugestao } from '@/lib/routing';
import type { Client, Promotor } from '@/lib/types';
import { DAYS, DAY_LABEL, DAY_SHORT, fmtBRL, fmtKm, fmtNum, NUM1 } from '@/lib/utils';
import type { MapCircle, MapLine, MapPoint } from '@/components/map/types';

interface GridRow { key: string; promotor: string; c: Client; dias: Set<string> }

export default function RoteiroSemanal() {
  const { model, filters, setFilter } = useData();
  const m = model!;
  const [view, setView] = useState<'grade' | 'promotores'>('grade');
  const [mapOrder, setMapOrder] = useState<'atual' | 'otimizada'>('atual');

  const proms = useMemo(() => m.promotores.filter((p) => !p.semRoteiro && (!filters.supervisor || p.supervisor === filters.supervisor) && (!filters.promotor || p.nome === filters.promotor)), [m, filters]);

  const analyses = useMemo(() => new Map(proms.map((p) => [p.nome, analyzePromotor(m, p)])), [proms, m]);

  const grid: GridRow[] = useMemo(() => {
    const rows: GridRow[] = [];
    for (const p of proms) for (const id of p.clientes) {
      const c = m.clients.get(id);
      if (!c) continue;
      if (filters.cidade && c.cidadeLabel !== filters.cidade) continue;
      if (filters.curva && c.curva !== filters.curva) continue;
      if (filters.dia && !p.porDia[filters.dia].includes(id)) continue;
      rows.push({ key: `${p.nome}|${id}`, promotor: p.nome, c, dias: new Set(DAYS.filter((d) => p.porDia[d].includes(id))) });
    }
    return rows;
  }, [proms, m, filters]);

  const sel: Promotor | undefined = proms.find((p) => p.nome === filters.promotor) ?? (proms.length === 1 ? proms[0] : undefined);
  const selA = sel ? analyses.get(sel.nome) : undefined;

  const allSug: Sugestao[] = useMemo(() => Array.from(analyses.values()).flatMap((a) => a.sugestoes).sort((a, b) => b.ganhoKm - a.ganhoKm), [analyses]);
  const ganhoTotal = proms.reduce((s, p) => s + Math.max(0, p.kmSemana - p.kmOtimizado), 0);

  const gridCols: Column<GridRow>[] = [
    { key: 'prom', header: 'Promotor', value: (r) => r.promotor, render: (r) => <span className="whitespace-nowrap text-[12px] font-medium">{r.promotor.split(' ').slice(0, 3).join(' ')}</span> },
    { key: 'id', header: 'Código', value: (r) => r.c.id },
    { key: 'nome', header: 'Cliente', value: (r) => r.c.fantasia || r.c.nome, render: (r) => <span className="block max-w-[240px] truncate">{r.c.fantasia || r.c.nome}</span> },
    { key: 'cidade', header: 'Cidade', value: (r) => r.c.cidadeLabel, className: 'whitespace-nowrap' },
    ...DAYS.map((d) => ({
      key: d, header: DAY_SHORT[d], align: 'center' as const, value: (r: GridRow) => (r.dias.has(d) ? '✅' : ''),
      render: (r: GridRow) => (r.dias.has(d) ? <CheckCircle2 size={17} className="mx-auto" style={{ color: DAY_COLORS[d] }} /> : <span className="text-slate-300 dark:text-slate-700">·</span>),
    })),
    { key: 'freq', header: 'Visitas/sem.', align: 'right', value: (r) => r.dias.size },
    { key: 'media', header: 'Média mensal', align: 'right', value: (r) => Math.round(r.c.media), render: (r) => fmtBRL(r.c.media) },
    { key: 'curva', header: 'Curva', align: 'center', value: (r) => r.c.curva, render: (r) => <CurvaBadge c={r.c.curva} /> },
  ];

  const maxDay = Math.max(1, ...proms.flatMap((p) => DAYS.map((d) => p.porDia[d].length)));
  const promCols: Column<Promotor>[] = [
    { key: 'nome', header: 'Promotor', value: (p) => p.nome, render: (p) => <button className="text-left font-medium text-brand-700 hover:underline dark:text-brand-300" onClick={() => setFilter('promotor', p.nome)}>{p.nome}</button> },
    { key: 'cl', header: 'Clientes', align: 'right', value: (p) => p.clientes.length },
    ...DAYS.map((d) => ({
      key: d, header: DAY_SHORT[d], align: 'center' as const, value: (p: Promotor) => p.porDia[d].length,
      render: (p: Promotor) => {
        const n = p.porDia[d].length; const a = n / maxDay;
        return <span className={`inline-flex h-6 w-8 items-center justify-center rounded text-[11px] font-bold ${n > 6 ? 'ring-2 ring-red-400' : ''}`} style={{ background: n ? `rgba(42,120,214,${0.12 + a * 0.75})` : 'transparent', color: a > 0.55 ? '#fff' : undefined }}>{n || '·'}</span>;
      },
    })),
    { key: 'vis', header: 'Visitas/sem.', align: 'right', value: (p) => p.visitasSemana },
    { key: 'km', header: 'Km atual', align: 'right', value: (p) => Math.round(p.kmSemana), render: (p) => fmtKm(p.kmSemana) },
    { key: 'kmo', header: 'Km otimizado', align: 'right', value: (p) => Math.round(p.kmOtimizado), render: (p) => fmtKm(p.kmOtimizado) },
    { key: 'eco', header: 'Economia', align: 'right', value: (p) => Math.round(p.kmSemana - p.kmOtimizado), render: (p) => <Badge tone={p.kmSemana - p.kmOtimizado > 10 ? 'green' : 'slate'}>{fmtKm(p.kmSemana - p.kmOtimizado)}</Badge> },
    { key: 'disp', header: 'Dispersão média', align: 'right', value: (p) => { const a = analyses.get(p.nome); const ds = a?.dias.filter((x) => x.centro) ?? []; return ds.length ? Math.round((ds.reduce((s, x) => s + x.dispersao, 0) / ds.length) * 10) / 10 : null; }, render: (p) => { const a = analyses.get(p.nome); const ds = a?.dias.filter((x) => x.centro) ?? []; return ds.length ? fmtKm(ds.reduce((s, x) => s + x.dispersao, 0) / ds.length) : '—'; } },
    { key: 'sug', header: 'Sugestões', align: 'right', value: (p) => analyses.get(p.nome)?.sugestoes.length ?? 0 },
  ];

  // Mapa do promotor selecionado: clientes por dia, centroides e sequência
  const mapData = useMemo(() => {
    const points: MapPoint[] = []; const lines: MapLine[] = []; const circles: MapCircle[] = [];
    if (!sel || !selA) return { points, lines, circles };
    const seen = new Set<string>();
    selA.dias.forEach((da) => {
      const seq = (mapOrder === 'otimizada' ? da.ordemOtimizada : da.clientes).filter((c) => c.hasCoord);
      seq.forEach((c, i) => {
        const id = seen.has(c.id) ? `${c.id}~${da.dia}` : c.id; seen.add(c.id);
        points.push({ id, lat: c.lat!, lon: c.lon!, color: DAY_COLORS[da.dia], label: String(i + 1), title: c.nome, popup: clientPopup(c, { rota: `${DAY_LABEL[da.dia]} · parada ${i + 1}`, cor: DAY_COLORS[da.dia] }) });
      });
      if (seq.length > 1) lines.push({ id: da.dia, latlngs: seq.map((c) => [c.lat!, c.lon!]), color: DAY_COLORS[da.dia], dashed: mapOrder === 'otimizada' });
      if (da.centro) {
        circles.push({ lat: da.centro.lat, lon: da.centro.lon, color: DAY_COLORS[da.dia], title: `Centroide ${DAY_LABEL[da.dia]}` });
        circles.push({ lat: da.centro.lat, lon: da.centro.lon, radiusM: Math.max(300, da.dispersao * 1000), color: DAY_COLORS[da.dia], fillOpacity: 0.05 });
      }
    });
    return { points, lines, circles };
  }, [sel, selA, mapOrder]);

  const sugIcon = (t: Sugestao['tipo']) => t === 'mover' ? <ArrowRightLeft size={14} className="text-violet-600" /> : t === 'reordenar' ? <ListOrdered size={14} className="text-emerald-600" /> : <TriangleAlert size={14} className="text-amber-600" />;
  const sugList = sel ? selA?.sugestoes ?? [] : allSug.slice(0, 40);

  return (
    <div className="space-y-5">
      <Info>
        Heurística aplicada: sequência por <b>vizinho mais próximo multi-início + 2-opt</b> (distância Haversine), <b>centroide geográfico por dia</b> e realocação sugerida quando um cliente está a mais de 8 km do centroide do seu dia e a menos da metade dessa distância do centroide de outro dia.
        Economia total potencial com reordenação: <b>{fmtKm(ganhoTotal)}/semana</b> em {proms.length} promotores.
      </Info>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented value={view} onChange={setView} items={[{ id: 'grade', label: 'Grade Seg–Sáb' }, { id: 'promotores', label: 'Consolidado por promotor' }]} />
        {sel && <span className="text-sm text-slate-500">Promotor em análise: <b className="text-slate-800 dark:text-slate-100">{sel.nome}</b> <button className="ml-2 text-xs text-brand-600 underline" onClick={() => setFilter('promotor', undefined)}>ver todos</button></span>}
      </div>

      {view === 'grade' ? (
        <Card title="Roteiro semanal unificado" sub={`${fmtNum(grid.length)} combinações promotor × cliente · ✅ = visita programada`}>
          <DataTable rows={grid} columns={gridCols} rowKey={(r) => r.key} exportName="roteiro_semanal_unificado" pageSize={25} initialSort={{ key: 'prom', dir: 'asc' }} dense />
        </Card>
      ) : (
        <Card title="Carga semanal por promotor" sub="Intensidade = nº de clientes no dia · contorno vermelho = acima de 6 clientes/dia">
          <DataTable rows={proms} columns={promCols} rowKey={(p) => p.nome} exportName="carga_semanal_promotores" initialSort={{ key: 'eco', dir: 'desc' }} />
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3" bodyClass="p-2"
          title={sel ? `Centroides e sequência · ${sel.nome}` : 'Mapa de centroides'}
          sub={sel ? 'Círculo tracejado = dispersão média do dia em torno do centroide' : 'Selecione um promotor (filtro ou tabela consolidada) para ver centroides e sequência'}
          actions={sel && <Segmented value={mapOrder} onChange={setMapOrder} items={[{ id: 'atual', label: 'Sequência atual' }, { id: 'otimizada', label: 'Otimizada' }]} />}>
          {sel ? (
            <>
              <MapView points={mapData.points} lines={mapData.lines} circles={mapData.circles} height={440} fitKey={sel.nome} />
              <div className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3 lg:grid-cols-6">
                {selA!.dias.map((d) => (
                  <div key={d.dia} className="rounded-lg bg-slate-900/[.04] p-2 text-[11px] dark:bg-white/5">
                    <div className="flex items-center gap-1.5 font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: DAY_COLORS[d.dia] }} />{DAY_SHORT[d.dia]} · {d.clientes.length}</div>
                    <div className="text-slate-500">{fmtKm(d.kmAtual)} → {fmtKm(d.kmOtimizado)}</div>
                    <div className="text-slate-500">disp. {NUM1.format(d.dispersao)} km</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex h-[300px] items-center justify-center text-sm text-slate-500">Nenhum promotor selecionado.</div>
          )}
        </Card>
        <Card className="xl:col-span-2" title="Sugestões de otimização" sub={sel ? `${sugList.length} sugestão(ões) para ${sel.nome}` : 'Maiores ganhos entre todos os promotores'}>
          <ul className="scroll-thin max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {sugList.map((s, i) => (
              <li key={i} className="flex gap-2 rounded-lg border border-[var(--border)] bg-white/50 p-2.5 text-[12.5px] dark:bg-slate-900/40">
                <span className="mt-0.5">{sugIcon(s.tipo)}</span>
                <div className="min-w-0">
                  {!sel && <div className="text-[11px] font-semibold text-slate-500">{s.promotor}</div>}
                  <div>{s.texto}</div>
                  {s.ganhoKm > 0 && <div className="mt-0.5 text-[11px] font-semibold text-emerald-600">ganho estimado {fmtKm(s.ganhoKm)}</div>}
                </div>
              </li>
            ))}
            {!sugList.length && <li className="text-sm text-slate-500">Nenhuma sugestão — roteiro já compacto.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
