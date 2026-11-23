// Exportações client-side: CSV (Excel pt-BR), XLSX e PDF do roteiro.
import { BRAND } from './brand';

export interface ExportCol { header: string; value: (row: any) => string | number | null | undefined }

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportCSV(rows: any[], cols: ExportCol[], filename: string) {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(v).replace('.', ',');
    const s = String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map((c) => esc(c.header)).join(';')];
  for (const r of rows) lines.push(cols.map((c) => esc(c.value(r))).join(';'));
  download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), filename.endsWith('.csv') ? filename : filename + '.csv');
}

export async function exportXLSX(sheets: { name: string; rows: any[]; cols: ExportCol[] }[], filename: string) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const aoa = [s.cols.map((c) => c.header), ...s.rows.map((r) => s.cols.map((c) => { const v = c.value(r); return v === undefined ? null : v; }))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = s.cols.map((c) => ({ wch: Math.min(48, Math.max(10, c.header.length + 2)) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename.endsWith('.xlsx') ? filename : filename + '.xlsx');
}

export interface PdfDay {
  dia: string;
  km: number;
  rows: { ordem: number; codigo: string; cliente: string; fantasia: string; endereco: string; cidade: string; doc: string; media: string; curva: string; dist: string }[];
}

/** PDF profissional do roteiro com a marca Dilnor */
export async function exportRoteiroPDF(opts: {
  titulo: string; promotor: string; supervisor?: string; resumo: { label: string; value: string }[]; dias: PdfDay[]; regras: string[]; filename: string;
}) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const [pr, pg, pb] = BRAND.rgbPrimary;
  const [ar, ag, ab] = BRAND.rgbAccent;

  const header = () => {
    doc.setFillColor(pr, pg, pb); doc.rect(0, 0, W, 22, 'F');
    doc.setFillColor(ar, ag, ab); doc.rect(0, 22, W, 1.2, 'F');
    // Logo (monograma D)
    doc.setFillColor(255, 255, 255); doc.roundedRect(10, 4.5, 13, 13, 3, 3, 'F');
    doc.setTextColor(pr, pg, pb); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('D', 16.5, 13.6, { align: 'center' });
    doc.setFillColor(ar, ag, ab); doc.circle(21.2, 15.6, 1.4, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(14); doc.text(BRAND.full.toUpperCase(), 27, 11);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text(BRAND.tagline, 27, 16);
    doc.setFontSize(9); doc.text(opts.titulo, W - 10, 11, { align: 'right' });
    doc.setFontSize(8); doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, W - 10, 16, { align: 'right' });
  };
  const footer = () => {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setDrawColor(220, 226, 235); doc.line(10, H - 10, W - 10, H - 10);
      doc.setFontSize(7.5); doc.setTextColor(120, 130, 145);
      doc.text(`${BRAND.full} · Documento de uso interno`, 10, H - 6);
      doc.text(`Página ${i} de ${n}`, W - 10, H - 6, { align: 'right' });
    }
  };

  header();
  doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(opts.promotor, 10, 33);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90, 100, 115);
  if (opts.supervisor) doc.text(`Supervisor: ${opts.supervisor}`, 10, 38.5);

  // Cartões de resumo
  const cw = (W - 20 - (opts.resumo.length - 1) * 3) / opts.resumo.length;
  opts.resumo.forEach((r, i) => {
    const x = 10 + i * (cw + 3);
    doc.setFillColor(243, 246, 251); doc.setDrawColor(222, 229, 240); doc.roundedRect(x, 42, cw, 15, 2, 2, 'FD');
    doc.setFontSize(7); doc.setTextColor(100, 116, 139); doc.text(r.label.toUpperCase(), x + 3, 47);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(pr, pg, pb); doc.text(r.value, x + 3, 53.5);
    doc.setFont('helvetica', 'normal');
  });

  let y = 63;
  for (const d of opts.dias) {
    if (!d.rows.length) continue;
    if (y > H - 40) { doc.addPage(); header(); y = 30; }
    doc.setFillColor(ar, ag, ab); doc.rect(10, y - 3.6, 1.6, 5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(15, 23, 42);
    doc.text(`${d.dia}`, 14, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(100, 116, 139);
    doc.text(`${d.rows.length} cliente(s) · percurso estimado ${d.km.toFixed(1).replace('.', ',')} km (Haversine)`, 14 + doc.getTextWidth(d.dia) + 30, y);
    autoTable(doc, {
      startY: y + 2.5,
      margin: { left: 10, right: 10, top: 28 },
      head: [['#', 'Código', 'Cliente', 'Endereço', 'Cidade', 'CNPJ/CPF', 'Média mensal', 'Curva', 'Dist. ant.']],
      body: d.rows.map((r) => [r.ordem, r.codigo, r.fantasia && r.fantasia !== r.cliente ? `${r.cliente}\n${r.fantasia}` : r.cliente, r.endereco, r.cidade, r.doc, r.media, r.curva, r.dist]),
      styles: { fontSize: 7.8, cellPadding: 1.8, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.1, valign: 'middle' },
      headStyles: { fillColor: [pr, pg, pb], textColor: 255, fontStyle: 'bold', fontSize: 7.8 },
      alternateRowStyles: { fillColor: [247, 249, 252] },
      columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 16 }, 2: { cellWidth: 62 }, 3: { cellWidth: 62 }, 4: { cellWidth: 32 }, 5: { cellWidth: 32 }, 6: { cellWidth: 24, halign: 'right' }, 7: { cellWidth: 12, halign: 'center' }, 8: { halign: 'right' } },
      didDrawPage: () => header(),
    });
    // @ts-expect-error lastAutoTable é adicionado pelo plugin
    y = doc.lastAutoTable.finalY + 10;
  }
  if (opts.regras.length) {
    if (y > H - 30) { doc.addPage(); header(); y = 30; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(15, 23, 42); doc.text('Regras aplicadas', 10, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); doc.setTextColor(90, 100, 115);
    opts.regras.forEach((r, i) => doc.text(`• ${r}`, 12, y + 4.5 + i * 4));
  }
  footer();
  doc.save(opts.filename);
}
