'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { Building2, CalendarCheck, Coins, MapPinned, TrendingUp, Users } from 'lucide-react';
import { useData } from '@/store/data';
import { Card, CURVA_COLOR, Kpi, KpiGrid } from '@/components/ui';
import { BarChart, DoughnutChart, useChartTheme } from '@/components/charts';
import MapView from '@/components/map/MapView';
import { clientPopup } from '@/components/map/popup';
import { DAYS, DAY_SHORT, fmtBRL, fmtBRLc, fmtNum, fmtPct, NUM1, uniq } from '@/lib/utils';
import { MESES } from '@/lib/analyze';
import type { Curva } from '@/lib/types';

export default function VisaoGeral() {
  const { model, filtered } = useData();
  const t = useChartTheme();
  const m = model!;

  const k = useMemo(() => {
    const total = filtered.reduce((s, c) => s + c.total, 0);
    const proms = uniq(filtered.flatMap((c) => c.promotores));
    const cidades = uniq(filtered.map((c) => c.cidadeLabel).filter(Boolean));
    const geo = filtered.filter((c) => c.hasCoord).length;
    const visitas = filtered.reduce((s, c) => s + new Set(c.visitas.map((v) => `${v.promotor}|${v.dia}`)).size, 0);
    return { total, media: total / MESES, proms, cidades, geo, visitas };
  }, [filtered]);

  const byProm = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((c) => c.promotores.forEach((p) => map.set(p, (map.get(p) || 0) + c.media / c.promotores.length)));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15);
  }, [filtered]);
  const byDay = useMemo(() => DAYS.map((d) => filtered.filter((c) => c.dias.includes(d)).length), [filtered]);
  const curva = useMemo(() => (['A', 'B', 'C', 'D'] as Curva[]).map((cv) => filtered.filter((c) => c.curva === cv).reduce((s, c) => s + c.total, 0)), [filtered]);
  const byCity = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((c) => map.set(c.cidadeLabel || '—', (map.get(c.cidadeLabel || '—') || 0) + c.media));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [filtered]);

  const points = useMemo(() => filtered.filter((c) => c.hasCoord).map((c) => ({
    id: c.id, lat: c.lat!, lon: c.lon!, color: CURVA_COLOR[c.curva], label: c.curva, title: c.nome, popup: clientPopup(c),
  })), [filtered]);

  return (
    <div className="space-y-5">
      <KpiGrid>
        <Kpi label="Faturamento YTD (Jan–Jul)" value={fmtBRLc(k.total)} hint={`${fmtPct(k.total / m.totalVendaBase)} da venda total da base`} icon={Coins} />
        <Kpi label="Média mensal" value={fmtBRLc(k.media)} hint={`Acumulado ÷ ${MESES} meses`} icon={TrendingUp} tone="accent" />
        <Kpi label="Clientes na carteira" value={fmtNum(filtered.length)} hint={`${fmtNum(k.visitas)} visitas/semana`} icon={Users} tone="green" />
        <Kpi label="Clientes por promotor" value={k.proms.length ? NUM1.format(filtered.length / k.proms.length) : '—'} hint={`${k.proms.length} promotores com roteiro`} icon={CalendarCheck} tone="violet" />
        <Kpi label="Cobertura geográfica" value={fmtPct(filtered.length ? k.geo / filtered.length : 0)} hint={`${fmtNum(k.geo)} clientes georreferenciados`} icon={MapPinned} tone="slate" />
        <Kpi label="Total de cidades" value={fmtNum(k.cidades.length)} hint="cidades atendidas" icon={Building2} />
      </KpiGrid>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="Média mensal por promotor" sub="Top 15 · carteira rateada quando o cliente tem mais de um promotor" className="xl:col-span-2">
          <BarChart horizontal labels={byProm.map(([p]) => p.split(' ').slice(0, 2).join(' '))} data={byProm.map(([, v]) => v)} fmt={fmtBRLc} height={420} color={t.series[0]} />
        </Card>
        <Card title="Faturamento por curva ABCD" sub="Participação acumulada: A até 50% · B até 80% · C até 95% · D restante">
          <DoughnutChart labels={['Curva A', 'Curva B', 'Curva C', 'Curva D']} data={curva} colors={[CURVA_COLOR.A, CURVA_COLOR.B, CURVA_COLOR.C, CURVA_COLOR.D]} fmt={fmtBRL} height={220} />
          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            {(['A', 'B', 'C', 'D'] as Curva[]).map((cv) => (
              <div key={cv} className="rounded-lg bg-slate-900/[.03] p-2 dark:bg-white/5">
                <div className="text-[11px] font-semibold text-slate-500">Curva {cv}</div>
                <div className="num text-sm font-bold">{filtered.filter((c) => c.curva === cv).length}</div>
                <div className="text-[10px] text-slate-500">clientes</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="Mapa da carteira" sub="Pinos coloridos pela curva ABCD · clique para detalhes" className="xl:col-span-2" bodyClass="p-2">
          <MapView points={points} cluster height={420} fitKey={String(points.length)} />
        </Card>
        <div className="space-y-4">
          <Card title="Clientes visitados por dia">
            <BarChart labels={DAYS.map((d) => DAY_SHORT[d])} data={byDay} fmt={(v) => fmtNum(v)} height={160} color={t.series[0]} />
          </Card>
          <Card title="Top 10 cidades · média mensal">
            <BarChart horizontal labels={byCity.map(([c]) => c)} data={byCity.map(([, v]) => v)} fmt={fmtBRLc} height={260} color={t.series[2]} />
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Shortcut href="/ineficiencias" title="Ineficiências" text={`${m.issues.conflitos.length} clientes com mais de um promotor · ${m.issues.duplicidades.reduce((s, d) => s + d.vezes - 1, 0)} linhas duplicadas no roteiro`} />
        <Shortcut href="/potencial" title="Potencial sem promotor" text={`${fmtNum(m.issues.vendaSemRoteiro.length)} clientes compram mas não recebem visita`} />
        <Shortcut href="/rotas" title="Rota Nova (proposta)" text={`${m.rotasNova.length} rotas · ${m.nova.length} clientes no redesenho territorial`} />
      </div>
    </div>
  );
}

function Shortcut({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link href={href} className="glass group block p-4 transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="text-sm font-semibold text-slate-900 group-hover:text-brand-600 dark:text-white">{title} →</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{text}</div>
    </Link>
  );
}
