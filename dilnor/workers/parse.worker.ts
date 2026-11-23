/// <reference lib="webworker" />
// Web Worker: leitura das planilhas fora da thread principal (UI sempre fluida).
import * as XLSX from 'xlsx';
import { extractWorkbook, type Pieces } from '../lib/extract';

type InMsg = { files: { name: string; buffer: ArrayBuffer }[] };

self.onmessage = (e: MessageEvent<InMsg>) => {
  const pieces: Pieces[] = [];
  try {
    e.data.files.forEach((f, i) => {
      (self as unknown as Worker).postMessage({ type: 'progress', message: `Lendo ${f.name}…`, step: i, total: e.data.files.length });
      const wb = XLSX.read(new Uint8Array(f.buffer), { type: 'array', dense: true, cellDates: false, cellHTML: false, cellFormula: false, cellStyles: false });
      (self as unknown as Worker).postMessage({ type: 'progress', message: `Processando abas de ${f.name}…`, step: i + 0.5, total: e.data.files.length });
      pieces.push(extractWorkbook(wb, f.name));
    });
    (self as unknown as Worker).postMessage({ type: 'done', pieces });
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
