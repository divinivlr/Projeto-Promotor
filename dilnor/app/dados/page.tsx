'use client';
import { useRef, useState } from 'react';
import { CheckCircle2, Database, FileSpreadsheet, Loader2, RotateCcw, UploadCloud, XCircle } from 'lucide-react';
import { useData } from '@/store/data';
import { Card, Info } from '@/components/ui';
import { exportXLSX } from '@/lib/export';
import { DAY_SHORT, fmtBRL, fmtNum, formatDoc } from '@/lib/utils';
import type { Client } from '@/lib/types';

const SRC_LABEL: Record<string, string> = {
  roteiro: 'Relatório de Roteiros (operação atual)', nova: 'Rota Nova (proposta territorial)', vendas: 'Venda (Jan–Jul)', cadastro: 'Cadastro 302 (clientes)',
};

export default function Dados() {
  const { model, upload, uploadFiles, restoreEmbedded } = useData();
  const m = model!;
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFiles = (list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list).filter((f) => /\.(xlsx|xls|xlsm)$/i.test(f.name));
    if (files.length) void uploadFiles(files);
  };

  const exportBase = () => {
    const cols = [
      { header: 'Código', value: (c: Client) => c.id }, { header: 'Razão Social', value: (c: Client) => c.nome }, { header: 'Fantasia', value: (c: Client) => c.fantasia },
      { header: 'CNPJ/CPF', value: (c: Client) => formatDoc(c.doc) }, { header: 'Tipo Doc', value: (c: Client) => c.docType }, { header: 'Doc válido', value: (c: Client) => (c.docValid ? 'Sim' : 'Não') },
      { header: 'Rede', value: (c: Client) => c.rede }, { header: 'Ramo', value: (c: Client) => c.ramoFmt }, { header: 'Endereço', value: (c: Client) => c.endereco }, { header: 'Bairro', value: (c: Client) => c.bairro },
      { header: 'Cidade', value: (c: Client) => c.cidadeLabel }, { header: 'UF', value: (c: Client) => c.uf }, { header: 'Latitude', value: (c: Client) => c.lat }, { header: 'Longitude', value: (c: Client) => c.lon },
      { header: 'Problema coordenada', value: (c: Client) => c.coordIssue ?? '' }, { header: 'Bloqueado', value: (c: Client) => (c.bloqueado ? 'Sim' : 'Não') },
      { header: 'Venda YTD', value: (c: Client) => c.total }, { header: 'Média mensal (÷7)', value: (c: Client) => Math.round(c.media * 100) / 100 }, { header: 'SKUs', value: (c: Client) => c.nSku }, { header: 'Fornecedores', value: (c: Client) => c.nForn },
      { header: 'Curva', value: (c: Client) => c.curva }, { header: 'Promotores', value: (c: Client) => c.promotores.join(', ') }, { header: 'Dias', value: (c: Client) => c.dias.map((d) => DAY_SHORT[d]).join(' ') },
      { header: 'Rota Nova', value: (c: Client) => c.rotaNova ?? '' }, { header: 'Dias Rota Nova', value: (c: Client) => c.diasNova.map((d) => DAY_SHORT[d]).join(' ') },
    ];
    void exportXLSX([
      { name: 'Carteira roteirizada', rows: m.carteira, cols },
      { name: 'Rota Nova', rows: m.nova, cols },
      { name: 'Todos analisados', rows: m.all, cols },
      { name: 'Promotores', rows: m.promotores, cols: [
        { header: 'Promotor', value: (p: any) => p.nome }, { header: 'Código', value: (p: any) => p.cod }, { header: 'Supervisor', value: (p: any) => p.supervisor },
        { header: 'Clientes', value: (p: any) => p.clientes.length }, { header: 'Visitas/semana', value: (p: any) => p.visitasSemana }, { header: 'Faturamento YTD', value: (p: any) => p.total },
        { header: 'Média mensal', value: (p: any) => p.media }, { header: 'SKUs únicos', value: (p: any) => p.skus }, { header: 'Fornecedores', value: (p: any) => p.forn },
        { header: 'Km semana', value: (p: any) => Math.round(p.kmSemana * 10) / 10 }, { header: 'Km otimizado', value: (p: any) => Math.round(p.kmOtimizado * 10) / 10 }, { header: 'Sem roteiro', value: (p: any) => (p.semRoteiro ? 'Sim' : 'Não') },
      ] },
    ], 'base_tratada_dilnor');
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
        onClick={() => !upload.busy && inputRef.current?.click()}
        className={`glass flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed p-10 text-center transition ${drag ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-900/30' : 'border-slate-300 dark:border-slate-700'}`}
      >
        {upload.busy ? <Loader2 size={40} className="animate-spin text-brand-600" /> : <UploadCloud size={40} className="text-brand-600" />}
        <div className="text-base font-semibold">{upload.busy ? upload.message : 'Arraste as planilhas aqui ou clique para selecionar'}</div>
        <div className="max-w-xl text-sm text-slate-500">
          Aceita <b>Relatório_Roteiro_Promotor.xlsx</b>, <b>Relatório_Roteiro_Rota_Nova.xlsx</b> e <b>302 agosto completa.xls</b>. As abas são reconhecidas automaticamente pelos cabeçalhos
          (colunas canonizadas, ex.: “ Valor YTD ” → <code>valor_ytd</code>). O processamento roda 100% no navegador, em um Web Worker.
        </div>
        {upload.busy && <div className="h-1.5 w-64 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${upload.progress * 100}%` }} /></div>}
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {upload.error && <Info tone="amber"><XCircle size={15} className="mr-1 inline text-red-600" /> {upload.error}</Info>}
      {!upload.busy && upload.message && !upload.error && (
        <Info><CheckCircle2 size={15} className="mr-1 inline text-emerald-600" /> {upload.message}
          {upload.log.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs">{upload.log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
        </Info>
      )}

      <Card title="Fontes carregadas" sub={m.base.origin === 'embedded' ? 'Base oficial embutida na aplicação' : 'Base enviada por upload (salva neste navegador)'}
        actions={<>
          <button className="btn-outline" onClick={exportBase}><FileSpreadsheet size={15} /> Exportar base tratada</button>
          {m.base.origin === 'upload' && <button className="btn-outline" onClick={() => void restoreEmbedded()}><RotateCcw size={15} /> Restaurar base oficial</button>}
        </>}>
        <table className="w-full text-sm">
          <thead><tr><th className="th">Conteúdo</th><th className="th">Arquivo</th><th className="th text-right">Registros</th><th className="th">Carregado em</th></tr></thead>
          <tbody>
            {(['roteiro', 'nova', 'vendas', 'cadastro'] as const).map((k) => {
              const s = m.base.sources[k];
              return (
                <tr key={k}>
                  <td className="td font-medium"><Database size={14} className="mr-1.5 inline text-brand-600" />{SRC_LABEL[k]}</td>
                  <td className="td text-[12px]">{s?.file ?? <span className="text-red-600">não carregado</span>}</td>
                  <td className="td num text-right">{s ? fmtNum(s.rows) : '—'}</td>
                  <td className="td text-[12px]">{s ? new Date(s.loadedAt).toLocaleString('pt-BR') : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card title="Regras de tratamento aplicadas">
        <ul className="grid gap-2 text-sm text-slate-700 dark:text-slate-300 md:grid-cols-2">
          <li>• <b>Chave do cliente</b>: código como texto limpo (sem “.0” e sem espaços).</li>
          <li>• <b>Média mensal</b>: venda acumulada da aba Venda ÷ <b>7 meses</b> (Jan–Jul).</li>
          <li>• <b>Curva ABCD</b>: participação acumulada — A até 50%, B até 80%, C até 95%, D restante (ajustável).</li>
          <li>• <b>Ramo</b>: termo “SUPERMERCADO” removido para exibir a faixa de check-outs.</li>
          <li>• <b>Documentos</b>: validação oficial de dígitos verificadores de CNPJ (14) e CPF (11).</li>
          <li>• <b>Distâncias</b>: fórmula de Haversine (km) entre coordenadas.</li>
          <li>• <b>SEM ROTEIRO</b>: {m.issues.semRoteiroPromotores.length} promotor(es) mantidos como capacidade ociosa, sem clientes.</li>
          <li>• <b>Coordenadas</b>: vazias/zeradas/fora de PE isoladas; lat/long invertidas corrigidas e sinalizadas.</li>
        </ul>
        <div className="mt-4 grid grid-cols-2 gap-3 text-center text-xs sm:grid-cols-4">
          <S l="Linhas de venda" v={fmtNum(m.base.vendaStats.rows)} />
          <S l="Venda total YTD" v={fmtBRL(m.base.vendaStats.total)} />
          <S l="Produtos" v={fmtNum(m.base.vendaStats.produtos)} />
          <S l="Fornecedores" v={fmtNum(m.base.vendaStats.fornecedores)} />
        </div>
      </Card>
    </div>
  );
}

function S({ l, v }: { l: string; v: string }) {
  return <div className="rounded-xl bg-slate-900/[.04] p-3 dark:bg-white/5"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{l}</div><div className="num mt-0.5 text-sm font-bold">{v}</div></div>;
}
