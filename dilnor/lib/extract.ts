// Extração das planilhas -> Base (compacta, serializável).
// Roda no Web Worker (upload) e no script Node (dados embutidos) — mesmo código, mesmos números.
import * as XLSX from 'xlsx';
import type { Base, CadRec, CadStats, RawVisit, SourceInfo, VendaAgg } from './types';
import { canon, classifyDoc, clean, clientKey, parseDay, toNumber } from './utils';

type Row = unknown[];

export interface Pieces {
  roteiro?: RawVisit[];
  nova?: RawVisit[];
  vendas?: { agg: Record<string, VendaAgg>; produtos: Record<string, string>; fornecedores: Record<string, string>; stats: Base['vendaStats'] };
  cadastro?: { recs: Record<string, CadRec>; stats: CadStats };
  sources: Base['sources'];
  log: string[];
}

function sheetRows(ws: XLSX.WorkSheet): Row[] {
  return XLSX.utils.sheet_to_json<Row>(ws, { header: 1, raw: true, defval: '', blankrows: false });
}

/** Cabeçalhos canonizados com sufixo para duplicados: codigo, codigo_2, estado, estado_2 ... */
function canonHeaders(row: Row): string[] {
  const seen = new Map<string, number>();
  return row.map((h) => {
    const c = canon(h) || 'col';
    const n = (seen.get(c) || 0) + 1;
    seen.set(c, n);
    return n === 1 ? c : `${c}_${n}`;
  });
}

function findHeader(rows: Row[], must: string[]): { idx: number; headers: string[] } | null {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const h = canonHeaders(rows[i]);
    if (must.every((m) => h.includes(m))) return { idx: i, headers: h };
  }
  return null;
}

function col(headers: string[], ...names: string[]): number {
  for (const n of names) {
    const i = headers.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
}

function excelDate(v: unknown): string {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return clean(v).slice(0, 10);
}

function extractRoteiro(rows: Row[]): { visits: RawVisit[]; isNova: boolean } | null {
  const h = findHeader(rows, ['colaborador', 'data_visita']);
  if (!h) return null;
  const H = h.headers;
  const c = {
    cod: col(H, 'cod', 'codigo'),
    prom: col(H, 'colaborador'),
    sup: col(H, 'supervisor'),
    cli: col(H, 'cpf_cnpj', 'cod_cliente', 'cliente', 'codigo_cliente'),
    razao: col(H, 'razao_social'),
    fant: col(H, 'fantasia'),
    ramo: col(H, 'ramo_atividade'),
    cid: col(H, 'cidade'),
    uf: col(H, 'estado', 'uf'),
    dia: col(H, 'data_visita'),
    status: col(H, 'status_roteiros', 'status'),
    rot: col(H, 'descricao_roteiro_padrao', 'roteiro'),
  };
  const get = (r: Row, i: number) => (i >= 0 ? r[i] : '');
  const visits: RawVisit[] = [];
  let rotaLike = 0, named = 0;
  for (let i = h.idx + 1; i < rows.length; i++) {
    const r = rows[i];
    const prom = clean(get(r, c.prom));
    if (!prom) continue;
    const cliRaw = clean(get(r, c.cli));
    const semRoteiro = /SEM ROTEIRO/i.test(cliRaw) || /SEM ROTEIRO/i.test(clean(get(r, c.dia)));
    const v: RawVisit = {
      promotor: prom,
      promotorCod: clientKey(get(r, c.cod)),
      supervisor: clean(get(r, c.sup)),
      cliente: semRoteiro ? '' : clientKey(get(r, c.cli)),
      razao: clean(get(r, c.razao)),
      fantasia: clean(get(r, c.fant)),
      ramo: clean(get(r, c.ramo)),
      cidade: clean(get(r, c.cid)),
      uf: clean(get(r, c.uf)),
      dia: semRoteiro ? null : parseDay(get(r, c.dia)),
      diaRaw: clean(get(r, c.dia)),
      roteiroPadrao: clean(get(r, c.rot)),
      status: clean(get(r, c.status)),
      ordem: i - h.idx,
    };
    visits.push(v);
    if (!semRoteiro) {
      if (/^ROTA\s*\d+/i.test(prom)) rotaLike++; else named++;
    }
  }
  return { visits, isNova: rotaLike > named };
}

function extractVendas(rows: Row[]): Pieces['vendas'] | null {
  const h = findHeader(rows, ['cod_cliente']);
  if (!h) return null;
  const H = h.headers;
  const iCli = col(H, 'cod_cliente');
  const iNome = col(H, 'nome_cliente');
  const iForn = col(H, 'cod_forn', 'cod_fornecedor');
  const iFornN = col(H, 'nome_fornecedor', 'fornecedor');
  const iProd = col(H, 'cod_produto');
  const iProdN = col(H, 'nome_produto', 'produto');
  let iVal = col(H, 'valor_ytd', 'valor', 'venda', 'valor_total');
  if (iVal < 0) iVal = H.findIndex((x) => x.startsWith('valor'));
  if (iVal < 0) return null;

  const produtos: Record<string, string> = {};
  const fornecedores: Record<string, string> = {};
  const acc = new Map<string, { nome: string; total: number; dev: number; prod: Map<string, number>; forn: Map<string, number> }>();
  let rowsN = 0, neg = 0, total = 0;
  for (let i = h.idx + 1; i < rows.length; i++) {
    const r = rows[i];
    const id = clientKey(r[iCli]);
    if (!id) continue;
    const val = toNumber(r[iVal]) ?? 0;
    rowsN++;
    total += val;
    if (val < 0) neg++;
    const p = iProd >= 0 ? clientKey(r[iProd]) : '';
    const f = iForn >= 0 ? clientKey(r[iForn]) : '';
    if (p && !produtos[p] && iProdN >= 0) produtos[p] = clean(r[iProdN]);
    if (f && !fornecedores[f] && iFornN >= 0) fornecedores[f] = clean(r[iFornN]);
    let a = acc.get(id);
    if (!a) {
      a = { nome: iNome >= 0 ? clean(r[iNome]) : '', total: 0, dev: 0, prod: new Map(), forn: new Map() };
      acc.set(id, a);
    }
    a.total += val;
    if (val < 0) a.dev += val;
    if (p) a.prod.set(p, (a.prod.get(p) || 0) + val);
    if (f) a.forn.set(f, (a.forn.get(f) || 0) + val);
  }
  const agg: Record<string, VendaAgg> = {};
  acc.forEach((a, id) => {
    const prods = Array.from(a.prod.entries()).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]);
    const forn = Array.from(a.forn.entries()).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]);
    agg[id] = {
      id,
      nome: a.nome,
      total: round2(a.total),
      devolucao: round2(a.dev),
      nSku: prods.length,
      nForn: forn.length,
      top: prods.slice(0, 15).map(([k, v]) => [k, round2(v)]),
      forn: forn.map(([k, v]) => [k, round2(v)]),
      skus: prods.map(([k]) => k),
    };
  });
  return {
    agg,
    produtos,
    fornecedores,
    stats: {
      rows: rowsN,
      clientes: acc.size,
      total: round2(total),
      produtos: Object.keys(produtos).length,
      fornecedores: Object.keys(fornecedores).length,
      linhasNegativas: neg,
    },
  };
}

