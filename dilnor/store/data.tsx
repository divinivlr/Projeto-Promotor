'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { analyze } from '@/lib/analyze';
import { mergePieces, trimBase, type MergeMode, type Pieces } from '@/lib/extract';
import { applyFilters, type Filters } from '@/lib/filters';
import { idbDel, idbGet, idbSet, lsGet, lsSet } from '@/lib/idb';
import { gunzipJSON, gzipJSON } from '@/lib/codec';
import type { Base, Client, Model } from '@/lib/types';

type Status = 'loading' | 'ready' | 'error';
type Theme = 'light' | 'dark';

export interface ParseState { busy: boolean; message: string; progress: number; error?: string }
export interface OnlineMeta { blob: boolean; admin: boolean; versions: { pathname: string; size: number; uploadedAt: string }[]; error?: string }

interface Ctx {
  status: Status;
  error?: string;
  model: Model | null;
  /** base compartilhada (online ou embutida) — referência para mesclar e comparar */
  shared: Base | null;
  filters: Filters;
  setFilter: <K extends keyof Filters>(k: K, v: Filters[K] | undefined) => void;
  clearFilters: () => void;
  filtered: Client[];
  theme: Theme;
  toggleTheme: () => void;
  parse: ParseState;
  parseFiles: (files: File[]) => Promise<Pieces[] | null>;
  buildBase: (pieces: Pieces[], mode: MergeMode, meses: number, periodo: string) => Base;
  applyLocal: (b: Base) => Promise<void>;
  discardLocal: () => Promise<void>;
  publish: (b: Base, password: string) => Promise<void>;
  restoreVersion: (pathname: string, password: string) => Promise<void>;
  fetchMeta: () => Promise<OnlineMeta | null>;
  reloadShared: () => Promise<void>;
}

const DataCtx = createContext<Ctx | null>(null);
const LOCAL_KEY = 'base-local-v2';

