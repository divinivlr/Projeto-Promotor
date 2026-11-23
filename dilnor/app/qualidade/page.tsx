'use client';
import { useMemo, useState } from 'react';
import { BadgeCheck, Ban, Fingerprint, MapPinOff, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useData } from '@/store/data';
import { Badge, Card, Info, Kpi, KpiGrid, Segmented, Tabs } from '@/components/ui';
import { DoughnutChart } from '@/components/charts';
import { DataTable, type Column } from '@/components/ui/DataTable';
import ClientDrawer from '@/components/ClientDrawer';
import type { Client } from '@/lib/types';
import { fmtBRL, fmtKm, fmtNum, fmtPct, formatDoc } from '@/lib/utils';

type Tab = 'coord' | 'doc' | 'cpf' | 'end' | 'bloq' | 'cad' | 'dup';
type Scope = 'carteira' | 'nova' | 'universo';

export default function Qualidade() {
  const { model } = useData();
  const m = model!;
  const [scope, setScope] = useState<Scope>('carteira');
  const [tab, setTab] = useState<Tab>('coord');
  const [sel, setSel] = useState<Client | null>(null);
  const cs = m.base.cadStats;

  const src = scope === 'carteira' ? m.carteira : scope === 'nova' ? m.nova : m.all;
  const a = useMemo(() => {
    const coord = src.filter((c) => c.inCadastro && c.coordIssue);
    const doc = src.filter((c) => c.inCadastro && !c.docValid);
    const cpf = src.filter((c) => c.docType === 'CPF');
    const end = src.filter((c) => (c.inCadastro && !c.endereco) || (c.cidadeRoteiro && c.cidade && c.cidadeRoteiro !== c.cidade) || c.coordIssue === 'distante_cidade');
    const bloq = src.filter((c) => c.bloqueado);
    const cad = src.filter((c) => !c.inCadastro);
    const ids = new Set(src.map((c) => c.id));
    const dup = m.issues.cnpjDuplicado.filter((d) => d.ids.some((id) => ids.has(id)));
    const problem = new Set([...coord, ...doc, ...end, ...bloq, ...cad].map((c) => c.id));
    return { coord, doc, cpf, end, bloq, cad, dup, ok: src.length - problem.size };
  }, [src, m]);

  const score = src.length ? a.ok / src.length : 1;
  const base: Column<Client>[] = [
    { key: 'id', header: 'Código', value: (c) => c.id },
    { key: 'nome', header: 'Cliente', value: (c) => c.nome, render: (c) => <span className="font-medium">{c.nome}</span> },
    { key: 'doc', header: 'CNPJ/CPF', value: (c) => formatDoc(c.doc), className: 'whitespace-nowrap text-[12px]' },
    { key: 'cidade', header: 'Cidade (cadastro)', value: (c) => c.cidadeLabel },
  ];
  const tail: Column<Client>[] = [
    { key: 'media', header: 'Média mensal', align: 'right', value: (c) => Math.round(c.media), render: (c) => fmtBRL(c.media) },
    { key: 'rot', header: 'No roteiro', value: (c) => (c.inRoteiro ? 'Sim' : 'Não'), render: (c) => (c.inRoteiro ? <Badge tone="brand">Sim</Badge> : <Badge>Não</Badge>) },
  ];
  const ISSUE: Record<string, string> = { ausente: 'Ausente', zerada: 'Zerada (0,0)', fora_area: 'Fora da área', invertida: 'Lat/Long invertidas', distante_cidade: 'Distante da cidade' };

  return (
    <div className="space-y-5">
      <Info>
        Base cadastral completa (302): <b>{fmtNum(cs.total)}</b> clientes · <b>{fmtNum(cs.bloqueados)}</b> bloqueados · <b>{fmtNum(cs.cpf)}</b> pessoas físicas (CPF) · <b>{fmtNum(cs.invalidos)}</b> documentos inválidos · <b>{fmtNum(cs.semCoord)}</b> sem coordenadas · <b>{fmtNum(cs.coordZerada)}</b> com coordenada zerada.
        A auditoria abaixo detalha o universo selecionado.
      </Info>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented value={scope} onChange={setScope} items={[{ id: 'carteira', label: `Carteira roteirizada (${m.carteira.length})` }, { id: 'nova', label: `Rota Nova (${m.nova.length})` }, { id: 'universo', label: `Todos analisados (${fmtNum(m.all.length)})` }]} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <div className="xl:col-span-3">
          <KpiGrid cols="sm:grid-cols-2 lg:grid-cols-3">
            <Kpi label="Índice de qualidade" value={fmtPct(score)} hint={`${fmtNum(a.ok)} de ${fmtNum(src.length)} registros sem pendência`} icon={score > 0.9 ? ShieldCheck : ShieldAlert} tone={score > 0.9 ? 'green' : 'accent'} />
            <Kpi label="Coordenadas com problema" value={fmtNum(a.coord.length)} hint="ausentes, zeradas, fora da área ou distantes" icon={MapPinOff} tone="violet" />
            <Kpi label="Documentos inválidos" value={fmtNum(a.doc.length)} hint="CNPJ/CPF reprovado no dígito verificador" icon={Fingerprint} tone="red" />
            <Kpi label="CPFs na base" value={fmtNum(a.cpf.length)} hint="pessoa física em carteira B2B" icon={BadgeCheck} tone="slate" />
            <Kpi label="Divergências de endereço" value={fmtNum(a.end.length)} hint="cidade do roteiro ≠ cadastro, sem endereço ou coordenada distante" icon={ShieldAlert} tone="accent" />
            <Kpi label="Bloqueados / sem cadastro" value={`${fmtNum(a.bloq.length)} / ${fmtNum(a.cad.length)}`} hint="cadastro 302" icon={Ban} tone="red" />
          </KpiGrid>
        </div>
        <Card title="Composição">
          <DoughnutChart labels={['Sem pendência', 'Com pendência']} data={[a.ok, src.length - a.ok]} colors={['#1baf7a', '#eb6834']} height={190} fmt={(v) => fmtNum(v)} />
        </Card>
      </div>

      <Tabs value={tab} onChange={setTab} items={[
        { id: 'coord', label: 'Coordenadas', count: a.coord.length },
        { id: 'doc', label: 'Documento inválido', count: a.doc.length },
        { id: 'cpf', label: 'CPFs na base', count: a.cpf.length },
        { id: 'end', label: 'Divergência de endereço', count: a.end.length },
        { id: 'bloq', label: 'Bloqueados', count: a.bloq.length },
        { id: 'cad', label: 'Sem cadastro', count: a.cad.length },
        { id: 'dup', label: 'CNPJ duplicado', count: a.dup.length },
      ]} />

      <Card>
        {tab === 'coord' && <DataTable rows={a.coord} rowKey={(c) => c.id} exportName="qualidade_coordenadas" onRowClick={setSel}
          columns={[...base, { key: 'issue', header: 'Problema', value: (c) => ISSUE[c.coordIssue ?? ''] ?? '', render: (c) => <Badge tone="amber">{ISSUE[c.coordIssue ?? '']}</Badge> }, { key: 'dist', header: 'Dist. centro cidade', align: 'right', value: (c) => c.distCidadeKm ?? null, render: (c) => fmtKm(c.distCidadeKm) }, { key: 'end', header: 'Endereço', value: (c) => c.endereco, className: 'text-[12px]' }, ...tail]} />}
        {tab === 'doc' && <DataTable rows={a.doc} rowKey={(c) => c.id} exportName="qualidade_documentos" onRowClick={setSel}
          columns={[...base, { key: 'tipo', header: 'Tipo detectado', value: (c) => c.docType, render: (c) => <Badge tone="red">{c.docType}</Badge> }, ...tail]} />}
        {tab === 'cpf' && <DataTable rows={a.cpf} rowKey={(c) => c.id} exportName="qualidade_cpfs" onRowClick={setSel}
          columns={[...base, { key: 'ramo', header: 'Ramo', value: (c) => c.ramoFmt }, { key: 'v', header: 'CPF válido', value: (c) => (c.docValid ? 'Sim' : 'Não') }, ...tail]} />}
        {tab === 'end' && <DataTable rows={a.end} rowKey={(c) => c.id} exportName="qualidade_enderecos" onRowClick={setSel}
          columns={[...base, { key: 'cr', header: 'Cidade (roteiro)', value: (c) => c.cidadeRoteiro, render: (c) => <span className={c.cidadeRoteiro && c.cidadeRoteiro !== c.cidade ? 'font-semibold text-red-600' : ''}>{c.cidadeRoteiro || '—'}</span> }, { key: 'end', header: 'Endereço', value: (c) => c.endereco || '(vazio)', className: 'text-[12px]' }, { key: 'dist', header: 'Dist. centro cidade', align: 'right', value: (c) => c.distCidadeKm ?? null, render: (c) => fmtKm(c.distCidadeKm) }, ...tail]} />}
        {tab === 'bloq' && <DataTable rows={a.bloq} rowKey={(c) => c.id} exportName="qualidade_bloqueados" onRowClick={setSel}
          columns={[...base, { key: 'obs', header: 'Motivo', value: (c) => c.obsBloqueio, className: 'text-[12px]' }, ...tail]} />}
        {tab === 'cad' && <DataTable rows={a.cad} rowKey={(c) => c.id} exportName="qualidade_sem_cadastro" onRowClick={setSel} columns={[...base, ...tail]} />}
        {tab === 'dup' && <DataTable rows={a.dup} rowKey={(d) => d.doc} exportName="qualidade_cnpj_duplicado"
          columns={[{ key: 'doc', header: 'CNPJ/CPF', value: (d) => formatDoc(d.doc) }, { key: 'ids', header: 'Códigos', value: (d) => d.ids.join(', ') }, { key: 'n', header: 'Qtde', align: 'right', value: (d) => d.ids.length }, { key: 'nomes', header: 'Clientes', value: (d) => d.ids.map((id) => m.clients.get(id)?.nome).join(' | '), className: 'text-[12px]' }]} />}
      </Card>
      <ClientDrawer client={sel} onClose={() => setSel(null)} />
    </div>
  );
}
