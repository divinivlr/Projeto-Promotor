// Extração das planilhas -> Base (compacta, serializável).
// Roda no Web Worker (upload) e no script Node (dados embutidos) — mesmo código, mesmos números.
import * as XLSX from 'xlsx';
import type { Base, CadRec, CadStats, RawVisit, SourceInfo, VendaAgg } from './types';
import { canon, classifyDoc, clean, clientKey, parseDay, toNumber, type DayKey } from './utils';

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

const DAY_COLS: [string, DayKey][] = [
  ['segunda', 'SEG'], ['segunda_feira', 'SEG'], ['terca', 'TER'], ['terca_feira', 'TER'], ['quarta', 'QUA'], ['quarta_feira', 'QUA'],
  ['quinta', 'QUI'], ['quinta_feira', 'QUI'], ['sexta', 'SEX'], ['sexta_feira', 'SEX'], ['sabado', 'SAB'],
];

/** Relatório de Roteiros — aceita os dois layouts:
 *  (a) uma linha por visita com a coluna "Data Visita" (Segunda-Feira, Terça-Feira…)
 *  (b) uma linha por cliente com colunas Segunda…Sábado marcadas com "X" (layout 2026) */
function extractRoteiro(rows: Row[]): { visits: RawVisit[]; isNova: boolean } | null {
  let h = findHeader(rows, ['colaborador', 'data_visita']);
  const wide = !h;
  if (!h) h = findHeader(rows, ['colaborador', 'segunda']);
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
  const dayCols = wide ? DAY_COLS.map(([n, d]) => [H.indexOf(n), d] as [number, DayKey]).filter(([i]) => i >= 0) : [];
  const get = (r: Row, i: number) => (i >= 0 ? r[i] : '');
  const visits: RawVisit[] = [];
  let rotaLike = 0, named = 0;
  for (let i = h.idx + 1; i < rows.length; i++) {
    const r = rows[i];
    const prom = clean(get(r, c.prom));
    if (!prom) continue;
    const cliRaw = clean(get(r, c.cli));
    const base = {
      promotor: prom,
      promotorCod: clientKey(get(r, c.cod)),
      supervisor: clean(get(r, c.sup)),
      razao: clean(get(r, c.razao)),
      fantasia: clean(get(r, c.fant)),
      ramo: clean(get(r, c.ramo)),
      cidade: clean(get(r, c.cid)),
      uf: clean(get(r, c.uf)),
      roteiroPadrao: clean(get(r, c.rot)),
      status: clean(get(r, c.status)),
      ordem: i - h.idx,
    };
    if (wide) {
      const marked = dayCols.filter(([ci]) => clean(r[ci]) !== '').map(([, d]) => d);
      const cliente = /SEM ROTEIRO/i.test(cliRaw) ? '' : clientKey(get(r, c.cli));
      if (!cliente || !marked.length) {
        // promotor sem clientes (SEM ROTEIRO) ou cliente sem dia marcado
        visits.push({ ...base, cliente, dia: null, diaRaw: cliente ? 'SEM DIA' : 'SEM ROTEIRO' });
      } else {
        for (const d of marked) visits.push({ ...base, cliente, dia: d, diaRaw: d });
      }
      if (cliente) { if (/^ROTA\s*\d+/i.test(prom)) rotaLike++; else named++; }
      continue;
    }
    const semRoteiro = /SEM ROTEIRO/i.test(cliRaw) || /SEM ROTEIRO/i.test(clean(get(r, c.dia)));
    visits.push({
      ...base,
      cliente: semRoteiro ? '' : clientKey(get(r, c.cli)),
      dia: semRoteiro ? null : parseDay(get(r, c.dia)),
      diaRaw: clean(get(r, c.dia)),
    });
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
  // Cabeçalho reconhecido => usa SOMENTE os nomes (o layout do 302 muda entre meses; posição fixa traria colunas erradas).
  const pick = (names: string[], _pos: number) => col(H, ...names);
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
    end: pick(['endereco_comercial', 'endereco', 'endereco_cobranca'], 26),
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
      rcaNome: c.rca >= 0 ? clean(r[c.rca + 1]) : '',
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
    if (head.includes('colaborador') && (head.includes('data_visita') || head.includes('segunda'))) {
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

export const MESES_PADRAO = 11;
export const PERIODO_PADRAO = 'Jan–Nov/2026';

export function emptyBase(): Base {
  return {
    version: 2,
    meses: MESES_PADRAO,
    periodo: PERIODO_PADRAO,
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

export type MergeMode = 'substituir' | 'mesclar';

/** Mescla as peças extraídas sobre uma base existente (substitui apenas o que veio no upload).
 *  - substituir: o roteiro do arquivo passa a ser o roteiro inteiro
 *  - mesclar: só os promotores presentes no arquivo são substituídos; os demais são mantidos
 *  A proposta "Rota Nova" não faz mais parte do site: arquivos de rota nova são ignorados. */
export function mergePieces(prev: Base | null, list: Pieces[], origin: Base['origin'], mode: MergeMode = 'substituir', opts?: { meses?: number; periodo?: string }): Base {
  const b: Base = prev ? { ...prev, sources: { ...prev.sources } } : emptyBase();
  b.nova = [];
  delete b.sources.nova;
  for (const p of list) {
    if (p.roteiro) {
      if (mode === 'mesclar' && b.roteiro.length) {
        const novos = new Set(p.roteiro.map((v) => v.promotor));
        const mantidos = b.roteiro.filter((v) => !novos.has(v.promotor));
        const offset = mantidos.reduce((m, v) => Math.max(m, v.ordem), 0);
        b.roteiro = [...mantidos, ...p.roteiro.map((v) => ({ ...v, ordem: v.ordem + offset }))];
      } else {
        b.roteiro = p.roteiro;
      }
    }
    if (p.vendas) {
      b.vendas = p.vendas.agg; b.produtos = p.vendas.produtos; b.fornecedores = p.vendas.fornecedores; b.vendaStats = p.vendas.stats;
    }
    if (p.cadastro) { b.cadastro = p.cadastro.recs; b.cadStats = p.cadastro.stats; }
    const { nova: _ignorada, ...src } = p.sources;
    Object.assign(b.sources, src);
  }
  if (opts?.meses) b.meses = opts.meses;
  if (opts?.periodo) b.periodo = opts.periodo;
  b.meses = b.meses || MESES_PADRAO;
  b.periodo = b.periodo || PERIODO_PADRAO;
  b.version = 2;
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
