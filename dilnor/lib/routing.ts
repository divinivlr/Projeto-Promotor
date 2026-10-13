import type { Client, Model, Promotor } from './types';
import { DAYS, DAY_LABEL, NUM1, type DayKey, centroid, haversine, optimizeOrder, pathKm, type LatLon } from './utils';

export interface DayAnalysis {
  dia: DayKey;
  clientes: Client[];
  centro: LatLon | null;
  dispersao: number; // km médio até o centroide
  kmAtual: number;
  kmOtimizado: number;
  ordemOtimizada: Client[];
}

export interface Sugestao {
  tipo: 'mover' | 'reordenar' | 'capacidade' | 'conflito';
  promotor: string;
  dia: DayKey;
  texto: string;
  ganhoKm: number;
  cliente?: string;
  paraDia?: DayKey;
}

export function analyzePromotor(m: Model, p: Promotor): { dias: DayAnalysis[]; sugestoes: Sugestao[] } {
  const dias: DayAnalysis[] = DAYS.map((d) => {
    const cl = p.porDia[d].map((id) => m.clients.get(id)!).filter(Boolean);
    const geo = cl.filter((c) => c.hasCoord);
    const pts = geo.map((c) => ({ lat: c.lat!, lon: c.lon!, c }));
    const centro = centroid(pts);
    const dispersao = centro && pts.length ? pts.reduce((s, x) => s + haversine(x.lat, x.lon, centro.lat, centro.lon), 0) / pts.length : 0;
    const opt = optimizeOrder(pts);
    return { dia: d, clientes: cl, centro, dispersao, kmAtual: pathKm(pts), kmOtimizado: pathKm(opt), ordemOtimizada: opt.map((x) => x.c) };
  });
  const sugestoes: Sugestao[] = [];
  for (const da of dias) {
    if (!da.centro) continue;
    // Reordenação
    const ganho = da.kmAtual - da.kmOtimizado;
    if (ganho > 2) {
      sugestoes.push({ tipo: 'reordenar', promotor: p.nome, dia: da.dia, ganhoKm: ganho, texto: `Reordenar a sequência de ${DAY_LABEL[da.dia]}: ${NUM1.format(da.kmAtual)} → ${NUM1.format(da.kmOtimizado)} km` });
    }
    // Clientes fora do centroide do dia
    for (const c of da.clientes) {
      if (!c.hasCoord) continue;
      const own = haversine(c.lat!, c.lon!, da.centro.lat, da.centro.lon);
      if (own < 8) continue;
      let best: DayAnalysis | null = null, bestD = Infinity;
      for (const o of dias) {
        if (o.dia === da.dia || !o.centro) continue;
        const d = haversine(c.lat!, c.lon!, o.centro.lat, o.centro.lon);
        if (d < bestD) { bestD = d; best = o; }
      }
      if (best && bestD < own * 0.5) {
        sugestoes.push({ tipo: 'mover', promotor: p.nome, dia: da.dia, paraDia: best.dia, cliente: c.id, ganhoKm: own - bestD,
          texto: `Mover ${c.fantasia || c.nome} de ${DAY_LABEL[da.dia]} para ${DAY_LABEL[best.dia]} (centroide a ${NUM1.format(bestD)} km em vez de ${NUM1.format(own)} km)` });
      }
    }
    if (da.clientes.length > 6) {
      sugestoes.push({ tipo: 'capacidade', promotor: p.nome, dia: da.dia, ganhoKm: 0, texto: `${DAY_LABEL[da.dia]} com ${da.clientes.length} visitas — acima do limite de 6 clientes/dia do construtor` });
    }
  }
  return { dias, sugestoes: sugestoes.sort((a, b) => b.ganhoKm - a.ganhoKm) };
}

/** Candidatos do construtor: raio máximo a partir do último cliente, ordenados por Faturamento/(1+Distância) */
export function candidatos(opts: {
  pool: Client[]; anterior: Client | null; raioKm: number; excluir: Set<string>; ancora?: LatLon | null;
}): { c: Client; dist: number | null; score: number }[] {
  const { pool, anterior, raioKm, excluir, ancora } = opts;
  const out: { c: Client; dist: number | null; score: number }[] = [];
  for (const c of pool) {
    if (excluir.has(c.id) || !c.hasCoord) continue;
    let dist: number | null = null;
    if (anterior?.hasCoord) {
      dist = haversine(anterior.lat!, anterior.lon!, c.lat!, c.lon!);
      if (dist > raioKm) continue;
    } else if (ancora) {
      dist = haversine(ancora.lat, ancora.lon, c.lat!, c.lon!);
    }
    out.push({ c, dist, score: c.media / (1 + (dist ?? 0)) });
  }
  return out.sort((a, b) => b.score - a.score);
}
