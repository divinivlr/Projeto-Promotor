'use client';
import { useMemo, useState } from 'react';
import { useData } from '@/store/data';
import { classifyCurva, CURVA_LIMITES } from '@/lib/analyze';
import { Card, CURVA_COLOR, CurvaBadge, DayDots, Segmented } from '@/components/ui';
import { BarChart, LineChart } from '@/components/charts';
import { DataTable, type Column } from '@/components/ui/DataTable';
import ClientDrawer from '@/components/ClientDrawer';
import type { Client, Curva } from '@/lib/types';
import { fmtBRL, fmtBRLc, fmtNum, fmtPct, NUM1 } from '@/lib/utils';

const CURVAS: Curva[] = ['A', 'B', 'C', 'D'];
type Scope = 'filtro' | 'carteira' | 'base';

export default function ABCD() {
  const { model, filtered } = useData();
  const m = model!;
  const [scope, setScope] = useState<Scope>('filtro');
  const [lim, setLim] = useState({ A: CURVA_LIMITES.A * 100, B: CURVA_LIMITES.B * 100, C: CURVA_LIMITES.C * 100 });
  const [sel, setSel] = useState<Client | null>(null);

  const src = scope === 'filtro' ? filtered : scope === 'carteira' ? m.carteira : m.all.filter((c) => c.total > 0);
  // Classificação dinâmica (recalculada sobre o universo e limites escolhidos)
  const cls = useMemo(() => classifyCurva(src, { A: lim.A / 100, B: lim.B / 100, C: lim.C / 100 }), [src, lim]);
  const rows = useMemo(() => src.map((c) => ({ c, ...cls.get(c.id)! })).sort((a, b) => a.rank - b.rank), [src, cls]);

  const matrix = useMemo(() => {
    const tot = rows.reduce((s, r) => s + Math.max(0, r.c.total), 0) || 1;
    return CURVAS.map((cv) => {
      const g = rows.filter((r) => r.curva === cv);
      const fat = g.reduce((s, r) => s + r.c.total, 0);
      const n = g.length || 1;
      return {
        cv, n: g.length, pctN: g.length / (rows.length || 1), fat, pctFat: fat / tot, media: fat / 7 / n,
        mix: g.reduce((s, r) => s + r.c.nSku, 0) / n, forn: g.reduce((s, r) => s + r.c.nForn, 0) / n,
        visitas: g.reduce((s, r) => s + r.c.dias.length, 0) / n,
        cobertos: g.filter((r) => r.c.inRoteiro).length / n,
        geo: g.filter((r) => r.c.hasCoord).length / n,
        freq: [0, 1, 2, 3].map((k) => g.filter((r) => (k === 3 ? r.c.dias.length >= 3 : r.c.dias.length === k)).length),
      };
    });
  }, [rows]);

  const pareto = useMemo(() => {
    const step = Math.max(1, Math.floor(rows.length / 120));
    const pts = rows.filter((_, i) => i % step === 0 || i === rows.length - 1);
    return { labels: pts.map((r) => `${Math.round((r.rank / rows.length) * 100)}%`), data: pts.map((r) => r.cumShare * 100) };
  }, [rows]);

  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'rank', header: '#', align: 'right', value: (r) => r.rank },
    { key: 'curva', header: 'Curva', align: 'center', value: (r) => r.curva, render: (r) => <CurvaBadge c={r.curva} /> },
    { key: 'id', header: 'Código', value: (r) => r.c.id },
    { key: 'nome', header: 'Cliente', value: (r) => r.c.nome, render: (r) => <span className="font-medium">{r.c.nome}</span> },
    { key: 'cidade', header: 'Cidade', value: (r) => r.c.cidadeLabel },
    { key: 'total', header: 'Venda YTD', align: 'right', value: (r) => Math.round(r.c.total), render: (r) => fmtBRL(r.c.total) },
    { key: 'media', header: 'Média mensal', align: 'right', value: (r) => Math.round(r.c.media), render: (r) => fmtBRL(r.c.media) },
    { key: 'share', header: '% part.', align: 'right', value: (r) => Math.round(r.share * 10000) / 100, render: (r) => fmtPct(r.share) },
    { key: 'cum', header: '% acum.', align: 'right', value: (r) => Math.round(r.cumShare * 10000) / 100, render: (r) => fmtPct(r.cumShare) },
    { key: 'sku', header: 'SKUs', align: 'right', value: (r) => r.c.nSku },
    { key: 'dias', header: 'Cobertura', value: (r) => r.c.dias.length, render: (r) => <DayDots days={r.c.dias} /> },
  ];

  return (
    <div className="space-y-5">
      <div className="glass flex flex-wrap items-end gap-4 p-4">
        <div>
          <label className="label">Universo da classificação</label>
          <Segmented value={scope} onChange={setScope} items={[{ id: 'filtro', label: 'Carteira filtrada' }, { id: 'carteira', label: 'Carteira total' }, { id: 'base', label: 'Todos com venda' }]} />
        </div>
        {(['A', 'B', 'C'] as const).map((k) => (
          <div key={k} className="w-28">
            <label className="label">Limite {k} (% acum.)</label>
            <input type="number" className="input" min={1} max={99} value={lim[k]} onChange={(e) => setLim((l) => ({ ...l, [k]: Math.max(1, Math.min(99, Number(e.target.value) || 0)) }))} />
          </div>
        ))}
        <p className="max-w-md text-xs text-slate-500">Clientes ordenados por faturamento acumulado (Jan–Jul). Entra na curva enquanto a participação acumulada <i>antes</i> do cliente estiver abaixo do limite. Sem venda = D.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {matrix.map((x) => (
          <div key={x.cv} className="glass overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 text-white" style={{ background: CURVA_COLOR[x.cv] }}>
              <span className="text-lg font-extrabold">Curva {x.cv}</span>
              <span className="text-xs font-semibold opacity-90">{fmtNum(x.n)} clientes · {fmtPct(x.pctN)}</span>
            </div>
            <dl className="grid grid-cols-2 gap-3 p-4 text-sm">
              <M l="Faturamento" v={fmtBRLc(x.fat)} s={`${fmtPct(x.pctFat)} do total`} />
              <M l="Média mensal/cliente" v={fmtBRLc(x.media)} />
              <M l="Mix médio SKUs" v={NUM1.format(x.mix)} />
              <M l="Fornecedores médios" v={NUM1.format(x.forn)} />
              <M l="Visitas/semana" v={NUM1.format(x.visitas)} s="média por cliente" />
              <M l="Cobertura" v={fmtPct(x.cobertos)} s={`georref. ${fmtPct(x.geo)}`} />
            </dl>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Curva de Pareto" sub="% acumulado do faturamento × % dos clientes">
          <LineChart labels={pareto.labels} data={pareto.data} fmt={(v) => `${Math.round(v)}%`} height={280}
            refLines={[{ value: lim.A, label: `Limite A (${lim.A}%)` }, { value: lim.B, label: `Limite B (${lim.B}%)` }, { value: lim.C, label: `Limite C (${lim.C}%)` }]} />
        </Card>
        <Card title="Matriz Curva × Frequência de visita" sub="Clientes por número de visitas semanais — A com baixa frequência é risco; D com alta frequência é custo">
          <BarChart labels={CURVAS.map((c) => `Curva ${c}`)} stacked height={280} fmt={(v) => fmtNum(v)}
            datasets={[
              { label: 'Sem visita', data: matrix.map((x) => x.freq[0]), color: '#9aa4b2' },
              { label: '1×/sem', data: matrix.map((x) => x.freq[1]), color: '#86b6ef' },
              { label: '2×/sem', data: matrix.map((x) => x.freq[2]), color: '#2a78d6' },
              { label: '3×+/sem', data: matrix.map((x) => x.freq[3]), color: '#104281' },
            ]} />
        </Card>
      </div>

      <Card title="Clientes classificados">
        <DataTable rows={rows} columns={cols} rowKey={(r) => r.c.id} exportName="curva_abcd" onRowClick={(r) => setSel(r.c)} initialSort={{ key: 'rank', dir: 'asc' }} />
      </Card>
      <ClientDrawer client={sel} onClose={() => setSel(null)} />
    </div>
  );
}

function M({ l, v, s }: { l: string; v: string; s?: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{l}</dt>
      <dd className="num font-bold text-slate-900 dark:text-white">{v}</dd>
      {s && <dd className="text-[11px] text-slate-500">{s}</dd>}
    </div>
  );
}