function round2(v: number) { return Math.round(v * 100) / 100; }

/** Cadastro 302: cabeçalho canonizado com fallback posicional
 *  (Código, CNPJ/CPF, Rede, Razão/Fantasia, Ramo, Longitude, Latitude, Endereço, Bairro, Cidade, Estado, Bloqueio, RCA) */
function extractCadastro(rows: Row[]): Pieces['cadastro'] | null {
  const h = findHeader(rows, ['codigo', 'cnpj_cpf']);
  if (!h) return null;
  const H = h.headers;
  const pick = (names: string[], pos: number) => {
    const i = col(H, ...names);
    return i >= 0 ? i : pos;
  };
  const c = {
    id: pick(['codigo'], 0),
    doc: pick(['cnpj_cpf'], 2),
    rede: pick(['rede_de_cliente'], 3),
    nome: pick(['cliente', 'razao_social', 'nome_do_cliente'], 5),
    fant: pick(['fantasia'], 6),
    tipo: pick(['tipo_de_pessoa'], 9),
    ramo: pick(['ramo_atividade'], 11),
    lon: pick(['longitude'], 21),
    uf: pick(['estado'], 24),
    end: pick(['endereco_comercial', 'endereco'], 26),
    lat: pick(['latitude'], 27),
    cid: pick(['nome_da_cidade', 'cidade'], 31),
    num: pick(['numero'], 34),
    cep: pick(['cep'], 35),
    bairro: pick(['bairro'], 36),
    obs: pick(['observacoes'], 39),
    bloq: pick(['bloqueio'], 40),
    dtBloq: pick(['data_de_bloqueio'], 42),
    rca: pick(['rca_1'], 53),
  };
  const recs: Record<string, CadRec> = {};
  const stats: CadStats = { total: 0, bloqueados: 0, cpf: 0, cnpj: 0, invalidos: 0, semCoord: 0, coordZerada: 0 };
  for (let i = h.idx + 1; i < rows.length; i++) {
    const r = rows[i];
    const id = clientKey(r[c.id]);
    if (!id || !/^\d+$/.test(id)) continue;
    const bloqRaw = clean(r[c.bloq]);
    const rec: CadRec = {
      id,
      doc: clean(r[c.doc]),
      tipoPessoa: clean(r[c.tipo]),
      rede: clean(r[c.rede]),
      nome: clean(r[c.nome]),
      fantasia: clean(r[c.fant]),
      ramo: clean(r[c.ramo]),
      latRaw: clean(r[c.lat]),
      lonRaw: clean(r[c.lon]),
      endereco: clean(r[c.end]),
      numero: clientKey(r[c.num]),
      bairro: clean(r[c.bairro]),
      cidade: clean(r[c.cid]),
      uf: clean(r[c.uf]),
      cep: clientKey(r[c.cep]),
      bloqueado: /^S/i.test(bloqRaw),
      obs: clean(r[c.obs]).slice(0, 120),
      dataBloqueio: excelDate(r[c.dtBloq]),
      rca: clientKey(r[c.rca]),
      rcaNome: clean(r[c.rca + 1]),
    };
    recs[id] = rec;
    stats.total++;
    if (rec.bloqueado) stats.bloqueados++;
    const d = classifyDoc(rec.doc);
    if (d.type === 'CPF') stats.cpf++;
    if (d.type === 'CNPJ') stats.cnpj++;
    if (!d.valid) stats.invalidos++;
    const la = toNumber(rec.latRaw), lo = toNumber(rec.lonRaw);
    if (la == null || lo == null) stats.semCoord++;
    else if (la === 0 || lo === 0) stats.coordZerada++;
  }
  return { recs, stats };
}

