'use client';
import { useMemo, useState } from 'react';
import { useData } from '@/store/data';
import { applyFilters } from '@/lib/filters';
import { Badge, Card, CurvaBadge, DayDots, Segmented } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import ClientDrawer from '@/components/ClientDrawer';
import type { Client } from '@/lib/types';
import { fmtBRL, fmtNum, formatDoc } from '@/lib/utils';

type Scope = 'carteira' | 'nova' | 'base';

export default function PorCliente() {
  const { model, filters } = useData();
  const m = model!;
  const [scope, setScope] = useState<Scope>('carteira');
  const [sel, setSel] = useState<Client | null>(null);

  const rows = useMemo(() => {
    const src = scope === 'carteira' ? m.carteira : scope === 'nova' ? m.nova : m.all.filter((c) => c.total > 0 || c.inRoteiro);
    return applyFilters(src, scope === 'carteira' ? filters : { ...filters, supervisor: undefined, promotor: undefined, dia: scope === 'nova' ? filters.dia : undefined });
  }, [m, scope, filters]);

  const columns: Column<Client>[] = [
    { key: 'id', header: 'Código', value: (c) => c.id },
    { key: 'nome', header: 'Cliente', value: (c) => c.nome, render: (c) => <div className="max-w-[280px]"><div className="truncate font-medium">{c.nome}</div><div className="truncate text-[11px] text-slate-500">{c.fantasia || '—'}</div></div> },
    { key: 'doc', header: 'CNPJ/CPF', value: (c) => formatDoc(c.doc), render: (c) => <span className={`whitespace-nowrap text-[12px] ${c.docValid ? '' : 'text-red-600'}`}>{formatDoc(c.doc)}</span> },
    { key: 'ramo', header: 'Ramo', value: (c) => c.ramoFmt, className: 'whitespace-nowrap text-[12px]' },
    { key: 'cidade', header: 'Cidade', value: (c) => c.cidadeLabel, className: 'whitespace-nowrap' },
    { key: 'prom', header: 'Promotor(es)', value: (c) => c.promotores.join(', '), render: (c) => c.promotores.length ? <span className="text-[12px]">{c.promotores[0].split(' ').slice(0, 2).join(' ')}{c.promotores.length > 1 && <Badge tone="amber">+{c.promotores.length - 1}</Badge>}</span> : <Badge tone="amber">Sem promotor</Badge> },
    { key: 'dias', header: 'Dias', value: (c) => c.dias.join(' '), render: (c) => <DayDots days={c.dias} /> },
    { key: 'rota', header: 'Rota Nova', value: (c) => c.rotaNova ?? '', render: (c) => c.rotaNova ? <Badge tone="violet">{c.rotaNova}</Badge> : <span className="text-slate-400">—</span> },
    { key: 'total', header: 'Venda YTD', align: 'right', value: (c) => Math.round(c.total), render: (c) => fmtBRL(c.total) },
    { key: 'media', header: 'Média mensal', align: 'right', value: (c) => Math.round(c.media), render: (c) => <b>{fmtBRL(c.media)}</b> },
    { key: 'sku', header: 'SKUs', align: 'right', value: (c) => c.nSku },
    { key: 'forn', header: 'Forn.', align: 'right', value: (c) => c.nForn },
    { key: 'curva', header: 'Curva', align: 'center', value: (c) => c.curva, render: (c) => <CurvaBadge c={c.curva} /> },
    { key: 'status', header: 'Status', value: (c) => (c.bloqueado ? 'Bloqueado' : 'Ativo'), render: (c) => (c.bloqueado ? <Badge tone="red">Bloqueado</Badge> : <Badge tone="green">Ativo</Badge>) },
    { key: 'fantasia', header: 'Fantasia', value: (c) => c.fantasia, hidden: true },
    { key: 'endereco', header: 'Endereço', value: (c) => [c.endereco, c.bairro].filter(Boolean).join(' - '), hidden: true },
    { key: 'lat', header: 'Latitude', value: (c) => c.lat ?? '', hidden: true },
    { key: 'lon', header: 'Longitude', value: (c) => c.lon ?? '', hidden: true },
  ];

  return (
    <div className="space-y-4">
      <Card
        title="Tabela analítica de clientes"
        sub={`${fmtNum(rows.length)} clientes · clique em uma linha para ver produtos, fornecedores e visitas`}
        actions={<Segmented value={scope} onChange={setScope} items={[{ id: 'carteira', label: `Carteira (${m.carteira.length})` }, { id: 'nova', label: `Rota Nova (${m.nova.length})` }, { id: 'base', label: 'Todos com venda' }]} />}
      >
        <DataTable rows={rows} columns={columns} rowKey={(c) => c.id} exportName="clientes_dilnor" onRowClick={setSel} initialSort={{ key: 'media', dir: 'desc' }} />
      </Card>
      <ClientDrawer client={sel} onClose={() => setSel(null)} />
    </div>
  );
}
