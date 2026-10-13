'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Search } from 'lucide-react';
import { exportCSV, exportXLSX } from '@/lib/export';
import { stripAccents } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  /** valor bruto: ordenação, busca e exportação */
  value?: (row: T) => string | number | null | undefined;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  export?: boolean; // default true
  sortable?: boolean; // default true quando há value
  hidden?: boolean; // apenas exportação
}

export function DataTable<T>({
  rows, columns, rowKey, pageSize = 15, searchable = true, exportName, onRowClick, onRowHover, toolbar,
  initialSort, maxHeight, dense, emptyText = 'Nenhum registro encontrado.', highlightKey,
}: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; pageSize?: number; searchable?: boolean; exportName?: string;
  onRowClick?: (r: T) => void; onRowHover?: (r: T | null) => void; toolbar?: ReactNode;
  initialSort?: { key: string; dir: 'asc' | 'desc' }; maxHeight?: string; dense?: boolean; emptyText?: string; highlightKey?: string | null;
}) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(pageSize);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const terms = stripAccents(q.toLowerCase()).split(/\s+/).filter(Boolean);
    const vcols = columns.filter((c) => c.value);
    return rows.filter((r) => {
      const hay = stripAccents(vcols.map((c) => String(c.value!(r) ?? '')).join(' ').toLowerCase());
      return terms.every((t) => hay.includes(t));
    });
  }, [rows, q, columns]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.value) return filtered;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return filtered.slice().sort((a, b) => {
      const va = col.value!(a), vb = col.value!(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true }) * dir;
    });
  }, [filtered, sort, columns]);

  useEffect(() => { setPage(0); }, [q, rows, size]);
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const pg = Math.min(page, pages - 1);
  const view = sorted.slice(pg * size, pg * size + size);

  const shown = columns.filter((c) => !c.hidden);
  const exportCols = columns.filter((c) => c.value && c.export !== false).map((c) => ({ header: c.header, value: c.value! }));
  const toggleSort = (c: Column<T>) => {
    if (!c.value || c.sortable === false) return;
    setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'desc' }));
  };
  const pad = dense ? 'py-1.5' : '';

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {searchable && (
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-8" placeholder="Buscar na tabela…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        )}
        <div className="flex flex-1 flex-wrap items-center gap-2">{toolbar}</div>
        <span className="text-xs text-slate-500">{sorted.length.toLocaleString('pt-BR')} registro(s)</span>
        {exportName && (
          <>
            <button className="btn-outline px-2.5 py-1 text-xs" onClick={() => exportCSV(sorted, exportCols, exportName)} title="Exportar CSV"><Download size={14} /> CSV</button>
            <button className="btn-outline px-2.5 py-1 text-xs" onClick={() => exportXLSX([{ name: 'Dados', rows: sorted, cols: exportCols }], exportName)} title="Exportar Excel"><FileSpreadsheet size={14} /> Excel</button>
          </>
        )}
      </div>
      <div className="scroll-thin overflow-auto rounded-xl border border-[var(--border)] bg-white/40 dark:bg-slate-900/30" style={{ maxHeight }} onMouseLeave={() => onRowHover?.(null)}>
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              {shown.map((c) => (
                <th key={c.key} className={`th ${c.value && c.sortable !== false ? 'cursor-pointer select-none hover:text-slate-800 dark:hover:text-slate-200' : ''} ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''}`}
                  onClick={() => toggleSort(c)}>
                  <span className="inline-flex items-center gap-1">
                    {c.header}
                    {sort?.key === c.key && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r) => {
              const k = rowKey(r);
              return (
                <tr key={k}
                  className={`${onRowClick ? 'cursor-pointer' : ''} transition-colors hover:bg-brand-50/70 dark:hover:bg-brand-900/20 ${highlightKey === k ? 'bg-accent-500/10' : ''}`}
                  onClick={() => onRowClick?.(r)} onMouseEnter={() => onRowHover?.(r)}>
                  {shown.map((c) => (
                    <td key={c.key} className={`td ${pad} ${c.align === 'right' ? 'num text-right' : c.align === 'center' ? 'text-center' : ''} ${c.className ?? ''}`}>
                      {c.render ? c.render(r) : String(c.value?.(r) ?? '—')}
                    </td>
                  ))}
                </tr>
              );
            })}
            {!view.length && (
              <tr><td className="td py-10 text-center text-slate-500" colSpan={shown.length}>{emptyText}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {sorted.length > size && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            Linhas por página
            <select className="input w-auto py-1" value={size} onChange={(e) => setSize(Number(e.target.value))}>
              {[10, 15, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button className="btn-outline px-2 py-1" disabled={pg === 0} onClick={() => setPage(pg - 1)} aria-label="Anterior"><ChevronLeft size={14} /></button>
            <span className="px-2">Página {pg + 1} de {pages}</span>
            <button className="btn-outline px-2 py-1" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)} aria-label="Próxima"><ChevronRight size={14} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
