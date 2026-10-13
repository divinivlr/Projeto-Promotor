// Base -> Model (todas as regras de negócio derivadas). Executa em milissegundos no navegador.
import type { Base, Client, CoordIssue, Curva, Issues, Model, Promotor, RawVisit, Visit } from './types';
import {
  DAYS, type DayKey, classifyDoc, clean, formatRamo, groupBy, haversine, median, norm, optimizeOrder,
  pathKm, titleCase, toNumber, uniq,
} from './utils';

export const MESES = 7; // Jan–Jul
export const CURVA_LIMITES = { A: 0.5, B: 0.8, C: 0.95 }; // participação acumulada

// Caixa aproximada de Pernambuco (inclui Fernando de Noronha fora — não atendido)
const PE_BOX = { latMin: -9.6, latMax: -7.1, lonMin: -41.5, lonMax: -34.75 };
const BR_BOX = { latMin: -34, latMax: 5.5, lonMin: -74.5, lonMax: -34.5 };
const inBox = (lat: number, lon: number, b: typeof PE_BOX) => lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax;

function parseCoord(latRaw: string, lonRaw: string, uf: string): { lat: number | null; lon: number | null; issue: CoordIssue } {
  const lat = toNumber(latRaw), lon = toNumber(lonRaw);
  if (lat == null || lon == null) return { lat: null, lon: null, issue: 'ausente' };
  if (lat === 0 || lon === 0) return { lat: null, lon: null, issue: 'zerada' };
  const box = uf === 'PE' || !uf ? PE_BOX : BR_BOX;
  if (inBox(lat, lon, box)) return { lat, lon, issue: null };
  if (inBox(lon, lat, box)) return { lat: lon, lon: lat, issue: 'invertida' }; // corrigida para plotagem
  return { lat: null, lon: null, issue: 'fora_area' };
}

/** Curva ABCD por participação acumulada no faturamento */
export function classifyCurva<T extends { id: string; total: number }>(items: T[], lim = CURVA_LIMITES) {
  const sorted = items.slice().sort((a, b) => b.total - a.total);
  const tot = sorted.reduce((s, c) => s + Math.max(0, c.total), 0) || 1;
  let acc = 0;
  const out = new Map<string, { curva: Curva; share: number; cumShare: number; rank: number }>();
  sorted.forEach((c, i) => {
    const share = Math.max(0, c.total) / tot;
    const before = acc;
    acc += share;
    let curva: Curva = 'D';
    if (c.total > 0) {
      if (before < lim.A) curva = 'A';
      else if (before < lim.B) curva = 'B';
      else if (before < lim.C) curva = 'C';
    }
    out.set(c.id, { curva, share, cumShare: acc, rank: i + 1 });
  });
  return out;
}