/** Base vigente para todos: 1) publicada online (Vercel Blob) · 2) embutida no deploy */
async function loadShared(): Promise<Base> {
  try {
    const r = await fetch('/api/base', { cache: 'no-store' });
    if (r.ok) {
      const b = await gunzipJSON<Base>(await r.arrayBuffer());
      return { ...b, origin: 'online', publishedAt: r.headers.get('X-Base-Uploaded-At') || b.generatedAt };
    }
  } catch { /* sem API (ex.: dev estático) — usa a embutida */ }
  const res = await fetch('/data/base.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Falha ao carregar dados (${res.status})`);
  const b = (await res.json()) as Base;
  return { ...b, origin: 'embedded' };
}

const stamp = (b: Base) => Date.parse(b.publishedAt || b.generatedAt) || 0;

export function DataProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string>();
  const [base, setBase] = useState<Base | null>(null);
  const [shared, setShared] = useState<Base | null>(null);
  const [filters, setFilters] = useState<Filters>({});
  const [theme, setTheme] = useState<Theme>('light');
  const [parse, setParse] = useState<ParseState>({ busy: false, message: '', progress: 0 });
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    setTheme((document.documentElement.classList.contains('dark') ? 'dark' : 'light') as Theme);
    const f = lsGet<Filters>('dilnor-filters', {});
    delete f.rota; // Rota Nova removida
    setFilters(f);
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const n: Theme = t === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', n === 'dark');
      lsSet('dilnor-theme', n);
      return n;
    });
  }, []);

  const reloadShared = useCallback(async () => {
    const s = await loadShared();
    setShared(s);
    const local = await idbGet<Base>(LOCAL_KEY);
    if (local && stamp(local) > stamp(s)) setBase(local); // versão local mais nova que a publicada
    else { if (local) await idbDel(LOCAL_KEY); setBase(s); }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        void idbDel('base-upload-v1'); // formato antigo (antes da base 2026)
        await reloadShared();
        if (alive) setStatus('ready');
      } catch (e) {
        if (alive) { setError(e instanceof Error ? e.message : String(e)); setStatus('error'); }
      }
    })();
    return () => { alive = false; };
  }, [reloadShared]);

  const model = useMemo(() => (base ? analyze(base) : null), [base]);

  const setFilter = useCallback(<K extends keyof Filters>(k: K, v: Filters[K] | undefined) => {
    setFilters((f) => {
      const n = { ...f, [k]: v || undefined };
      if (k === 'supervisor') n.promotor = undefined;
      lsSet('dilnor-filters', n);
      return n;
    });
  }, []);
  const clearFilters = useCallback(() => { setFilters({}); lsSet('dilnor-filters', {}); }, []);
  const filtered = useMemo(() => (model ? applyFilters(model.carteira, filters) : []), [model, filters]);

  /** Lê as planilhas num Web Worker (UI continua fluida) */
  const parseFiles = useCallback(async (files: File[]) => {
    if (!files.length) return null;
    setParse({ busy: true, message: 'Preparando arquivos…', progress: 0.05 });
    try {
      const payload = await Promise.all(files.map(async (f) => ({ name: f.name, buffer: await f.arrayBuffer() })));
      workerRef.current?.terminate();
      const w = new Worker(new URL('../workers/parse.worker.ts', import.meta.url));
      workerRef.current = w;
      const pieces = await new Promise<Pieces[]>((resolve, reject) => {
        w.onmessage = (e) => {
          const m = e.data;
          if (m.type === 'progress') setParse((u) => ({ ...u, message: m.message, progress: Math.min(0.95, 0.1 + (m.step / m.total) * 0.85) }));
          else if (m.type === 'done') resolve(m.pieces as Pieces[]);
          else if (m.type === 'error') reject(new Error(m.message));
        };
        w.onerror = (ev) => reject(new Error(ev.message || 'Erro no processamento'));
        w.postMessage({ files: payload }, payload.map((p) => p.buffer));
      });
      w.terminate();
      if (!pieces.some((p) => p.roteiro || p.vendas || p.cadastro)) {
        throw new Error('Nenhuma aba reconhecida. Envie a planilha com as abas Relatório de Roteiros, Venda e 302.');
      }
      setParse({ busy: false, message: 'Planilhas lidas.', progress: 1 });
      return pieces;
    } catch (e) {
      setParse({ busy: false, message: '', progress: 0, error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  }, []);

  const buildBase = useCallback((pieces: Pieces[], mode: MergeMode, meses: number, periodo: string) => {
    const ref = base ?? shared;
    return trimBase(mergePieces(ref, pieces, 'upload', mode, { meses, periodo }));
  }, [base, shared]);

  const applyLocal = useCallback(async (b: Base) => {
    const local = { ...b, origin: 'upload' as const, generatedAt: new Date().toISOString(), publishedAt: undefined };
    await idbSet(LOCAL_KEY, local);
    setBase(local);
  }, []);

  const discardLocal = useCallback(async () => {
    await idbDel(LOCAL_KEY);
    setBase(shared);
  }, [shared]);

  const post = async (url: string, password: string, body?: BodyInit) => {
    const r = await fetch(url, { method: 'POST', headers: { 'x-admin-key': password }, body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Falha na publicação (${r.status})`);
    return j;
  };

  const publish = useCallback(async (b: Base, password: string) => {
    const payload = { ...b, origin: 'online' as const, generatedAt: new Date().toISOString(), publishedAt: undefined };
    const gz = await gzipJSON(payload);
    await post('/api/base', password, new Blob([gz as BlobPart], { type: 'application/gzip' }));
    await idbDel(LOCAL_KEY);
    await reloadShared();
  }, [reloadShared]);

  const restoreVersion = useCallback(async (pathname: string, password: string) => {
    await post(`/api/base?restore=${encodeURIComponent(pathname)}`, password);
    await idbDel(LOCAL_KEY);
    await reloadShared();
  }, [reloadShared]);

  const fetchMeta = useCallback(async () => {
    try {
      const r = await fetch('/api/base?meta=1', { cache: 'no-store' });
      if (!r.ok) return null;
      return (await r.json()) as OnlineMeta;
    } catch { return null; }
  }, []);

  const value: Ctx = {
    status, error, model, shared, filters, setFilter, clearFilters, filtered, theme, toggleTheme,
    parse, parseFiles, buildBase, applyLocal, discardLocal, publish, restoreVersion, fetchMeta, reloadShared,
  };
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData() {
  const c = useContext(DataCtx);
  if (!c) throw new Error('useData fora do DataProvider');
  return c;
}
