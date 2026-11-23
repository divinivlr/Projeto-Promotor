// Utilitários puros (sem DOM) — usados no navegador, no Web Worker e no script Node.

export const DAYS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'] as const;
export type DayKey = (typeof DAYS)[number];
export const DAY_LABEL: Record<DayKey, string> = {
  SEG: 'Segunda', TER: 'Terça', QUA: 'Quarta', QUI: 'Quinta', SEX: 'Sexta', SAB: 'Sábado',
};
export const DAY_SHORT: Record<DayKey, string> = {
  SEG: 'Seg', TER: 'Ter', QUA: 'Qua', QUI: 'Qui', SEX: 'Sex', SAB: 'Sáb',
};

/** Remove acentos */
export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Canoniza nome de coluna: " Valor YTD " -> "valor_ytd" */
export function canon(name: unknown): string {
  return stripAccents(String(name ?? ''))
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Texto limpo (trim + espaços colapsados) */
export function clean(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/_x000D_/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Normaliza para comparação (maiúsculo, sem acento, sem pontuação extra) */
export function norm(v: unknown): string {
  return stripAccents(clean(v)).toUpperCase().replace(/[.]/g, '').replace(/\s+/g, ' ').trim();
}

/** Chave única do cliente: string limpa sem ".0" e sem espaços */
export function clientKey(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = String(v).trim();
  if (!s) return '';
  if (/^-?\d+(\.0+)?$/.test(s)) s = s.replace(/\.0+$/, '');
  else if (/^\d+\.\d+$/.test(s)) s = String(Math.round(Number(s)));
  return s.replace(/\s+/g, '');
}

export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  // formato BR "1.234,56" -> 1234.56 ; "-8,05" -> -8.05
  if (/,/.test(s) && /\./.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/,/.test(s)) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Normaliza o dia da semana */
export function parseDay(v: unknown): DayKey | null {
  const s = norm(v);
  if (s.startsWith('SEG')) return 'SEG';
  if (s.startsWith('TER')) return 'TER';
  if (s.startsWith('QUA')) return 'QUA';
  if (s.startsWith('QUI')) return 'QUI';
  if (s.startsWith('SEX')) return 'SEX';
  if (s.startsWith('SAB')) return 'SAB';
  return null;
}

/** Remove "SUPERMERCADO" do ramo para exibir a faixa de check-outs */
export function formatRamo(ramo: string): string {
  const r = clean(ramo);
  if (!r) return '—';
  const out = r.replace(/SUPERMERCADO\s*/i, '').replace(/CHECK\s*OUTS?/i, 'CHECK-OUTS').trim();
  return out || r;
}

export function onlyDigits(s: unknown): string {
  return String(s ?? '').replace(/\D/g, '');
}

export function isValidCPF(cpf: string): boolean {
  const d = onlyDigits(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10) r = 0;
  if (r !== Number(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(d[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10) r = 0;
  return r === Number(d[10]);
}

export function isValidCNPJ(cnpj: string): boolean {
  const d = onlyDigits(cnpj);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(d[i]) * w[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export type DocType = 'CNPJ' | 'CPF' | 'INVALIDO' | 'VAZIO';
export function classifyDoc(doc: string): { type: DocType; valid: boolean; digits: string } {
  const digits = onlyDigits(doc);
  if (!digits) return { type: 'VAZIO', valid: false, digits };
  if (digits.length === 14) return { type: 'CNPJ', valid: isValidCNPJ(digits), digits };
  if (digits.length === 11) return { type: 'CPF', valid: isValidCPF(digits), digits };
  // CNPJ que perdeu zeros à esquerda (planilha numérica)
  if (digits.length > 11 && digits.length < 14) {
    const p = digits.padStart(14, '0');
    if (isValidCNPJ(p)) return { type: 'CNPJ', valid: true, digits: p };
  }
  return { type: 'INVALIDO', valid: false, digits };
}

export function formatDoc(digits: string): string {
  if (digits.length === 14) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return digits || '—';
}

/** Distância Haversine em km */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0088;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface LatLon { lat: number; lon: number }

export function centroid(pts: LatLon[]): LatLon | null {
  if (!pts.length) return null;
  let la = 0, lo = 0;
  for (const p of pts) { la += p.lat; lo += p.lon; }
  return { lat: la / pts.length, lon: lo / pts.length };
}

export function pathKm(pts: LatLon[]): number {
  let km = 0;
  for (let i = 1; i < pts.length; i++) km += haversine(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
  return km;
}

/** Ordenação heurística (vizinho mais próximo multi-início + 2-opt) para caminho aberto */
export function optimizeOrder<T extends LatLon>(pts: T[]): T[] {
  const n = pts.length;
  if (n <= 2) return pts.slice();
  const d = (a: T, b: T) => haversine(a.lat, a.lon, b.lat, b.lon);
  let best: T[] = pts.slice();
  let bestKm = Infinity;
  const starts = Math.min(n, 12);
  for (let s = 0; s < starts; s++) {
    const rest = pts.slice();
    const route = [rest.splice(s, 1)[0]];
    while (rest.length) {
      const last = route[route.length - 1];
      let bi = 0, bd = Infinity;
      for (let i = 0; i < rest.length; i++) {
        const dd = d(last, rest[i]);
        if (dd < bd) { bd = dd; bi = i; }
      }
      route.push(rest.splice(bi, 1)[0]);
    }
    // 2-opt
    let improved = true, guard = 0;
    while (improved && guard++ < 50) {
      improved = false;
      for (let i = 0; i < n - 2; i++) {
        for (let k = i + 1; k < n - 1; k++) {
          const a = route[i], b = route[i + 1], c = route[k], e = route[k + 1];
          if (d(a, c) + d(b, e) < d(a, b) + d(c, e) - 1e-9) {
            const seg = route.slice(i + 1, k + 1).reverse();
            route.splice(i + 1, seg.length, ...seg);
            improved = true;
          }
        }
      }
    }
    const km = pathKm(route);
    if (km < bestKm) { bestKm = km; best = route; }
  }
  return best;
}

export const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
export const BRL2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const NUM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
export const NUM1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
export const PCT = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

export function fmtBRL(v: number | null | undefined): string { return v == null ? '—' : BRL.format(v); }
export function fmtBRLc(v: number | null | undefined): string {
  if (v == null) return '—';
  const a = Math.abs(v);
  if (a >= 1e6) return 'R$ ' + NUM1.format(v / 1e6) + ' mi';
  if (a >= 1e3) return 'R$ ' + NUM1.format(v / 1e3) + ' mil';
  return BRL.format(v);
}
export function fmtNum(v: number | null | undefined): string { return v == null ? '—' : NUM.format(v); }
export function fmtKm(v: number | null | undefined): string { return v == null ? '—' : NUM1.format(v) + ' km'; }
export function fmtPct(v: number | null | undefined): string { return v == null || !Number.isFinite(v) ? '—' : PCT.format(v); }

export function titleCase(s: string): string {
  const small = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E']);
  return clean(s).toLowerCase().split(' ').map((w, i) => {
    const up = w.toUpperCase();
    if (i > 0 && small.has(up)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

/** Paleta de N cores distintas e legíveis (texto branco) — ângulo áureo + 3 níveis de luminosidade */
export function routePalette(n: number): string[] {
  const out: string[] = [];
  const L = [40, 50, 32];
  const S = [78, 70, 72];
  for (let i = 0; i < n; i++) {
    const h = Math.round((i * 137.508 + 210) % 360);
    out.push(hslToHex(h, S[i % 3], L[i % 3]));
  }
  return out;
}

export function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hx = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return '#' + hx(f(0)) + hx(f(8)) + hx(f(4));
}

export function uniq<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }

export function groupBy<T, K extends string | number>(arr: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const t of arr) {
    const k = key(t);
    const g = m.get(k);
    if (g) g.push(t); else m.set(k, [t]);
  }
  return m;
}

export function median(nums: number[]): number {
  if (!nums.length) return NaN;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
