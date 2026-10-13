'use client';
import {
  ArcElement, BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip,
  type ChartOptions,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { useData } from '@/store/data';
import { DAYS, type DayKey } from '@/lib/utils';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Tooltip, Legend, Filler);

// Paleta categórica validada (ordem fixa; nunca reciclada por ranking)
export const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
export const DAY_COLORS: Record<DayKey, string> = Object.fromEntries(DAYS.map((d, i) => [d, SERIES_LIGHT[i]])) as Record<DayKey, string>;

export function useChartTheme() {
  const { theme } = useData();
  const dark = theme === 'dark';
  return {
    dark,
    series: dark ? SERIES_DARK : SERIES_LIGHT,
    text: dark ? '#cbd5e1' : '#475569',
    muted: dark ? '#94a3b8' : '#64748b',
    grid: dark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.07)',
    surface: dark ? '#111827' : '#ffffff',
  };
}

function baseOptions(t: ReturnType<typeof useChartTheme>, fmt?: (v: number) => string): ChartOptions<'bar'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 350 },
    interaction: { mode: 'nearest', intersect: false },
    plugins: {
      legend: { display: false, labels: { color: t.text, boxWidth: 10, boxHeight: 10, usePointStyle: true } },
      tooltip: {
        backgroundColor: t.dark ? '#0b1120' : '#0f172a', titleColor: '#fff', bodyColor: '#e2e8f0', padding: 10, cornerRadius: 8,
        callbacks: fmt ? { label: (ctx) => ` ${ctx.dataset.label ? ctx.dataset.label + ': ' : ''}${fmt(Number(ctx.parsed[(ctx.chart.options as any).indexAxis === 'y' ? 'x' : 'y']))}` } : undefined,
      },
    },
    scales: {
      x: { grid: { color: t.grid }, border: { display: false }, ticks: { color: t.muted, font: { size: 11 } } },
      y: { grid: { color: t.grid }, border: { display: false }, ticks: { color: t.muted, font: { size: 11 } } },
    },
  };
}

export function BarChart({ labels, data, color, horizontal, fmt, height = 280, datasets, stacked, onClick }: {
  labels: string[]; data?: number[]; color?: string | string[]; horizontal?: boolean; fmt?: (v: number) => string; height?: number;
  datasets?: { label: string; data: number[]; color?: string }[]; stacked?: boolean; onClick?: (index: number) => void;
}) {
  const t = useChartTheme();
  const opts = baseOptions(t, fmt);
  opts.indexAxis = horizontal ? 'y' : 'x';
  const valueAxis = horizontal ? 'x' : 'y';
  const catAxis = horizontal ? 'y' : 'x';
  (opts.scales as any)[valueAxis].ticks.callback = (v: number) => (fmt ? axisFmt(v, fmt) : v);
  (opts.scales as any)[valueAxis].ticks.maxRotation = 0;
  (opts.scales as any)[valueAxis].ticks.autoSkipPadding = 14;
  (opts.scales as any)[catAxis].grid = { display: false };
  if (horizontal) (opts.scales as any).y.ticks.autoSkip = false;
  if (stacked) { (opts.scales as any).x.stacked = true; (opts.scales as any).y.stacked = true; }
  if (datasets && datasets.length > 1) opts.plugins!.legend!.display = true;
  if (onClick) opts.onClick = (_e, els) => { if (els[0]) onClick(els[0].index); };
  const ds = (datasets ?? [{ label: '', data: data ?? [], color }]).map((d, i) => ({
    label: d.label,
    data: d.data,
    backgroundColor: (d as any).color ?? color ?? t.series[i % t.series.length],
    borderRadius: 4,
    borderSkipped: 'start' as const,
    maxBarThickness: 28,
    borderColor: t.surface,
    borderWidth: stacked ? { top: 0, right: horizontal ? 2 : 0, bottom: 0, left: 0 } : 0,
  }));
  return <div style={{ height }}><Bar data={{ labels, datasets: ds }} options={opts} /></div>;
}

/** Rótulos de eixo compactos: "R$ 1,5 mi" -> "1,5 mi" */
function axisFmt(v: number, fmt: (v: number) => string) {
  const s = fmt(v);
  return s.replace(/^R\$\s?/, '').replace(/,0 (mi|mil)$/, ' $1');
}

export function DoughnutChart({ labels, data, colors, fmt, height = 240 }: { labels: string[]; data: number[]; colors: string[]; fmt?: (v: number) => string; height?: number }) {
  const t = useChartTheme();
  return (
    <div style={{ height }}>
      <Doughnut
        data={{ labels, datasets: [{ data, backgroundColor: colors, borderColor: t.surface, borderWidth: 2, hoverOffset: 6 }] }}
        options={{
          responsive: true, maintainAspectRatio: false, cutout: '64%',
          plugins: {
            legend: { position: 'right', labels: { color: t.text, usePointStyle: true, boxWidth: 8, padding: 12 } },
            tooltip: { callbacks: fmt ? { label: (c) => ` ${c.label}: ${fmt(Number(c.parsed))}` } : undefined },
          },
        }}
      />
    </div>
  );
}

export function LineChart({ labels, data, color, fmt, height = 260, refLines }: { labels: string[]; data: number[]; color?: string; fmt?: (v: number) => string; height?: number; refLines?: { value: number; label: string }[] }) {
  const t = useChartTheme();
  const c = color ?? t.series[0];
  const datasets: any[] = [{ label: 'Acumulado', data, borderColor: c, backgroundColor: c + '22', fill: true, pointRadius: 0, borderWidth: 2, tension: 0.25 }];
  (refLines ?? []).forEach((r) => datasets.push({ label: r.label, data: labels.map(() => r.value), borderColor: t.muted, borderDash: [4, 4], borderWidth: 1, pointRadius: 0, fill: false }));
  const opts: any = baseOptions(t, fmt);
  opts.scales.y.ticks.callback = (v: number) => (fmt ? fmt(v) : v);
  opts.scales.x.grid = { display: false };
  opts.scales.x.ticks.maxTicksLimit = 10;
  opts.plugins.legend.display = !!refLines?.length;
  return <div style={{ height }}><Line data={{ labels, datasets }} options={opts} /></div>;
}
