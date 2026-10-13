// Gera public/data/base.json a partir das planilhas oficiais (mesmo pipeline do upload no navegador).
// Uso: npm run prepare-data -- "<Relatório Roteiro Promotor.xlsx>" "<Relatório Roteiro Rota Nova.xlsx>" ["302 agosto completa.xls"]
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';
import { extractWorkbook, mergePieces, trimBase, type Pieces } from '../lib/extract';


const files = process.argv.slice(2);
if (!files.length) { console.error('Informe os arquivos .xlsx'); process.exit(1); }
const pieces: Pieces[] = [];
for (const f of files) {
  const t = Date.now();
  const wb = XLSX.read(fs.readFileSync(f), { type: "buffer", dense: true, cellDates: false, cellHTML: false, cellFormula: false, cellStyles: false });
  const p = extractWorkbook(wb, path.basename(f));
  p.log.forEach((l) => console.log(`[${path.basename(f)}] ${l}`));
  console.log(`  (${Date.now() - t} ms)`);
  pieces.push(p);
}
const base = trimBase(mergePieces(null, pieces, 'embedded'));
const out = path.join(__dirname, '..', 'public', 'data', 'base.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(base));
console.log('OK ->', out, (fs.statSync(out).size / 1024).toFixed(0), 'KB',
  '| roteiro', base.roteiro.length, '| nova', base.nova.length, '| vendas clientes', Object.keys(base.vendas).length,
  '| cadastro', Object.keys(base.cadastro).length);
