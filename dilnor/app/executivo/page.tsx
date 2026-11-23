'use client';
import { useMemo } from 'react';
import { Award, Building2, Coins, Gauge, Navigation, Percent, Route, Users } from 'lucide-react';
import { useData } from '@/store/data';
import { Badge, Bar, Card, Kpi, KpiGrid } from '@/components/ui';
import { BarChart, useChartTheme } from '@/components/charts';
import { DataTable, type Column } from '@/components/ui/DataTable';
import type { Promotor } from '@/lib/types';
import { fmtBRL, fmtBRLc, fmtKm, fmtNum, fmtPct, NUM1, uniq } from '@/lib/utils';

interface Rank extends Promotor { pos: number; fatVisita: number; fatKm: number; score: number; a: number }

export default function Executivo() {
  const { model, filters } = useData();
  const t = useChartTheme();
  const m = model!;

  const proms = useMemo(() => m.promotores.filter((p) => !p.semRoteiro && (!filters.supervisor || p.supervisor === filters.supervisor)), [m, filters.supervisor]);

  const ranking: Rank[] = useMemo(() => {
    const base = proms.map((p) => {
      const fatVisita = p.visitasSemana ? p.media / (p.visitasSemana * 4.33) : 0;
      const fatKm = p.kmOtimizado ? p.media / (p.kmOtimizado * 4.33) : 0;
      const a = p.clientes.filter((id) => m.clients.get(id)?.curva === 'A').length;
      return { ...p, fatVisita, fatKm, a, pos: 0, score: 0 };
    });
    const max = (k: keyof Rank) => Math.max(1e-9, ...base.map((b) => Number(b[k])));
    const mm = max('media'), mv = max('fatVisita'), mk = max('fatKm'), ms = max('skus');
    base.forEach((b) => { b.score = 100 * (0.4 * (b.media / mm) + 0.25 * (b.fatVisita / mv) + 0.2 * (b.fatKm / mk) + 0.15 * (b.skus / ms)); });
    return base.sort((a, b) => b.score - a.score).map((b, i) => ({ ...b, pos: i + 1 }));
  }, [proms, m]);

  const k = useMemo(() => {
    const cart = m.carteira;
    const fatCart = cart.reduce((s, c) => s + c.total, 0);
    const comVenda = m.all.filter((c) => c.total > 0).length;
    const cobertos = cart.filter((c) => c.total > 0).length;
    const visitas = proms.reduce((s, p) => s + p.visitasSemana, 0);
    const km = proms.reduce((s, p) => s + p.kmSemana, 0);
    const kmOpt = proms.reduce((s, p) => s + p.kmOtimizado, 0);
    return { fatCart, comVenda, cobertos, visitas, km, kmOpt, cidades: uniq(cart.map((c) => c.cidadeLabel)).length };
  }, [m, proms]);

  // Resumo da operação (roteiro vigente)
  const comp = useMemo(() => [
    { l: 'Promotores com roteiro', v: fmtNum(proms.length) },
    { l: 'Promotores sem roteiro', v: fmtNum(m.issues.semRoteiroPromotores.length) },
    { l: 'Clientes roteirizados', v: fmtNum(m.carteira.length) },
    { l: 'Visitas por semana', v: fmtNum(k.visitas) },
    { l: 'Clientes por promotor', v: NUM1.format(m.carteira.length / Math.max(1, proms.length)) },
    { l: 'Visitas por cliente/semana', v: NUM1.format(k.visitas / Math.max(1, m.carteira.length)) },
    { l: `Faturamento coberto (${m.periodo})`, v: fmtBRLc(k.fatCart) },
    { l: '% da venda total', v: fmtPct(k.fatCart / m.totalVendaBase) },
    { l: 'Km/semana (sequência atual)', v: fmtKm(k.km) },
    { l: 'Km/semana (sequência otimizada)', v: fmtKm(k.kmOpt) },
    { l: 'Clientes com mais de um promotor', v: fmtNum(m.issues.conflitos.length) },
  ], [m, proms, k]);

  const cols: Column<Rank>[] = [
    { key: 'pos', header: '#', align: 'right', value: (r) => r.pos, render: (r) => r.pos <= 3 ? <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent-500 text-[11px] font-bold text-white">{r.pos}</span> : r.pos },
    { key: 'nome', header: 'Promotor', value: (r) => r.nome, render: (r) => <span className="font-medium">{r.nome}</span> },
    { key: 'cl', header: 'Clientes', align: 'right', value: (r) => r.clientes.length },
    { key: 'a', header: 'Curva A', align: 'right', value: (r) => r.a },
    { key: 'vis', header: 'Visitas/sem.', align: 'right', value: (r) => r.visitasSemana },
    { key: 'media', header: 'Média mensal', align: 'right', value: (r) => Math.round(r.media), render: (r) => fmtBRL(r.media) },
    { key: 'fv', header: 'R$/visita', align: 'right', value: (r) => Math.round(r.fatVisita), render: (r) => fmtBRL(r.fatVisita) },
    { key: 'fk', header: 'R$/km', align: 'right', value: (r) => Math.round(r.fatKm), render: (r) => fmtBRL(r.fatKm) },
    { key: 'sku', header: 'SKUs', align: 'right', value: (r) => r.skus },
    { key: 'cid', header: 'Cidades', align: 'right', value: (r) => r.cidades.length },
    { key: 'km', header: 'Km/sem.', align: 'right', value: (r) => Math.round(r.kmSemana), render: (r) => fmtKm(r.kmSemana) },
    { key: 'score', header: 'Score', align: 'right', value: (r) => Math.round(r.score), render: (r) => <div className="flex min-w-[90px] items-center gap-2"><Bar value={r.score} max={100} color={t.series[0]} /><b className="num">{Math.round(r.score)}</b></div> },
  ];

  const top = ranking.slice(0, 12);
  return (
    <div className="space-y-5">
      <KpiGrid cols="sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Cobertura comercial" value={fmtPct(k.fatCart / m.totalVendaBase)} hint={`${fmtBRLc(k.fatCart)} de ${fmtBRLc(m.totalVendaBase)} vendidos (YTD)`} icon={Percent} />
        <Kpi label="Clientes com venda cobertos" value={fmtPct(k.cobertos / Math.max(1, k.comVenda))} hint={`${fmtNum(k.cobertos)} de ${fmtNum(k.comVenda)} clientes`} icon={Users} tone="green" />
        <Kpi label="Média mensal da carteira" value={fmtBRLc(k.fatCart / m.meses)} hint={`${m.periodo} ÷ ${m.meses}`} icon={Coins} tone="accent" />
        <Kpi label="Cidades atendidas" value={fmtNum(k.cidades)} hint="pelo roteiro atual" icon={Building2} tone="slate" />
        <Kpi label="Promotores ativos" value={fmtNum(proms.length)} hint={`${m.issues.semRoteiroPromotores.length} sem roteiro`} icon={Award} tone="violet" />
        <Kpi label="Visitas por semana" value={fmtNum(k.visitas)} hint={`${NUM1.format(k.visitas / Math.max(1, proms.length) / 6)} por promotor/dia`} icon={Route} />
        <Kpi label="Km por semana" value={fmtKm(k.km)} hint={`otimizável para ${fmtKm(k.kmOpt)}`} icon={Navigation} tone="red" />
        <Kpi label="Eficiência média" value={fmtBRL(ranking.reduce((s, r) => s + r.fatVisita, 0) / Math.max(1, ranking.length))} hint="faturamento mensal por visita" icon={Gauge} tone="green" />
      </KpiGrid>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="Ranking de promotores · score composto" sub="40% média mensal · 25% R$/visita · 20% R$/km · 15% mix de SKUs" className="xl:col-span-2">
          <BarChart horizontal labels={top.map((r) => r.nome.split(' ').slice(0, 2).join(' '))} data={top.map((r) => Math.round(r.score))} fmt={(v) => String(Math.round(v))} height={380} color={t.series[0]} />
        </Card>
        <Card title="Resumo da operação" sub="Roteiro vigente">
          <table className="w-full text-sm">
            <tbody>
              {comp.map((r) => (
                <tr key={r.l}><td className="td text-[12px]">{r.l}</td><td className="td num text-right font-semibold">{r.v}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="Ranking detalhado" actions={<Badge tone="brand">{ranking.length} promotores</Badge>}>
        <DataTable rows={ranking} columns={cols} rowKey={(r) => r.nome} exportName="ranking_promotores" initialSort={{ key: 'pos', dir: 'asc' }} pageSize={25} />
      </Card>
    </div>
  );
}
