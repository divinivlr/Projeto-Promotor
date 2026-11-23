'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Ban, Copy, FileX2, MapPinOff, ShoppingCart, Users2, UserX } from 'lucide-react';
import { useData } from '@/store/data';
import { Badge, Card, CurvaBadge, DayDots, Info, Kpi, KpiGrid, Tabs } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import ClientDrawer from '@/components/ClientDrawer';
import type { Client, DupRow } from '@/lib/types';
import { DAY_LABEL, DAY_SHORT, fmtBRL, fmtBRLc, fmtNum, formatDoc } from '@/lib/utils';

type Tab = 'dup' | 'conf' | 'bloq' | 'cad' | 'coord' | 'venda';

export default function Ineficiencias() {
  const { model } = useData();
  const m = model!;
  const is = m.issues;
  const [tab, setTab] = useState<Tab>('dup');
  const [sel, setSel] = useState<Client | null>(null);
  const get = (id: string) => m.clients.get(id)!;
  const linhasRedundantes = is.duplicidades.reduce((s, d) => s + d.vezes - 1, 0);

  const cliCols = (extra: Column<Client>[] = []): Column<Client>[] => [
    { key: 'id', header: 'Código', value: (c) => c.id },
    { key: 'nome', header: 'Cliente', value: (c) => c.nome, render: (c) => <span className="font-medium">{c.nome}</span> },
    { key: 'cidade', header: 'Cidade', value: (c) => c.cidadeLabel || c.cidadeRoteiro },
    { key: 'prom', header: 'Promotor(es)', value: (c) => c.promotores.join(', '), className: 'text-[12px]' },
    ...extra,
    { key: 'media', header: 'Média mensal', align: 'right', value: (c) => Math.round(c.media), render: (c) => fmtBRL(c.media) },
    { key: 'curva', header: 'Curva', align: 'center', value: (c) => c.curva, render: (c) => <CurvaBadge c={c.curva} /> },
  ];

  const dupRows = useMemo(() => is.duplicidades.map((d) => ({ ...d, c: get(d.cliente) })), [is]); // eslint-disable-line react-hooks/exhaustive-deps
  const dupCols: Column<DupRow & { c: Client }>[] = [
    { key: 'cliente', header: 'Código', value: (r) => r.cliente },
    { key: 'nome', header: 'Cliente', value: (r) => r.c?.nome ?? '', render: (r) => <span className="font-medium">{r.c?.nome}</span> },
    { key: 'promotor', header: 'Promotor', value: (r) => r.promotor },
    { key: 'dia', header: 'Dia', value: (r) => DAY_LABEL[r.dia] },
    { key: 'vezes', header: 'Ocorrências', align: 'right', value: (r) => r.vezes, render: (r) => <Badge tone={r.vezes > 2 ? 'red' : 'amber'}>{r.vezes}×</Badge> },
    { key: 'red', header: 'Linhas redundantes', align: 'right', value: (r) => r.vezes - 1 },
  ];

  const conflitos = useMemo(() => is.conflitos.map((x) => get(x.cliente)), [is]); // eslint-disable-line react-hooks/exhaustive-deps
  const mesmoDia = useMemo(() => new Map(is.mesmoDiaMultiPromotor.map((x) => [x.cliente, x])), [is]);

  return (
    <div className="space-y-5">
      <KpiGrid>
        <Kpi label="Linhas duplicadas" value={fmtNum(linhasRedundantes)} hint={`${fmtNum(is.duplicidades.length)} combinações cliente·promotor·dia`} icon={Copy} tone="red" />
        <Kpi label="Conflitos de promotores" value={fmtNum(is.conflitos.length)} hint={`${is.mesmoDiaMultiPromotor.length} no mesmo dia`} icon={Users2} tone="accent" />
        <Kpi label="Clientes bloqueados" value={fmtNum(is.bloqueados.length)} hint="em roteiro ativo" icon={Ban} tone="red" />
        <Kpi label="Sem cadastro" value={fmtNum(is.semCadastro.length)} hint="código ausente no 302" icon={FileX2} tone="slate" />
        <Kpi label="Sem coordenadas" value={fmtNum(is.semCoordenadas.length)} hint="não aparecem no mapa" icon={MapPinOff} tone="violet" />
        <Kpi label="Roteiro sem venda" value={fmtNum(is.roteiroSemVenda.length)} hint={`${fmtNum(is.vendaSemRoteiro.length)} compram sem visita`} icon={ShoppingCart} tone="brand" />
      </KpiGrid>

      {is.semRoteiroPromotores.length > 0 && (
        <Info tone="amber"><UserX size={15} className="mr-1 inline" /> <b>{is.semRoteiroPromotores.length} promotor(es) sem roteiro</b> (registros “SEM ROTEIRO”): {is.semRoteiroPromotores.join(' · ')} — capacidade ociosa disponível para absorver clientes de <Link className="font-semibold underline" href="/potencial">Potencial sem promotor</Link>.</Info>
      )}

      <Tabs value={tab} onChange={setTab} items={[
        { id: 'dup', label: 'Duplicidades', count: is.duplicidades.length },
        { id: 'conf', label: 'Conflitos de Promotores', count: is.conflitos.length },
        { id: 'bloq', label: 'Clientes Bloqueados', count: is.bloqueados.length },
        { id: 'cad', label: 'Sem Cadastro', count: is.semCadastro.length },
        { id: 'coord', label: 'Sem Coordenadas', count: is.semCoordenadas.length },
        { id: 'venda', label: 'Venda fora de Roteiro', count: is.roteiroSemVenda.length + is.vendaSemRoteiro.length },
      ]} />

      {tab === 'dup' && (
        <Card title="Duplicidades no relatório de roteiros" sub="Mesmo cliente, mesmo promotor e mesmo dia repetidos — inflam a contagem de visitas e distorcem a carga de trabalho">
          <DataTable rows={dupRows} columns={dupCols} rowKey={(r) => `${r.cliente}|${r.promotor}|${r.dia}`} exportName="duplicidades_roteiro" onRowClick={(r) => r.c && setSel(r.c)} initialSort={{ key: 'vezes', dir: 'desc' }} />
        </Card>
      )}
      {tab === 'conf' && (
        <Card title="Clientes atendidos por mais de um promotor" sub="Sobreposição de carteiras · destaque quando dois promotores visitam no mesmo dia">
          <DataTable rows={conflitos} rowKey={(c) => c.id} exportName="conflitos_promotores" onRowClick={setSel} initialSort={{ key: 'media', dir: 'desc' }}
            columns={cliCols([
              { key: 'n', header: 'Nº promotores', align: 'right', value: (c) => c.promotores.length },
              { key: 'dias', header: 'Dias', value: (c) => c.dias.join(' '), render: (c) => <DayDots days={c.dias} /> },
              { key: 'md', header: 'Mesmo dia', value: (c) => { const x = mesmoDia.get(c.id); return x ? `${DAY_SHORT[x.dia]}: ${x.promotores.join(' / ')}` : ''; }, render: (c) => { const x = mesmoDia.get(c.id); return x ? <Badge tone="red">{DAY_SHORT[x.dia]} · {x.promotores.length} promotores</Badge> : <span className="text-slate-400">—</span>; } },
            ])} />
        </Card>
      )}
      {tab === 'bloq' && (
        <Card title="Clientes bloqueados com visita programada" sub="Bloqueio no cadastro 302 — visitas sem possibilidade de faturamento">
          <DataTable rows={is.bloqueados.map(get)} rowKey={(c) => c.id} exportName="clientes_bloqueados" onRowClick={setSel}
            columns={cliCols([{ key: 'obs', header: 'Motivo', value: (c) => c.obsBloqueio, className: 'text-[12px] max-w-[260px]' }, { key: 'v', header: 'Visitas/sem.', align: 'right', value: (c) => c.dias.length }])} />
        </Card>
      )}
      {tab === 'cad' && (
        <Card title="Clientes do roteiro sem cadastro no 302" sub="Sem CNPJ, endereço e coordenadas — não podem ser validados nem plotados">
          <DataTable rows={is.semCadastro.map(get)} rowKey={(c) => c.id} exportName="sem_cadastro" onRowClick={setSel} columns={cliCols()} />
        </Card>
      )}
      {tab === 'coord' && (
        <Card title="Clientes sem coordenadas válidas" sub="Latitude/longitude ausentes, zeradas ou fora da área de atuação">
          <DataTable rows={is.semCoordenadas.map(get)} rowKey={(c) => c.id} exportName="sem_coordenadas" onRowClick={setSel}
            columns={cliCols([{ key: 'end', header: 'Endereço', value: (c) => [c.endereco, c.bairro].filter(Boolean).join(' - '), className: 'text-[12px]' }, { key: 'issue', header: 'Problema', value: (c) => c.coordIssue ?? '', render: (c) => <Badge tone="amber">{c.coordIssue}</Badge> }])} />
        </Card>
      )}
      {tab === 'venda' && (
        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
          <Card title="Roteiro sem venda" sub="Clientes visitados sem faturamento líquido de Jan a Jul">
            <DataTable rows={is.roteiroSemVenda.map(get)} rowKey={(c) => c.id} exportName="roteiro_sem_venda" onRowClick={setSel}
              columns={cliCols([{ key: 'v', header: 'Visitas/sem.', align: 'right', value: (c) => c.dias.length }, { key: 'doc', header: 'CNPJ', value: (c) => formatDoc(c.doc) }])} pageSize={10} />
          </Card>
          <Card title="Venda sem roteiro" sub={<>Clientes que compram mas não recebem visita · <Link href="/potencial" className="font-semibold text-brand-600 underline">ver análise de potencial</Link></>}>
            <DataTable rows={is.vendaSemRoteiro.slice(0, 300).map(get)} rowKey={(c) => c.id} exportName="venda_sem_roteiro" onRowClick={setSel}
              columns={[
                { key: 'id', header: 'Código', value: (c) => c.id },
                { key: 'nome', header: 'Cliente', value: (c) => c.nome, render: (c) => <span className="font-medium">{c.nome}</span> },
                { key: 'cidade', header: 'Cidade', value: (c) => c.cidadeLabel },
                { key: 'media', header: 'Média mensal', align: 'right', value: (c) => Math.round(c.media), render: (c) => fmtBRLc(c.media) },
                { key: 'rota', header: 'Rota Nova', value: (c) => c.rotaNova ?? '', render: (c) => (c.rotaNova ? <Badge tone="violet">{c.rotaNova}</Badge> : '—') },
              ]} pageSize={10} initialSort={{ key: 'media', dir: 'desc' }} />
          </Card>
        </div>
      )}
      <ClientDrawer client={sel} onClose={() => setSel(null)} />
    </div>
  );
}