export function analyze(base: Base): Model {
  const clients = new Map<string, Client>();

  // doc -> ids (resolver roteiros que trazem CNPJ em vez de código)
  const docIndex = new Map<string, string[]>();
  for (const c of Object.values(base.cadastro)) {
    const d = classifyDoc(c.doc).digits;
    if (!d) continue;
    const arr = docIndex.get(d);
    if (arr) arr.push(c.id); else docIndex.set(d, [c.id]);
  }
  const resolve = (key: string) => {
    if (!key) return key;
    if (base.cadastro[key] || base.vendas[key]) return key;
    if (key.length >= 11) {
      const ids = docIndex.get(key.padStart(key.length > 11 ? 14 : 11, '0'));
      if (ids?.length) return ids[0];
    }
    return key;
  };
  const roteiro: RawVisit[] = base.roteiro.map((v) => ({ ...v, cliente: resolve(v.cliente) }));
  const novaRows: RawVisit[] = base.nova.filter((v) => /^ROTA\s*\d+/i.test(v.promotor)).map((v) => ({ ...v, cliente: resolve(v.cliente) }));

  const ensure = (id: string, fallback?: RawVisit): Client => {
    let c = clients.get(id);
    if (c) return c;
    const cad = base.cadastro[id];
    const ven = base.vendas[id];
    const docSrc = cad?.doc || '';
    const d = classifyDoc(docSrc);
    const uf = cad?.uf || fallback?.uf || '';
    const coord = cad ? parseCoord(cad.latRaw, cad.lonRaw, uf) : { lat: null, lon: null, issue: 'ausente' as CoordIssue };
    const cidadeRaw = cad?.cidade || fallback?.cidade || '';
    const ramo = cad?.ramo || fallback?.ramo || '';
    const total = ven?.total ?? 0;
    c = {
      id,
      inCadastro: !!cad,
      doc: d.digits,
      docType: d.type,
      docValid: d.valid,
      nome: clean(cad?.nome || fallback?.razao || ven?.nome || `Cliente ${id}`),
      fantasia: clean(cad?.fantasia || fallback?.fantasia || ''),
      rede: cad?.rede || '',
      ramo,
      ramoFmt: formatRamo(ramo),
      endereco: [cad?.endereco, cad?.numero].filter(Boolean).join(', '),
      bairro: cad?.bairro || '',
      cidade: norm(cidadeRaw),
      cidadeLabel: titleCase(norm(cidadeRaw)),
      uf,
      cep: cad?.cep || '',
      lat: coord.lat,
      lon: coord.lon,
      hasCoord: coord.lat != null,
      coordIssue: coord.issue,
      distCidadeKm: null,
      bloqueado: !!cad?.bloqueado,
      obsBloqueio: cad?.bloqueado ? cad.obs : '',
      rcaNome: cad?.rcaNome || '',
      total,
      media: total / MESES,
      nSku: ven?.nSku ?? 0,
      nForn: ven?.nForn ?? 0,
      top: ven?.top ?? [],
      forn: ven?.forn ?? [],
      skus: ven?.skus ?? [],
      inRoteiro: false,
      visitas: [],
      promotores: [],
      supervisores: [],
      dias: [],
      cidadeRoteiro: '',
      rotaNova: null,
      diasNova: [],
      curva: 'D',
      share: 0,
      cumShare: 0,
      rank: 0,
      curvaBase: null,
    };
    clients.set(id, c);
    return c;
  };

  // Roteiro atual
  for (const v of roteiro) {
    if (!v.cliente || !v.dia) continue;
    const c = ensure(v.cliente, v);
    c.inRoteiro = true;
    c.cidadeRoteiro = c.cidadeRoteiro || norm(v.cidade);
    const visit: Visit = { promotor: v.promotor, supervisor: v.supervisor, dia: v.dia, roteiro: v.roteiroPadrao, ordem: v.ordem };
    c.visitas.push(visit);
  }
  // Rota nova
  for (const v of novaRows) {
    if (!v.cliente) continue;
    const c = ensure(v.cliente, v);
    c.rotaNova = c.rotaNova || normalizeRota(v.promotor);
    if (v.dia && !c.diasNova.includes(v.dia)) c.diasNova.push(v.dia);
  }
  // Vendas (universo de potenciais)
  for (const id of Object.keys(base.vendas)) ensure(id);

  for (const c of clients.values()) {
    c.promotores = uniq(c.visitas.map((v) => v.promotor));
    c.supervisores = uniq(c.visitas.map((v) => v.supervisor).filter(Boolean));
    c.dias = DAYS.filter((d) => c.visitas.some((v) => v.dia === d));
    c.diasNova = DAYS.filter((d) => c.diasNova.includes(d));
  }

  const all = Array.from(clients.values());

  // Distância ao "centro" da cidade (mediana das coordenadas dos clientes da cidade) -> divergência de endereço
  const byCity = groupBy(all.filter((c) => c.hasCoord && c.cidade), (c) => c.cidade);
  const cityCenter = new Map<string, { lat: number; lon: number; n: number }>();
  byCity.forEach((arr, city) => {
    cityCenter.set(city, { lat: median(arr.map((c) => c.lat!)), lon: median(arr.map((c) => c.lon!)), n: arr.length });
  });
  for (const c of all) {
    if (!c.hasCoord) continue;
    const cc = cityCenter.get(c.cidade);
    if (!cc || cc.n < 3) continue;
    c.distCidadeKm = haversine(c.lat!, c.lon!, cc.lat, cc.lon);
    if (c.distCidadeKm > 35 && !c.coordIssue) c.coordIssue = 'distante_cidade';
  }

  const carteira = all.filter((c) => c.inRoteiro);
  const nova = all.filter((c) => c.rotaNova);

  // Curva ABCD — carteira roteirizada
  const cv = classifyCurva(carteira);
  for (const c of carteira) Object.assign(c, cv.get(c.id));
  // Curva entre todos os clientes com venda (base)
  const cvb = classifyCurva(all.filter((c) => c.total > 0));
  for (const c of all) c.curvaBase = cvb.get(c.id)?.curva ?? null;
  // Clientes fora da carteira recebem a curva da base para exibição
  for (const c of all) if (!c.inRoteiro) { const x = cvb.get(c.id); if (x) { c.curva = x.curva; c.rank = x.rank; c.share = x.share; c.cumShare = x.cumShare; } }

  // Promotores
  const promotores: Promotor[] = [];
  const byProm = groupBy(roteiro.filter((v) => v.promotor), (v) => v.promotor);
  byProm.forEach((rows, nome) => {
    const valid = rows.filter((r) => r.cliente && r.dia);
    const porDia = Object.fromEntries(DAYS.map((d) => [d, [] as string[]])) as Record<DayKey, string[]>;
    for (const r of valid.slice().sort((a, b) => a.ordem - b.ordem)) {
      if (!porDia[r.dia!].includes(r.cliente)) porDia[r.dia!].push(r.cliente);
    }
    const ids = uniq(valid.map((r) => r.cliente));
    const cl = ids.map((id) => clients.get(id)!).filter(Boolean);
    const skus = new Set<string>(); const forn = new Set<string>();
    cl.forEach((c) => { c.skus.forEach((s) => skus.add(s)); c.forn.forEach(([f]) => forn.add(f)); });
    let km = 0, kmOpt = 0;
    for (const d of DAYS) {
      const pts = porDia[d].map((id) => clients.get(id)!).filter((c) => c?.hasCoord).map((c) => ({ lat: c.lat!, lon: c.lon! }));
      km += pathKm(pts);
      kmOpt += pathKm(optimizeOrder(pts));
    }
    const total = cl.reduce((s, c) => s + c.total, 0);
    promotores.push({
      nome,
      cod: rows.find((r) => r.promotorCod)?.promotorCod || '',
      supervisor: rows.find((r) => r.supervisor)?.supervisor || '',
      semRoteiro: valid.length === 0,
      clientes: ids,
      visitasSemana: DAYS.reduce((s, d) => s + porDia[d].length, 0),
      porDia,
      total,
      media: total / MESES,
      skus: skus.size,
      forn: forn.size,
      cidades: uniq(cl.map((c) => c.cidadeLabel).filter(Boolean)).sort(),
      roteiros: uniq(valid.map((r) => r.roteiroPadrao).filter(Boolean)),
      kmSemana: km,
      kmOtimizado: kmOpt,
    });
  });
  promotores.sort((a, b) => b.total - a.total);

  // Ineficiências
  const issues: Issues = {
    duplicidades: [], mesmoDiaMultiPromotor: [], conflitos: [], bloqueados: [], semCadastro: [], semCoordenadas: [],
    roteiroSemVenda: [], vendaSemRoteiro: [], docInvalido: [], cpf: [], divergenciaCidade: [], semRoteiroPromotores: [],
    novaSemCadastro: [], cnpjDuplicado: [],
  };
  const dupMap = new Map<string, number>();
  for (const v of roteiro) {
    if (!v.cliente || !v.dia) continue;
    const k = `${v.cliente}|${v.promotor}|${v.dia}`;
    dupMap.set(k, (dupMap.get(k) || 0) + 1);
  }
  dupMap.forEach((n, k) => {
    if (n > 1) { const [cliente, promotor, dia] = k.split('|'); issues.duplicidades.push({ cliente, promotor, dia: dia as DayKey, vezes: n }); }
  });
  for (const c of carteira) {
    if (c.promotores.length > 1) issues.conflitos.push({ cliente: c.id, promotores: c.promotores, dias: c.dias });
    for (const d of c.dias) {
      const ps = uniq(c.visitas.filter((v) => v.dia === d).map((v) => v.promotor));
      if (ps.length > 1) issues.mesmoDiaMultiPromotor.push({ cliente: c.id, dia: d, promotores: ps });
    }
    if (c.bloqueado) issues.bloqueados.push(c.id);
    if (!c.inCadastro) issues.semCadastro.push(c.id);
    if (!c.hasCoord) issues.semCoordenadas.push(c.id);
    if (c.total <= 0) issues.roteiroSemVenda.push(c.id);
    if (c.inCadastro && !c.docValid) issues.docInvalido.push(c.id);
    if (c.docType === 'CPF') issues.cpf.push(c.id);
    if (c.inCadastro && c.cidadeRoteiro && c.cidade && c.cidadeRoteiro !== c.cidade) issues.divergenciaCidade.push(c.id);
  }
  for (const c of nova) if (!c.inCadastro) issues.novaSemCadastro.push(c.id);
  issues.vendaSemRoteiro = all.filter((c) => !c.inRoteiro && c.total > 0).sort((a, b) => b.total - a.total).map((c) => c.id);
  issues.semRoteiroPromotores = promotores.filter((p) => p.semRoteiro).map((p) => p.nome);
  const docGroups = groupBy(all.filter((c) => c.doc && c.docValid), (c) => c.doc);
  docGroups.forEach((arr, doc) => { if (arr.length > 1) issues.cnpjDuplicado.push({ doc, ids: arr.map((c) => c.id) }); });

  const rotasNova = uniq(nova.map((c) => c.rotaNova!)).sort();
  const supervisores = uniq(promotores.map((p) => p.supervisor).filter(Boolean)).sort();
  const cidades = uniq(all.filter((c) => c.inRoteiro || c.rotaNova).map((c) => c.cidadeLabel).filter(Boolean)).sort();
  const totalVendaBase = base.vendaStats.total || all.reduce((s, c) => s + c.total, 0);

  return { base, clients, all, carteira, nova, promotores, supervisores, rotasNova, cidades, totalVendaBase, issues };
}

export function normalizeRota(s: string): string {
  const m = /ROTA\s*(\d+)/i.exec(s);
  return m ? `ROTA ${m[1].padStart(2, '0')}` : s;
}
