'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2, CloudUpload, Database, FileSpreadsheet, GitMerge, History, KeyRound, Loader2, Monitor, Replace, RotateCcw, ShieldAlert, UploadCloud, XCircle,
} from 'lucide-react';
import { useData, type OnlineMeta } from '@/store/data';
import { analyze } from '@/lib/analyze';
import type { MergeMode, Pieces } from '@/lib/extract';
import { Badge, Card, Info } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { exportXLSX } from '@/lib/export';
import { DAY_SHORT, fmtBRL, fmtBRLc, fmtNum, formatDoc } from '@/lib/utils';
import type { Base, Client, Model } from '@/lib/types';

const SRC_LABEL: Record<string, string> = {
  roteiro: 'Relatório de Roteiros', vendas: 'Venda', cadastro: 'Cadastro 302 (clientes)',
};
const fmtDate = (s?: string) => (s ? new Date(s).toLocaleString('pt-BR') : '—');

interface PromDiff { nome: string; status: 'Novo' | 'Atualizado' | 'Removido' | 'Mantido' | 'Sem alteração'; cliA: number; cliB: number; visA: number; visB: number }

function diffPromotores(a: Model, b: Model): PromDiff[] {
  const A = new Map(a.promotores.map((p) => [p.nome, p]));
  const B = new Map(b.promotores.map((p) => [p.nome, p]));
  const out: PromDiff[] = [];
  for (const [nome, pb] of B) {
    const pa = A.get(nome);
    const same = pa && pa.clientes.length === pb.clientes.length && pa.visitasSemana === pb.visitasSemana && pa.clientes.every((id) => pb.clientes.includes(id));
    out.push({ nome, status: !pa ? 'Novo' : same ? 'Sem alteração' : 'Atualizado', cliA: pa?.clientes.length ?? 0, cliB: pb.clientes.length, visA: pa?.visitasSemana ?? 0, visB: pb.visitasSemana });
  }
  for (const [nome, pa] of A) if (!B.has(nome)) out.push({ nome, status: 'Removido', cliA: pa.clientes.length, cliB: 0, visA: pa.visitasSemana, visB: 0 });
  const order = { Novo: 0, Atualizado: 1, Removido: 2, 'Sem alteração': 3, Mantido: 4 };
  return out.sort((x, y) => order[x.status] - order[y.status] || x.nome.localeCompare(y.nome));
}

