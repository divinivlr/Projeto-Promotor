'use client';
import { useMemo, useState } from 'react';
import { Coins, MapPinned, Percent, Target, UserPlus } from 'lucide-react';
import { useData } from '@/store/data';
import { Badge, Card, CURVA_COLOR, CurvaBadge, Kpi, KpiGrid } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import MapView from '@/components/map/MapView';
import { clientPopup } from '@/components/map/popup';
import ClientDrawer from '@/components/ClientDrawer';
import type { Client } from '@/lib/types';
import { DAY_SHORT, type DayKey, fmtBRL, fmtBRLc, fmtKm, fmtNum, fmtPct, haversine, uniq } from '@/lib/utils';

interface Row { c: Client; near: Client | null; dist: number | null; promotor: string; dia: DayKey | null }

export default function Potencial() {
  const { model, filters } = useData();
  const m = model!;
  const [minMedia, setMinMedia] = useState(1000);
  const [cidade, setCidade] = useState(filters.cidade ?? '');
  const [soPJ, setSoPJ] = useState(true);
  const [maxDist, setMaxDist] = useState(0);
  const [sel, setSel] = useState<Client | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  // Clientes da carteira georreferenciados (referência de proximidade)
  const refs = useMemo(() => m.carteira.filter((c) => c.hasCoord && !c.bloqueado), [m]);

  const all: Row[] = useMemo(() => m.all
    .filter((c) => !c.inRoteiro && c.total > 0 && !c.bloqueado && c.inCadastro)
    .map((c) => {
      let near: Client | null = null, dist: number | null = null;
      if (c.hasCoord) {
        for (const r of refs) {
          const d = haversine(c.lat!, c.lon!, r.lat!, r.lon!);
          if (dist === null || d < dist) { dist = d; near = r; }
        }
      }
      return { c, near, dist, promotor: near?.promotores[0] ?? '', dia: near?.dias[0] ?? null };
    }), [m, refs]);

  const rows = useMemo(() => all.filter((r) =>
    r.c.media >= minMedia && (!cidade || r.c.cidadeLabel === cidade) && (!soPJ || (r.c.docType === 'CNPJ' && r.c.docValid)) && (!maxDist || (r.dist != null && r.dist <= maxDist)),
  ), [all, minMedia, cidade, soPJ, maxDist]);

  const tot = rows.reduce((s, r) => s + r.c.media, 0);
  const cart = m.carteira.reduce((s, c) => s + c.media, 0);
  const cidades = useMemo(() => uniq(all.map((r) => r.c.cidadeLabel).filter(Boolean)).sort(), [all]);

  const points = useMemo(() => rows.filter((r) => r.c.hasCoord).map((r) => ({
    id: r.c.id, lat: r.c.lat!, lon: r.c.lon!, color: CURVA_COLOR[r.c.curvaBase ?? 'D'], label: r.c.curvaBase ?? '', title: r.c.nome,
    popup: clientPopup(r.c, { linhas: r.near ? [['Sugestão', `${r.promotor || '—'} (${fmtKm(r.dist)})`]] : [] }),
  })), [rows]);

  const cols: Column<Row>[] = [
    { key: 'id', header: 'Código', value: (r) => r.c.id },
    { key: 'nome', header: 'Cliente', value: (r) => r.c.nome, render: (r) => <div className="max-w-[260px]"><div className="truncate font-medium">{r.c.nome}</div><div className="truncate text-[11px] text-slate-500">{r.c.ramoFmt}</div></div> },
    { key: 'cidade', header: 'Cidade', value: (r) => r.c.cidadeLabel },
    { key: 'media', header: 'Média mensal', align: 'right', value: (r) => Math.round(r.c.media), render: (r) => <b>{fmtBRL(r.c.media)}</b> },
    { key: 'sku', header: 'SKUs', align: 'right', value: (r) => r.c.nSku },
    { key: 'curva', header: 'Curva (base)', align: 'center', value: (r) => r.c.curvaBase ?? '', render: (r) => <CurvaBadge c={r.c.curvaBase} /> },
    { key: 'rota', header: 'Rota Nova', value: (r) => r.c.rotaNova ?? '', render: (r) => (r.c.rotaNova ? <Badge tone="violet">{r.c.rotaNova}</Badge> : <span className="text-slate-400">—</span>) },
    { key: 'sug', header: 'Promotor sugerido', value: (r) => r.promotor, render: (r) => r.promotor ? <span className="text-[12px]"><UserPlus size={12} className="mr-1 inline text-brand-600" />{r.promotor.split(' ').slice(0, 2).join(' ')}{r.dia && <span className="text-slate-500"> · {DAY_SHORT[r.dia]}</span>}</span> : <span className="text-slate-400">sem coordenada</span> },
    { key: 'dist', header: 'Dist. carteira', align: 'right', value: (r) => (r.dist == null ? null : Math.round(r.dist * 10) / 10), render: (r) => fmtKm(r.dist) },
    { key: 'ref', header: 'Cliente de referência', value: (r) => r.near?.nome ?? '', className: 'text-[12px] max-w-[200px] truncate' },
  ];

  return (
    <div className="space-y-5">
      <KpiGrid cols="sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Clientes com potencial" value={fmtNum(rows.length)} hint="compram, ativos e sem visita" icon={Target} tone="accent" />
        <Kpi label="Média mensal em jogo" value={fmtBRLc(tot)} hint="faturamento sem cobertura de promotor" icon={Coins} />
        <Kpi label="Equivale à carteira atual" value={fmtPct(cart ? tot / cart : 0)} hint={`carteira roteirizada: ${fmtBRLc(cart)}/mês`} icon={Percent} tone="green" />
        <Kpi label="A até 5 km da carteira" value={fmtNum(rows.filter((r) => r.dist != null && r.dist <= 5).length)} hint="encaixe fácil em rotas existentes" icon={MapPinned} tone="violet" />
      </KpiGrid>

      <div className="glass flex flex-wrap items-end gap-4 p-4">
        <div className="w-56">
          <label className="label">Média mensal mínima: {fmtBRL(minMedia)}</label>
          <input type="range" min={0} max={20000} step={250} value={minMedia} onChange={(e) => setMinMedia(Number(e.target.value))} className="w-full accent-brand-600" />
        </div>
        <div className="w-56">
          <label className="label">Distância máx. da carteira: {maxDist ? `${maxDist} km` : 'sem limite'}</label>
          <input type="range" min={0} max={50} step={1} value={maxDist} onChange={(e) => setMaxDist(Number(e.target.value))} className="w-full accent-brand-600" />
        </div>
        <div className="min-w-[200px]">
          <label className="label">Cidade</label>
          <select className="input" value={cidade} onChange={(e) => setCidade(e.target.value)}>
            <option value="">Todas</option>
            {cidades.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-1.5 text-sm"><input type="checkbox" checked={soPJ} onChange={(e) => setSoPJ(e.target.checked)} className="accent-brand-600" /> Somente CNPJ válido</label>
      </div>

      <Card title="Mapa de oportunidades" sub="Cor = curva ABCD na base total de clientes com venda · clique para ver o promotor sugerido" bodyClass="p-2">
        <MapView points={points} cluster highlightId={hover} height={440} fitKey={`${minMedia}|${cidade}|${soPJ}|${maxDist}`} />
      </Card>

      <Card title="Clientes sem promotor, priorizados por faturamento" sub="Sugestão heurística: promotor do cliente roteirizado mais próximo (Haversine)">
        <DataTable rows={rows} columns={cols} rowKey={(r) => r.c.id} exportName="potencial_sem_promotor" onRowClick={(r) => setSel(r.c)} onRowHover={(r) => setHover(r?.c.id ?? null)} initialSort={{ key: 'media', dir: 'desc' }} />
      </Card>
      <ClientDrawer client={sel} onClose={() => setSel(null)} />
    </div>
  );
}