/** Lê um workbook e detecta automaticamente o conteúdo de cada aba */
export function extractWorkbook(wb: XLSX.WorkBook, fileName: string): Pieces {
  const out: Pieces = { sources: {}, log: [] };
  const now = new Date().toISOString();
  const src = (rows: number): SourceInfo => ({ file: fileName, rows, loadedAt: now });
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = sheetRows(ws);
    if (!rows.length) continue;
    const head = rows.slice(0, 15).map(canonHeaders).flat();
    if (head.includes('colaborador') && head.includes('data_visita')) {
      const r = extractRoteiro(rows);
      if (r) {
        if (r.isNova) { out.nova = r.visits; out.sources.nova = src(r.visits.length); }
        else { out.roteiro = r.visits; out.sources.roteiro = src(r.visits.length); }
        out.log.push(`Aba "${name}": ${r.isNova ? 'Rota Nova (proposta)' : 'Roteiro atual'} — ${r.visits.length} linhas`);
      }
    } else if (head.includes('cod_cliente') && head.some((x) => x.startsWith('valor'))) {
      const v = extractVendas(rows);
      if (v) { out.vendas = v; out.sources.vendas = src(v.stats.rows); out.log.push(`Aba "${name}": Vendas — ${v.stats.rows} linhas, ${v.stats.clientes} clientes`); }
    } else if (head.includes('codigo') && head.includes('cnpj_cpf')) {
      const c = extractCadastro(rows);
      if (c) { out.cadastro = c; out.sources.cadastro = src(c.stats.total); out.log.push(`Aba "${name}": Cadastro 302 — ${c.stats.total} clientes`); }
    } else {
      out.log.push(`Aba "${name}": ignorada (estrutura não reconhecida)`);
    }
  }
  return out;
}

export function emptyBase(): Base {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    origin: 'upload',
    sources: {},
    roteiro: [],
    nova: [],
    vendas: {},
    vendaStats: { rows: 0, clientes: 0, total: 0, produtos: 0, fornecedores: 0, linhasNegativas: 0 },
    produtos: {},
    fornecedores: {},
    cadastro: {},
    cadStats: { total: 0, bloqueados: 0, cpf: 0, cnpj: 0, invalidos: 0, semCoord: 0, coordZerada: 0 },
  };
}

/** Mescla as peças extraídas sobre uma base existente (substitui apenas o que veio no upload) */
export function mergePieces(prev: Base | null, list: Pieces[], origin: Base['origin']): Base {
  const b: Base = prev ? { ...prev, sources: { ...prev.sources } } : emptyBase();
  for (const p of list) {
    if (p.roteiro) b.roteiro = p.roteiro;
    if (p.nova) b.nova = p.nova;
    if (p.vendas) {
      b.vendas = p.vendas.agg; b.produtos = p.vendas.produtos; b.fornecedores = p.vendas.fornecedores; b.vendaStats = p.vendas.stats;
    }
    if (p.cadastro) { b.cadastro = p.cadastro.recs; b.cadStats = p.cadastro.stats; }
    Object.assign(b.sources, p.sources);
  }
  b.origin = origin;
  b.generatedAt = new Date().toISOString();
  return b;
}

/** Reduz a base ao necessário: cadastro dos clientes relevantes e lista de SKUs só para roteirizados */
export function trimBase(b: Base): Base {
  const relevant = new Set<string>();
  const routed = new Set<string>();
  for (const v of b.roteiro) if (v.cliente) { relevant.add(v.cliente); routed.add(v.cliente); }
  for (const v of b.nova) if (v.cliente) { relevant.add(v.cliente); routed.add(v.cliente); }
  for (const id of Object.keys(b.vendas)) relevant.add(id);
  const cadastro: Record<string, CadRec> = {};
  for (const id of relevant) if (b.cadastro[id]) cadastro[id] = b.cadastro[id];
  const vendas: Record<string, VendaAgg> = {};
  const usedProd = new Set<string>();
  for (const [id, v] of Object.entries(b.vendas)) {
    const keep = routed.has(id);
    vendas[id] = keep ? v : { ...v, skus: undefined };
    v.top.forEach(([p]) => usedProd.add(p));
    if (keep) v.skus?.forEach((p) => usedProd.add(p));
  }
  const produtos: Record<string, string> = {};
  for (const p of usedProd) if (b.produtos[p]) produtos[p] = b.produtos[p];
  return { ...b, cadastro, vendas, produtos };
}