export default function AtualizarBase() {
  const { model, shared, parse, parseFiles, buildBase, applyLocal, discardLocal, publish, restoreVersion, fetchMeta } = useData();
  const m = model!;
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [pieces, setPieces] = useState<Pieces[] | null>(null);
  const [mode, setMode] = useState<MergeMode>('mesclar');
  const [meses, setMeses] = useState(m.meses);
  const [periodo, setPeriodo] = useState(m.periodo);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'' | 'publish' | 'local' | 'restore'>('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [meta, setMeta] = useState<OnlineMeta | null | undefined>(undefined);

  const loadMeta = useCallback(async () => setMeta(await fetchMeta()), [fetchMeta]);
  useEffect(() => { void loadMeta(); }, [loadMeta]);
  useEffect(() => { try { setPassword(sessionStorage.getItem('dilnor-admin') || ''); } catch { /* ignore */ } }, []);
  const rememberPwd = (p: string) => { setPassword(p); try { sessionStorage.setItem('dilnor-admin', p); } catch { /* ignore */ } };

  const onFiles = async (list: FileList | null) => {
    if (!list) return;
    const fs = Array.from(list).filter((f) => /\.(xlsx|xls|xlsm)$/i.test(f.name));
    if (!fs.length) return;
    setMsg(null);
    setFiles(fs.map((f) => f.name));
    setPieces(await parseFiles(fs));
  };

  const preview: Base | null = useMemo(() => (pieces ? buildBase(pieces, mode, meses, periodo) : null), [pieces, mode, meses, periodo, buildBase]);
  const pm = useMemo(() => (preview ? analyze(preview) : null), [preview]);
  const diff = useMemo(() => (pm ? diffPromotores(m, pm) : []), [m, pm]);
  const ignoredNova = pieces?.some((p) => p.nova);
  const log = pieces?.flatMap((p) => p.log) ?? [];
  const novaLog = ignoredNova ? ['Aba de "Rota Nova" ignorada — apenas o Relatório de Roteiros vale como roteiro.'] : [];

  const doPublish = async () => {
    if (!preview) return;
    setBusy('publish'); setMsg(null);
    try {
      await publish(preview, password);
      rememberPwd(password);
      setPieces(null); setFiles([]);
      setMsg({ ok: true, text: 'Base publicada! Todos que abrirem o site já veem a nova versão.' });
      void loadMeta();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(''); }
  };
  const doLocal = async () => {
    if (!preview) return;
    setBusy('local');
    await applyLocal(preview);
    setBusy(''); setPieces(null); setFiles([]);
    setMsg({ ok: true, text: 'Base aplicada somente neste navegador. Publique para que todos vejam.' });
  };
  const doRestore = async (pathname: string) => {
    setBusy('restore'); setMsg(null);
    try { await restoreVersion(pathname, password); setMsg({ ok: true, text: 'Versão restaurada e publicada para todos.' }); void loadMeta(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(''); }
  };

  const onlineReady = !!meta?.blob && !!meta?.admin;
  const origin = m.base.origin;

  const diffCols: Column<PromDiff>[] = [
    { key: 'status', header: 'Situação', value: (d) => d.status, render: (d) => <Badge tone={d.status === 'Novo' ? 'green' : d.status === 'Atualizado' ? 'brand' : d.status === 'Removido' ? 'red' : 'slate'}>{d.status}</Badge> },
    { key: 'nome', header: 'Promotor', value: (d) => d.nome, render: (d) => <span className="font-medium">{d.nome}</span> },
    { key: 'cli', header: 'Clientes (antes → depois)', align: 'right', value: (d) => d.cliB, render: (d) => <span>{d.cliA} → <b>{d.cliB}</b></span> },
    { key: 'vis', header: 'Visitas/sem. (antes → depois)', align: 'right', value: (d) => d.visB, render: (d) => <span>{d.visA} → <b>{d.visB}</b></span> },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Situação atual */}
      <Card title="Base em uso" sub="O que todos os usuários estão vendo agora"
        actions={<button className="btn-outline" onClick={() => exportBaseXLSX(m)}><FileSpreadsheet size={15} /> Exportar base tratada</button>}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Stat icon={origin === 'online' ? CloudUpload : origin === 'upload' ? Monitor : Database}
            l="Origem" v={origin === 'online' ? 'Online (compartilhada)' : origin === 'upload' ? 'Local deste navegador' : 'Embutida no deploy'}
            s={origin === 'online' ? `publicada em ${fmtDate(m.base.publishedAt)}` : origin === 'upload' ? 'não publicada' : 'versão do código-fonte'} />
          <Stat icon={Database} l="Roteiro" v={`${fmtNum(m.promotores.filter((p) => !p.semRoteiro).length)} promotores · ${fmtNum(m.carteira.length)} clientes`} s={m.base.sources.roteiro?.file ?? '—'} />
          <Stat icon={Database} l={`Venda (${m.periodo})`} v={fmtBRLc(m.base.vendaStats.total)} s={`média ÷ ${m.meses} meses · ${fmtNum(m.base.vendaStats.clientes)} clientes`} />
          <Stat icon={Database} l="Cadastro 302" v={`${fmtNum(m.base.cadStats.total)} clientes`} s={m.base.sources.cadastro?.file ?? '—'} />
        </div>
        {origin === 'upload' && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
            <ShieldAlert size={15} /> Você está vendo uma versão que existe só neste navegador.
            <button className="btn-outline ml-auto py-1 text-xs" onClick={() => void discardLocal()}><RotateCcw size={13} /> Voltar para a base compartilhada</button>
          </div>
        )}
      </Card>

      {meta !== undefined && !onlineReady && (
        <Info tone="amber">
          <b>Publicação online ainda não configurada no projeto da Vercel.</b> Para que a atualização fique online para todos:
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-[13px]">
            <li>Na Vercel, abra o projeto → <b>Storage</b> → <b>Create → Blob</b> → conecte ao projeto {meta?.blob ? <Badge tone="green">feito</Badge> : <Badge tone="red">pendente</Badge>}</li>
            <li>Em <b>Settings → Environment Variables</b>, crie <code>ADMIN_PASSWORD</code> com a senha de quem pode publicar {meta?.admin ? <Badge tone="green">feito</Badge> : <Badge tone="red">pendente</Badge>}</li>
            <li>Faça um novo deploy (Redeploy). Até lá, use “Aplicar só neste navegador” para conferir.</li>
          </ol>
        </Info>
      )}

      {/* Passo 1 */}
      <Card title="1 · Enviar planilha" sub="Relatório Roteiro Promotor.xlsx com as abas Relatório de Roteiros, Venda e 302 (layouts com coluna “Data Visita” ou colunas Segunda…Sábado com X)">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void onFiles(e.dataTransfer.files); }}
          onClick={() => !parse.busy && inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition ${drag ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-900/30' : 'border-slate-300 dark:border-slate-700'}`}
        >
          {parse.busy ? <Loader2 size={34} className="animate-spin text-brand-600" /> : <UploadCloud size={34} className="text-brand-600" />}
          <div className="font-semibold">{parse.busy ? parse.message : files.length ? files.join(', ') : 'Arraste a planilha aqui ou clique para selecionar'}</div>
          <div className="text-xs text-slate-500">Processamento 100% no navegador (Web Worker). Nada é enviado até você publicar.</div>
          {parse.busy && <div className="h-1.5 w-64 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${parse.progress * 100}%` }} /></div>}
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm" multiple hidden onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }} />
        </div>
        {parse.error && <div className="mt-3"><Info tone="amber"><XCircle size={15} className="mr-1 inline text-red-600" /> {parse.error}</Info></div>}
        {(log.length > 0) && <ul className="mt-3 list-disc pl-5 text-xs text-slate-600 dark:text-slate-400">{[...log, ...novaLog].map((l, i) => <li key={i}>{l}</li>)}</ul>}
      </Card>

      {preview && pm && (
        <>
          {/* Passo 2 */}
          <Card title="2 · Como aplicar">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <ModeCard active={mode === 'mesclar'} onClick={() => setMode('mesclar')} icon={GitMerge} title="Incluir / atualizar promotores"
                text="Só os promotores que estão na planilha são incluídos ou substituídos. Os demais promotores do site continuam como estão. Ideal para ir adicionando promotores." />
              <ModeCard active={mode === 'substituir'} onClick={() => setMode('substituir')} icon={Replace} title="Substituir roteiro inteiro"
                text="O roteiro do site passa a ser exatamente o da planilha. Promotores que não estiverem nela saem do site." />
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="w-40">
                <label className="label">Meses da venda (divisor)</label>
                <input type="number" min={1} max={24} className="input" value={meses} onChange={(e) => setMeses(Math.max(1, Math.min(24, Number(e.target.value) || 1)))} />
              </div>
              <div className="w-48">
                <label className="label">Rótulo do período</label>
                <input className="input" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
              </div>
              <p className="pb-1.5 text-xs text-slate-500">Média mensal = Valor YTD da aba Venda ÷ {meses}.</p>
            </div>
          </Card>

          {/* Passo 3 */}
          <Card title="3 · Conferir o resultado" sub="Comparação com a base em uso">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Cmp l="Promotores c/ roteiro" a={m.promotores.filter((p) => !p.semRoteiro).length} b={pm.promotores.filter((p) => !p.semRoteiro).length} />
              <Cmp l="Clientes roteirizados" a={m.carteira.length} b={pm.carteira.length} />
              <Cmp l="Visitas/semana" a={m.promotores.reduce((s, p) => s + p.visitasSemana, 0)} b={pm.promotores.reduce((s, p) => s + p.visitasSemana, 0)} />
              <Cmp l="Venda total (YTD)" a={m.base.vendaStats.total} b={pm.base.vendaStats.total} money />
              <Cmp l="Média mensal carteira" a={m.carteira.reduce((s, c) => s + c.media, 0)} b={pm.carteira.reduce((s, c) => s + c.media, 0)} money />
            </div>
            <div className="mt-4">
              <DataTable rows={diff} columns={diffCols} rowKey={(d) => d.nome} pageSize={10} exportName="alteracoes_promotores" />
            </div>
            {pm.issues.semCadastro.length > 0 && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{pm.issues.semCadastro.length} cliente(s) do roteiro sem cadastro no 302 — aparecerão em Qualidade dos Dados.</p>}
          </Card>

          {/* Passo 4 */}
          <Card title="4 · Publicar">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-64">
                <label className="label"><KeyRound size={11} className="mr-1 inline" />Senha de administrador</label>
                <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="ADMIN_PASSWORD" autoComplete="current-password" />
              </div>
              <button className="btn-primary" disabled={!onlineReady || !password || !!busy} onClick={() => void doPublish()} title={onlineReady ? '' : 'Configure o armazenamento online (veja o aviso acima)'}>
                {busy === 'publish' ? <Loader2 size={15} className="animate-spin" /> : <CloudUpload size={15} />} Publicar para todos
              </button>
              <button className="btn-outline" disabled={!!busy} onClick={() => void doLocal()}><Monitor size={15} /> Aplicar só neste navegador</button>
            </div>
          </Card>
        </>
      )}

      {msg && <Info tone={msg.ok ? 'brand' : 'amber'}>{msg.ok ? <CheckCircle2 size={15} className="mr-1 inline text-emerald-600" /> : <XCircle size={15} className="mr-1 inline text-red-600" />}{msg.text}</Info>}

      {meta?.blob && (
        <Card title="Histórico de publicações" sub="As 10 versões mais recentes ficam guardadas — restaurar republica a versão para todos" actions={<History size={16} className="text-slate-400" />}>
          {meta.versions.length ? (
            <table className="w-full text-sm">
              <thead><tr><th className="th">Publicada em</th><th className="th text-right">Tamanho</th><th className="th" /></tr></thead>
              <tbody>
                {meta.versions.map((v, i) => (
                  <tr key={v.pathname}>
                    <td className="td">{fmtDate(v.uploadedAt)} {i === 0 && <Badge tone="green">em uso</Badge>}</td>
                    <td className="td num text-right">{(v.size / 1024).toFixed(0)} KB</td>
                    <td className="td text-right">{i > 0 && <button className="btn-outline py-1 text-xs" disabled={!password || !!busy} onClick={() => void doRestore(v.pathname)}><RotateCcw size={13} /> Restaurar</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-sm text-slate-500">Nenhuma publicação ainda — o site está usando a base embutida no deploy ({fmtDate(shared?.generatedAt)}).</p>}
        </Card>
      )}

      <Card title="Fontes da base em uso">
        <table className="w-full text-sm">
          <thead><tr><th className="th">Conteúdo</th><th className="th">Arquivo</th><th className="th text-right">Registros</th><th className="th">Carregado em</th></tr></thead>
          <tbody>
            {(['roteiro', 'vendas', 'cadastro'] as const).map((k) => {
              const s = m.base.sources[k];
              return (
                <tr key={k}>
                  <td className="td font-medium"><Database size={14} className="mr-1.5 inline text-brand-600" />{SRC_LABEL[k]}</td>
                  <td className="td text-[12px]">{s?.file ?? <span className="text-red-600">não carregado</span>}</td>
                  <td className="td num text-right">{s ? fmtNum(s.rows) : '—'}</td>
                  <td className="td text-[12px]">{fmtDate(s?.loadedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <ul className="mt-4 grid gap-2 text-sm text-slate-700 dark:text-slate-300 md:grid-cols-2">
          <li>• <b>Média mensal</b>: Valor YTD da aba Venda ÷ <b>{m.meses} meses</b> ({m.periodo}).</li>
          <li>• <b>Curva ABCD</b>: participação acumulada — A até 50%, B até 80%, C até 95%, D restante.</li>
          <li>• <b>Documentos</b>: dígitos verificadores oficiais de CNPJ (14) e CPF (11).</li>
          <li>• <b>Promotores sem clientes</b> (linhas sem cliente/dia): {m.issues.semRoteiroPromotores.join(', ') || '—'}.</li>
        </ul>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, l, v, s }: { icon: typeof Database; l: string; v: string; s?: string }) {
  return (
    <div className="rounded-xl bg-slate-900/[.04] p-3 dark:bg-white/5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"><Icon size={12} />{l}</div>
      <div className="mt-0.5 text-sm font-bold">{v}</div>
      {s && <div className="truncate text-[11px] text-slate-500" title={s}>{s}</div>}
    </div>
  );
}

function Cmp({ l, a, b, money }: { l: string; a: number; b: number; money?: boolean }) {
  const f = money ? fmtBRLc : fmtNum;
  const d = b - a;
  return (
    <div className="rounded-xl bg-slate-900/[.04] p-3 dark:bg-white/5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{l}</div>
      <div className="num mt-0.5 text-sm"><span className="text-slate-500">{f(a)}</span> → <b>{f(b)}</b></div>
      <div className={`text-[11px] font-semibold ${d > 0 ? 'text-emerald-600' : d < 0 ? 'text-red-600' : 'text-slate-400'}`}>{d === 0 ? 'sem mudança' : `${d > 0 ? '+' : ''}${f(d)}`}</div>
    </div>
  );
}

function ModeCard({ active, onClick, icon: Icon, title, text }: { active: boolean; onClick: () => void; icon: typeof GitMerge; title: string; text: string }) {
  return (
    <button onClick={onClick} className={`flex gap-3 rounded-xl border p-4 text-left transition ${active ? 'border-brand-500 bg-brand-50/70 ring-2 ring-brand-400/30 dark:bg-brand-900/30' : 'border-[var(--border)] hover:border-brand-300'}`}>
      <Icon size={20} className={active ? 'text-brand-600' : 'text-slate-400'} />
      <div><div className="text-sm font-semibold">{title}</div><div className="mt-0.5 text-xs text-slate-500">{text}</div></div>
    </button>
  );
}

function exportBaseXLSX(m: Model) {
  const cols = [
    { header: 'Código', value: (c: Client) => c.id }, { header: 'Razão Social', value: (c: Client) => c.nome }, { header: 'Fantasia', value: (c: Client) => c.fantasia },
    { header: 'CNPJ/CPF', value: (c: Client) => formatDoc(c.doc) }, { header: 'Tipo Doc', value: (c: Client) => c.docType }, { header: 'Doc válido', value: (c: Client) => (c.docValid ? 'Sim' : 'Não') },
    { header: 'Rede', value: (c: Client) => c.rede }, { header: 'Endereço', value: (c: Client) => c.endereco }, { header: 'Bairro', value: (c: Client) => c.bairro },
    { header: 'Cidade', value: (c: Client) => c.cidadeLabel }, { header: 'UF', value: (c: Client) => c.uf }, { header: 'Latitude', value: (c: Client) => c.lat }, { header: 'Longitude', value: (c: Client) => c.lon },
    { header: 'Problema coordenada', value: (c: Client) => c.coordIssue ?? '' }, { header: 'Bloqueado', value: (c: Client) => (c.bloqueado ? 'Sim' : 'Não') },
    { header: `Venda YTD (${m.periodo})`, value: (c: Client) => c.total }, { header: `Média mensal (÷${m.meses})`, value: (c: Client) => Math.round(c.media * 100) / 100 },
    { header: 'SKUs', value: (c: Client) => c.nSku }, { header: 'Fornecedores', value: (c: Client) => c.nForn },
    { header: 'Curva', value: (c: Client) => c.curva }, { header: 'Promotores', value: (c: Client) => c.promotores.join(', ') }, { header: 'Dias', value: (c: Client) => c.dias.map((d) => DAY_SHORT[d]).join(' ') },
  ];
  void exportXLSX([
    { name: 'Carteira roteirizada', rows: m.carteira, cols },
    { name: 'Todos analisados', rows: m.all, cols },
    { name: 'Promotores', rows: m.promotores, cols: [
      { header: 'Promotor', value: (p: any) => p.nome }, { header: 'Código', value: (p: any) => p.cod }, { header: 'Supervisor', value: (p: any) => p.supervisor },
      { header: 'Clientes', value: (p: any) => p.clientes.length }, { header: 'Visitas/semana', value: (p: any) => p.visitasSemana }, { header: 'Faturamento YTD', value: (p: any) => p.total },
      { header: 'Média mensal', value: (p: any) => p.media }, { header: 'SKUs únicos', value: (p: any) => p.skus }, { header: 'Fornecedores', value: (p: any) => p.forn },
      { header: 'Km semana', value: (p: any) => Math.round(p.kmSemana * 10) / 10 }, { header: 'Km otimizado', value: (p: any) => Math.round(p.kmOtimizado * 10) / 10 }, { header: 'Sem roteiro', value: (p: any) => (p.semRoteiro ? 'Sim' : 'Não') },
    ] },
  ], 'base_tratada_dilnor');
}
