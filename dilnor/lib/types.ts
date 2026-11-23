import type { DayKey, DocType } from './utils';

/** Linha de roteiro (operação atual ou rota nova) */
export interface RawVisit {
  promotor: string;      // nome do promotor (ou "ROTA 01" na proposta)
  promotorCod: string;
  supervisor: string;
  cliente: string;       // chave limpa do cliente ('' quando SEM ROTEIRO)
  razao: string;
  fantasia: string;
  ramo: string;
  cidade: string;
  uf: string;
  dia: DayKey | null;    // null => SEM ROTEIRO / dia inválido
  diaRaw: string;
  roteiroPadrao: string;
  status: string;
  ordem: number;         // ordem da linha na planilha (sequência de visita)
}

/** Registro do cadastro mestre (302) — somente campos necessários */
export interface CadRec {
  id: string;
  doc: string;
  tipoPessoa: string;
  rede: string;
  nome: string;
  fantasia: string;
  ramo: string;
  latRaw: string;
  lonRaw: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  bloqueado: boolean;
  obs: string;
  dataBloqueio: string;
  rca: string;
  rcaNome: string;
}

/** Venda agregada por cliente (aba Venda) */
export interface VendaAgg {
  id: string;
  nome: string;
  total: number;
  devolucao: number;           // soma das linhas negativas
  nSku: number;
  nForn: number;
  top: [string, number][];     // [codProduto, valor] top 15
  forn: [string, number][];    // [codFornecedor, valor] todos
  skus?: string[];             // lista completa (apenas clientes roteirizados) para mix por promotor
}

export interface SourceInfo { file: string; rows: number; loadedAt: string }

export interface CadStats {
  total: number;
  bloqueados: number;
  cpf: number;
  cnpj: number;
  invalidos: number;
  semCoord: number;
  coordZerada: number;
}

export interface Base {
  version: number;
  generatedAt: string;
  origin: 'embedded' | 'upload';
  sources: Partial<Record<'roteiro' | 'nova' | 'vendas' | 'cadastro', SourceInfo>>;
  roteiro: RawVisit[];
  nova: RawVisit[];
  vendas: Record<string, VendaAgg>;
  vendaStats: { rows: number; clientes: number; total: number; produtos: number; fornecedores: number; linhasNegativas: number };
  produtos: Record<string, string>;
  fornecedores: Record<string, string>;
  cadastro: Record<string, CadRec>;
  cadStats: CadStats;
}

export type CoordIssue = null | 'ausente' | 'zerada' | 'fora_area' | 'invertida' | 'distante_cidade';
export type Curva = 'A' | 'B' | 'C' | 'D';

export interface Visit { promotor: string; supervisor: string; dia: DayKey; roteiro: string; ordem: number }

export interface Client {
  id: string;
  inCadastro: boolean;
  doc: string;
  docType: DocType;
  docValid: boolean;
  nome: string;
  fantasia: string;
  rede: string;
  ramo: string;
  ramoFmt: string;
  endereco: string;
  bairro: string;
  cidade: string;     // normalizada (MAIÚSCULA sem acento)
  cidadeLabel: string;
  uf: string;
  cep: string;
  lat: number | null;
  lon: number | null;
  hasCoord: boolean;
  coordIssue: CoordIssue;
  distCidadeKm: number | null;
  bloqueado: boolean;
  obsBloqueio: string;
  rcaNome: string;
  // vendas
  total: number;
  media: number;
  nSku: number;
  nForn: number;
  top: [string, number][];
  forn: [string, number][];
  skus: string[];
  // roteiro atual
  inRoteiro: boolean;
  visitas: Visit[];
  promotores: string[];
  supervisores: string[];
  dias: DayKey[];
  cidadeRoteiro: string;
  // rota nova
  rotaNova: string | null;
  diasNova: DayKey[];
  // curva
  curva: Curva;
  share: number;
  cumShare: number;
  rank: number;
  curvaBase: Curva | null; // curva entre todos os clientes com venda
}

export interface Promotor {
  nome: string;
  cod: string;
  supervisor: string;
  semRoteiro: boolean;
  clientes: string[];
  visitasSemana: number;
  porDia: Record<DayKey, string[]>;
  total: number;
  media: number;
  skus: number;
  forn: number;
  cidades: string[];
  roteiros: string[];
  kmSemana: number;
  kmOtimizado: number;
}

export interface Model {
  base: Base;
  clients: Map<string, Client>;
  all: Client[];          // universo (roteiro ∪ nova ∪ vendas ∪ cadastro relevante)
  carteira: Client[];     // clientes no roteiro atual (512)
  nova: Client[];         // clientes na proposta (400)
  promotores: Promotor[];
  supervisores: string[];
  rotasNova: string[];
  cidades: string[];
  totalVendaBase: number;
  issues: Issues;
}

export interface DupRow { cliente: string; promotor: string; dia: DayKey; vezes: number }
export interface ConflictRow { cliente: string; promotores: string[]; dias: string[] }

export interface Issues {
  duplicidades: DupRow[];
  mesmoDiaMultiPromotor: { cliente: string; dia: DayKey; promotores: string[] }[];
  conflitos: ConflictRow[];
  bloqueados: string[];
  semCadastro: string[];
  semCoordenadas: string[];
  roteiroSemVenda: string[];
  vendaSemRoteiro: string[];
  docInvalido: string[];
  cpf: string[];
  divergenciaCidade: string[];
  semRoteiroPromotores: string[];
  novaSemCadastro: string[];
  cnpjDuplicado: { doc: string; ids: string[] }[];
}
