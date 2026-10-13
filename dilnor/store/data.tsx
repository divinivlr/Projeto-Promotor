'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { analyze } from '@/lib/analyze';
import { mergePieces, trimBase, type Pieces } from '@/lib/extract';
import { applyFilters, type Filters } from '@/lib/filters';
import { idbDel, idbGet, idbSet, lsGet, lsSet } from '@/lib/idb';
import type { Base, Client, Model } from '@/lib/types';

type Status = 'loading' | 'ready' | 'error';
type Theme = 'light' | 'dark';

interface UploadState { busy: boolean; message: string; progress: number; log: string[]; error?: string }

interface Ctx {
  status: Status;
  error?: string;
  model: Model | null;
  filters: Filters;
  setFilter: <K extends keyof Filters>(k: K, v: Filters[K] | undefined) => void;
  clearFilters: () => void;
  filtered: Client[]; // carteira filtrada pelos filtros globais
  theme: Theme;
  toggleTheme: () => void;
  upload: UploadState;
  uploadFiles: (files: File[]) => Promise<void>;
  restoreEmbedded: () => Promise<void>;
}

const DataCtx = createContext<Ctx | null>(null);
const UPLOAD_KEY = 'base-upload-v1';

export function DataProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string>();
  const [base, setBase] = useState<Base | null>(null);
  const [filters, setFilters] = useState<Filters>({});
  const [theme, setTheme] = useState<Theme>('light');
  const [upload, setUpload] = useState<UploadState>({ busy: false, message: '', progress: 0, log: [] });
  const workerRef = useRef<Worker | null>(null);

  // Tema
  useEffect(() => {
    const t = (document.documentElement.classList.contains('dark') ? 'dark' : 'light') as Theme;
    setTheme(t);
    setFilters(lsGet<Filters>('dilnor-filters', {}));
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const n: Theme = t === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', n === 'dark');
      lsSet('dilnor-theme', n);
      return n;
    });
  }, []);

  const loadEmbedded = useCallback(async () => {
    const res = await fetch('/data/base.json', { cache: 'force-cache' });
    if (!res.ok) throw new Error(`Falha ao carregar dados embutidos (${res.status})`);
    return (await res.json()) as Base;
  }, []);

  // Carga inicial: base enviada pelo usuário (IndexedDB) ou base oficial embutida
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = await idbGet<Base>(UPLOAD_KEY);
        const b = saved ?? (await loadEmbedded());
        if (alive) { setBase(b); setStatus('ready'); }
      } catch (e) {
        if (alive) { setError(e instanceof Error ? e.message : String(e)); setStatus('error'); }
      }
    })();
    return () => { alive = false; };
  }, [loadEmbedded]);

  const model = useMemo(() => (base ? analyze(base) : null), [base]);

  const setFilter = useCallback(<K extends keyof Filters>(k: K, v: Filters[K] | undefined) => {
    setFilters((f) => {
      const n = { ...f, [k]: v || undefined };
      if (k === 'supervisor') n.promotor = undefined; // filtro dependente
      lsSet('dilnor-filters', n);
      return n;
    });
  }, []);
  const clearFilters = useCallback(() => { setFilters({}); lsSet('dilnor-filters', {}); }, []);

  const filtered = useMemo(() => (model ? applyFilters(model.carteira, filters) : []), [model, filters]);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setUpload({ busy: true, message: 'Preparando arquivos…', progress: 0.05, log: [] });
    try {
      const payload = await Promise.all(files.map(async (f) => ({ name: f.name, buffer: await f.arrayBuffer() })));
      workerRef.current?.terminate();
      const w = new Worker(new URL('../workers/parse.worker.ts', import.meta.url));
      workerRef.current = w;
      const pieces = await new Promise<Pieces[]>((resolve, reject) => {
        w.onmessage = (e) => {
          const m = e.data;
          if (m.type === 'progress') setUpload((u) => ({ ...u, message: m.message, progress: Math.min(0.95, 0.1 + (m.step / m.total) * 0.85) }));
          else if (m.type === 'done') resolve(m.pieces as Pieces[]);
          else if (m.type === 'error') reject(new Error(m.message));
        };
        w.onerror = (ev) => reject(new Error(ev.message || 'Erro no processamento'));
        w.postMessage({ files: payload }, payload.map((p) => p.buffer));
      });
      w.terminate();
      const log = pieces.flatMap((p) => p.log);
      const found = pieces.some((p) => p.roteiro || p.nova || p.vendas || p.cadastro);
      if (!found) throw new Error('Nenhuma aba reconhecida. Envie as planilhas de Roteiro, Venda ou Cadastro 302.');
      const merged = trimBase(mergePieces(base, pieces, 'upload'));
      setBase(merged);
      await idbSet(UPLOAD_KEY, merged);
      setUpload({ busy: false, message: 'Base atualizada com sucesso.', progress: 1, log });
    } catch (e) {
      setUpload({ busy: false, message: '', progress: 0, log: [], error: e instanceof Error ? e.message : String(e) });
    }
  }, [base]);

  const restoreEmbedded = useCallback(async () => {
    await idbDel(UPLOAD_KEY);
    setStatus('loading');
    try { setBase(await loadEmbedded()); setStatus('ready'); setUpload({ busy: false, message: 'Base oficial restaurada.', progress: 1, log: [] }); }
    catch (e) { setError(String(e)); setStatus('error'); }
  }, [loadEmbedded]);

  const value: Ctx = { status, error, model, filters, setFilter, clearFilters, filtered, theme, toggleTheme, upload, uploadFiles, restoreEmbedded };
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData() {
  const c = useContext(DataCtx);
  if (!c) throw new Error('useData fora do DataProvider');
  return c;
}
