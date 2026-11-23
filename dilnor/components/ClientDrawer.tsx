'use client';
import { useMemo } from 'react';
import { useData } from '@/store/data';
import { Badge, Bar, CurvaBadge, Drawer } from '@/components/ui';
import MapView from '@/components/map/MapView';
import { clientPopup } from '@/components/map/popup';
import { BarChart, useChartTheme } from '@/components/charts';
import { DAY_LABEL, fmtBRL, fmtBRLc, fmtKm, fmtNum, fmtPct, formatDoc } from '@/lib/utils';
import type { Client } from '@/lib/types';

const COORD_LABEL: Record<string, string> = {
  ausente: 'Coordenada ausente', zerada: 'Coordenada zerada', fora_area: 'Coordenada fora da área', invertida: 'Lat/Long invertidas (corrigido)', distante_cidade: 'Coordenada distante da cidade',
};

export default function ClientDrawer({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const { model } = useData();
  const t = useChartTheme();
  const c = client;
  const forn = useMemo(() => (c ? c.forn.slice(0, 8) : []), [c]);
  if (!c || !model) return null;
  const prod = model.base.produtos;
  const fornN = model.base.fornecedores;
  const maxTop = c.top[0]?.[1] ?? 0;
  return (
    <Drawer open={!!c} onClose={onClose} title={
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <CurvaBadge c={c.curva} />
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">{c.nome}</h3>
        </div>
        <div className="mt-1 text-xs text-slate-500">Código {c.id} · {c.fantasia || '—'} · {c.ramoFmt}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {c.docValid ? <Badge tone="green">{c.docType} válido</Badge> : <Badge tone="red">{c.docType === 'VAZIO' ? 'Sem documento' : `${c.docType} inválido`}</Badge>}
          {c.bloqueado && <Badge tone="red">Bloqueado</Badge>}
          {!c.inCadastro && <Badge tone="red">Sem cadastro 302</Badge>}
          {c.coordIssue && <Badge tone="amber">{COORD_LABEL[c.coordIssue]}</Badge>}
          {c.rotaNova && <Badge tone="violet">{c.rotaNova}</Badge>}
          {!c.inRoteiro && <Badge tone="amber">Sem promotor</Badge>}
        </div>
      </div>
    }>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Mini l="Venda YTD" v={fmtBRLc(c.total)} />
          <Mini l="Média mensal" v={fmtBRLc(c.media)} />
          <Mini l="Mix de SKUs" v={fmtNum(c.nSku)} />
          <Mini l="Fornecedores" v={fmtNum(c.nForn)} />
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row l="CNPJ/CPF" v={formatDoc(c.doc)} />
          <Row l="Rede" v={c.rede || '—'} />
          <Row l="Endereço" v={c.endereco || '—'} />
          <Row l="Bairro" v={c.bairro || '—'} />
          <Row l="Cidade/UF" v={`${c.cidadeLabel || '—'} / ${c.uf || '—'}`} />
          <Row l="CEP" v={c.cep || '—'} />
          <Row l="RCA" v={c.rcaNome || '—'} />
          <Row l="Participação" v={`${fmtPct(c.share)} · ranking #${c.rank}`} />
          {c.distCidadeKm != null && <Row l="Distância ao centro da cidade" v={fmtKm(c.distCidadeKm)} />}
          {c.bloqueado && <Row l="Observação bloqueio" v={c.obsBloqueio || '—'} />}
        </dl>

        <div>
          <h4 className="card-title mb-2">Visitas programadas</h4>
          {c.visitas.length ? (
            <div className="overflow-hidden rounded-xl border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead><tr><th className="th">Promotor</th><th className="th">Dia</th><th className="th">Roteiro</th></tr></thead>
                <tbody>
                  {dedupe(c.visitas).map((v, i) => (
                    <tr key={i}><td className="td">{v.promotor}</td><td className="td">{DAY_LABEL[v.dia]}</td><td className="td text-xs">{v.roteiro} {v.n > 1 && <Badge tone="amber" title="Linha repetida no relatório de roteiros">{v.n}× duplicada</Badge>}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-slate-500">Cliente sem visita atribuída no roteiro atual.</p>}
        </div>

        {c.hasCoord && (
          <MapView points={[{ id: c.id, lat: c.lat!, lon: c.lon!, color: '#0E4DA4', title: c.nome, popup: clientPopup(c) }]} height={220} geocoder={false} fitKey={c.id} />
        )}

        <div>
          <h4 className="card-title mb-2">Top produtos comprados (YTD)</h4>
          <div className="space-y-2">
            {c.top.slice(0, 12).map(([p, v], i) => (
              <div key={p} className="text-[12.5px]">
                <div className="flex justify-between gap-3"><span className="truncate"><span className="text-slate-400">{i + 1}.</span> {prod[p] || `Produto ${p}`}</span><span className="num shrink-0 font-semibold">{fmtBRL(v)}</span></div>
                <Bar value={v} max={maxTop} color={t.series[0]} />
              </div>
            ))}
            {!c.top.length && <p className="text-sm text-slate-500">Sem vendas no período.</p>}
          </div>
        </div>

        {forn.length > 0 && (
          <div>
            <h4 className="card-title mb-2">Fornecedores</h4>
            <BarChart horizontal labels={forn.map(([f]) => (fornN[f] || f).slice(0, 26))} data={forn.map(([, v]) => v)} fmt={fmtBRLc} height={Math.max(140, forn.length * 30)} color={t.series[1]} />
          </div>
        )}
      </div>
    </Drawer>
  );
}

function dedupe(vs: Client['visitas']) {
  const m = new Map<string, Client['visitas'][number] & { n: number }>();
  for (const v of vs) {
    const k = `${v.promotor}|${v.dia}|${v.roteiro}`;
    const x = m.get(k);
    if (x) x.n++; else m.set(k, { ...v, n: 1 });
  }
  return Array.from(m.values());
}

function Mini({ l, v }: { l: string; v: string }) {
  return (
    <div className="rounded-xl bg-slate-900/[.04] p-3 dark:bg-white/5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{l}</div>
      <div className="num mt-0.5 text-base font-bold">{v}</div>
    </div>
  );
}
function Row({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{l}</dt>
      <dd className="text-slate-800 dark:text-slate-100">{v}</dd>
    </div>
  );
}
