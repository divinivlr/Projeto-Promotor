import type { Client } from '@/lib/types';
import { DAY_SHORT, fmtBRL, formatDoc } from '@/lib/utils';

const e = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Popup detalhado do cliente (Razão Social, Venda Média, Endereço, Rota) */
export function clientPopup(c: Client, extra?: { rota?: string; cor?: string; linhas?: [string, string][] }) {
  const rows: [string, string][] = [
    ['Código', c.id],
    ['CNPJ/CPF', formatDoc(c.doc)],
    ['Venda média', `${fmtBRL(c.media)}/mês`],
    ['Venda YTD', fmtBRL(c.total)],
    ['Curva', c.curva],
  ];
  if (c.promotores.length) rows.push(['Promotor', c.promotores.join(', ')]);
  if (c.dias.length) rows.push(['Dias', c.dias.map((d) => DAY_SHORT[d]).join(' · ')]);
  if (extra?.linhas) rows.push(...extra.linhas);
  const rota = extra?.rota ?? c.rotaNova;
  return `<div style="font-size:12px;line-height:1.35">
    ${rota ? `<div style="display:inline-block;margin-bottom:6px;padding:1px 8px;border-radius:999px;font-size:10.5px;font-weight:700;color:#fff;background:${extra?.cor ?? '#0E4DA4'}">${e(rota)}</div>` : ''}
    <div style="font-weight:700;font-size:13px">${e(c.nome)}</div>
    ${c.fantasia && c.fantasia !== c.nome ? `<div style="opacity:.7">${e(c.fantasia)}</div>` : ''}
    <div style="margin:6px 0;opacity:.85">${e([c.endereco, c.bairro].filter(Boolean).join(' – '))}<br/>${e(c.cidadeLabel)}${c.uf ? ' / ' + e(c.uf) : ''}</div>
    <table style="width:100%;border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="opacity:.6;padding:1px 8px 1px 0;white-space:nowrap">${e(k)}</td><td style="font-weight:600">${e(v)}</td></tr>`).join('')}</table>
    ${c.bloqueado ? '<div style="margin-top:6px;color:#dc2626;font-weight:700">● Cliente bloqueado</div>' : ''}
  </div>`;
}
