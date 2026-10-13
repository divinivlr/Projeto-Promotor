'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, FileSpreadsheet, Import, Plus, RotateCcw, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { useData } from '@/store/data';
import { Badge, Card, CurvaBadge, Info } from '@/components/ui';
import MapView from '@/components/map/MapView';
import { clientPopup } from '@/components/map/popup';
import { DAY_COLORS } from '@/components/charts';
import { candidatos } from '@/lib/routing';
import { exportRoteiroPDF, exportXLSX } from '@/lib/export';
import { lsGet, lsSet } from '@/lib/idb';
import type { Client } from '@/lib/types';
import { DAYS, DAY_LABEL, DAY_SHORT, type DayKey, centroid, fmtBRL, fmtBRLc, fmtKm, formatDoc, haversine, optimizeOrder, pathKm, stripAccents } from '@/lib/utils';
import type { MapCircle, MapLine, MapPoint } from '@/components/map/types';

const MAX_DIA = 6;
type Plan = Record<DayKey, string[]>;
const emptyPlan = (): Plan => ({ SEG: [], TER: [], QUA: [], QUI: [], SEX: [], SAB: [] });

export default function Construtor() {
  const { model } = useData();
  const m = model!;
  const [promotor, setPromotor] = useState<string>(() => m.promotores.find((p) => !p.semRoteiro)?.nome ?? '');
  const [dia, setDia] = useState<DayKey>('SEG');
  const [plan, setPlan] = useState<Plan>(emptyPlan);
  const [raio, setRaio] = useState(10);
  const [allowCPF, setAllowCPF] = useState(false);
  const [multiDia, setMultiDia] = useState(false);
  const [escopo, setEscopo] = useState<'todos' | 'livres' | 'carteira'>('todos');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [hover, setHover] = useState<string | null>(null);

  const key = `dilnor-builder-${promotor || 'novo'}`;
  useEffect(() => { setPlan(lsGet<Plan>(key, emptyPlan())); setMsg(''); }, [key]);
  const save = (p: Plan) => { setPlan(p); lsSet(key, p); };

  const prom = m.promotores.find((p) => p.nome === promotor);
  const get = (id: string) => m.clients.get(id)!;

  // Validação automática: CNPJ válido, venda > 0, coordenada, cadastro ativo
  const { pool, excl } = useMemo(() => {
    const excl = { doc: 0, venda: 0, coord: 0, bloq: 0 };
    const pool: Client[] = [];
    for (const c of m.all) {
      if (!c.inCadastro) continue;
      if (c.bloqueado) { excl.bloq++; continue; }
      if (!(c.docValid && (c.docType === 'CNPJ' || allowCPF))) { excl.doc++; continue; }
      if (c.total <= 0) { excl.venda++; continue; }
      if (!c.hasCoord) { excl.coord++; continue; }
      if (escopo === 'livres' && c.inRoteiro && !(prom && c.promotores.includes(prom.nome))) continue;
      if (escopo === 'carteira' && !(prom && c.promotores.includes(prom.nome))) continue;
      pool.push(c);
    }
    return { pool, excl };
  }, [m, allowCPF, escopo, prom]);

  const dayIds = plan[dia];
  const anterior = dayIds.length ? get(dayIds[dayIds.length - 1]) : null;
  const ancora = useMemo(() => {
    if (!prom) return null;
    const pts = prom.clientes.map(get).filter((c) => c?.hasCoord).map((c) => ({ lat: c.lat!, lon: c.lon! }));
    return centroid(pts);
  }, [prom]); // eslint-disable-line react-hooks/exhaustive-deps

  const usados = useMemo(() => new Set(multiDia ? dayIds : DAYS.flatMap((d) => plan[d])), [plan, dayIds, multiDia]);
  const cands = useMemo(() => {
    const list = candidatos({ pool, anterior, raioKm: raio, excluir: usados, ancora });
    if (!q.trim()) return list;
    const t = stripAccents(q.toLowerCase());
    return list.filter((x) => stripAccents(`${x.c.nome} ${x.c.fantasia} ${x.c.id} ${x.c.cidadeLabel}`.toLowerCase()).includes(t));
  }, [pool, anterior, raio, usados, ancora, q]);

  const full = dayIds.length >= MAX_DIA;
  const add = (id: string) => {
    if (full) { setMsg(`Limite de ${MAX_DIA} clientes em ${DAY_LABEL[dia]} atingido.`); return; }
    if (!cands.some((x) => x.c.id === id)) { setMsg('Cliente fora das regras (raio, validação ou já incluído).'); return; }
    save({ ...plan, [dia]: [...dayIds, id] }); setMsg('');
  };
  const remove = (d: DayKey, id: string) => save({ ...plan, [d]: plan[d].filter((x) => x !== id) });
  const move = (d: DayKey, i: number, dir: -1 | 1) => {
    const a = plan[d].slice(); const j = i + dir; if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]]; save({ ...plan, [d]: a });
  };
  const autoFill = () => {
    let cur = dayIds.slice();
    const used = new Set(multiDia ? cur : DAYS.flatMap((d) => (d === dia ? cur : plan[d])));
    while (cur.length < MAX_DIA) {
      const prev = cur.length ? get(cur[cur.length - 1]) : null;
      const next = candidatos({ pool, anterior: prev, raioKm: raio, excluir: used, ancora })[0];
      if (!next) break;
      cur = [...cur, next.c.id]; used.add(next.c.id);
    }
    save({ ...plan, [dia]: cur });
    setMsg(cur.length < MAX_DIA ? `Sem novos candidatos dentro de ${raio} km — dia com ${cur.length} cliente(s).` : '');
  };
  const optimizeDay = (d: DayKey) => {
    const cl = plan[d].map(get).map((c) => ({ lat: c.lat!, lon: c.lon!, id: c.id }));
    save({ ...plan, [d]: optimizeOrder(cl).map((x) => x.id) });
  };
  const importar = () => {
    if (!prom) return;
    const p = emptyPlan(); const cortes: string[] = [];
    for (const d of DAYS) {
      const ok = prom.porDia[d].filter((id) => { const c = m.clients.get(id); return c && c.hasCoord; });
      p[d] = ok.slice(0, MAX_DIA);
      if (ok.length > MAX_DIA) cortes.push(`${DAY_SHORT[d]} (${ok.length - MAX_DIA})`);
    }
    save(p);
    setMsg(cortes.length ? `Agenda atual importada respeitando ${MAX_DIA} clientes/dia. Excedentes não importados: ${cortes.join(', ')}.` : 'Agenda atual importada.');
  };

  const stats = useMemo(() => DAYS.map((d) => {
    const cl = plan[d].map(get).filter(Boolean);
    return { d, n: cl.length, km: pathKm(cl.filter((c) => c.hasCoord).map((c) => ({ lat: c.lat!, lon: c.lon! }))), media: cl.reduce((s, c) => s + c.media, 0) };
  }), [plan]); // eslint-disable-line react-hooks/exhaustive-deps
  const tot = stats.reduce((a, s) => ({ n: a.n + s.n, km: a.km + s.km, media: a.media }), { n: 0, km: 0, media: 0 });
  // média mensal da rota: clientes únicos (um cliente visitado em 2 dias conta uma vez)
  tot.media = Array.from(new Set(DAYS.flatMap((d) => plan[d]))).reduce((s, id) => s + (m.clients.get(id)?.media ?? 0), 0);

  const map = useMemo(() => {
    const points: MapPoint[] = []; const lines: MapLine[] = []; const circles: MapCircle[] = [];
    const seen = new Set<string>();
    DAYS.forEach((d) => {
      const cl = plan[d].map(get).filter((c) => c?.hasCoord);
      cl.forEach((c, i) => {
        const id = seen.has(c.id) ? `${c.id}~${d}` : c.id; seen.add(c.id);
        points.push({ id, lat: c.lat!, lon: c.lon!, color: DAY_COLORS[d], label: String(i + 1), dim: d !== dia, title: c.nome, popup: clientPopup(c, { rota: `${DAY_LABEL[d]} · parada ${i + 1}`, cor: DAY_COLORS[d] }) });
      });
      if (cl.length > 1) lines.push({ id: d, latlngs: cl.map((c) => [c.lat!, c.lon!]), color: DAY_COLORS[d], weight: d === dia ? 4 : 2, opacity: d === dia ? 0.9 : 0.35 });
    });
    if (!full) cands.slice(0, 40).forEach((x) => {
      if (seen.has(x.c.id)) return;
      points.push({ id: x.c.id, lat: x.c.lat!, lon: x.c.lon!, color: '#F28C28', shape: 'dot', title: `Candidato: ${x.c.nome}`, popup: clientPopup(x.c, { linhas: [['Distância', fmtKm(x.dist)], ['Score', fmtBRL(x.score)]] }) });
    });
    if (anterior?.hasCoord) circles.push({ lat: anterior.lat!, lon: anterior.lon!, radiusM: raio * 1000, color: DAY_COLORS[dia], fillOpacity: 0.05 });
    else if (ancora) circles.push({ lat: ancora.lat, lon: ancora.lon, color: '#0E4DA4', title: 'Centroide da carteira' });
    return { points, lines, circles };
  }, [plan, dia, cands, full, anterior, raio, ancora]); // eslint-disable-line react-hooks/exhaustive-deps

  const nome = prom?.nome ?? 'Novo roteiro';
  const pdf = () => exportRoteiroPDF({
    titulo: 'Roteiro semanal de visitas',
    promotor: nome,
    supervisor: prom?.supervisor,
    resumo: [
      { label: 'Clientes/semana', value: String(tot.n) },
      { label: 'Média mensal da rota', value: fmtBRLc(tot.media) },
      { label: 'Percurso semanal', value: fmtKm(tot.km) },
      { label: 'Dias ativos', value: String(stats.filter((s) => s.n).length) },
      { label: 'Raio máximo', value: `${raio} km` },
    ],
    dias: DAYS.map((d) => ({
      dia: d === 'SAB' ? 'Sábado' : `${DAY_LABEL[d]}-feira`,
      km: stats.find((s) => s.d === d)!.km,
      rows: plan[d].map(get).map((c, i, arr) => ({
        ordem: i + 1, codigo: c.id, cliente: c.nome, fantasia: c.fantasia, endereco: [c.endereco, c.bairro].filter(Boolean).join(' - '),
        cidade: c.cidadeLabel, doc: formatDoc(c.doc), media: fmtBRL(c.media), curva: c.curva,
        dist: i === 0 ? '—' : fmtKm(haversine(arr[i - 1].lat!, arr[i - 1].lon!, c.lat!, c.lon!)),
      })),
    })),
    regras: [
      `Máximo de ${MAX_DIA} clientes por dia.`,
      `Candidatos filtrados por raio máximo de ${raio} km a partir do cliente anterior (Haversine).`,
      'Ordenação dos candidatos por Faturamento médio mensal / (1 + Distância em km).',
      `Validação automática: ${allowCPF ? 'CNPJ ou CPF válido' : 'CNPJ válido'}, venda acumulada > 0, cadastro ativo e coordenadas válidas.`,
      'Média mensal = venda acumulada Jan–Jul ÷ 7.',
    ],
    filename: `roteiro_${nome.replace(/\s+/g, '_')}.pdf`,
  });
  const xlsx = () => exportXLSX([{
    name: 'Roteiro', rows: DAYS.flatMap((d) => plan[d].map((id, i) => ({ d, i, c: get(id) }))),
    cols: [
      { header: 'Dia', value: (r: any) => DAY_LABEL[r.d as DayKey] }, { header: 'Ordem', value: (r: any) => r.i + 1 },
      { header: 'Código', value: (r: any) => r.c.id }, { header: 'Cliente', value: (r: any) => r.c.nome }, { header: 'Fantasia', value: (r: any) => r.c.fantasia },
      { header: 'CNPJ/CPF', value: (r: any) => formatDoc(r.c.doc) }, { header: 'Endereço', value: (r: any) => r.c.endereco }, { header: 'Bairro', value: (r: any) => r.c.bairro },
      { header: 'Cidade', value: (r: any) => r.c.cidadeLabel }, { header: 'Média mensal', value: (r: any) => Math.round(r.c.media * 100) / 100 }, { header: 'Curva', value: (r: any) => r.c.curva },
      { header: 'Latitude', value: (r: any) => r.c.lat }, { header: 'Longitude', value: (r: any) => r.c.lon },
    ],
  }], `roteiro_${nome.replace(/\s+/g, '_')}`);

  return (
    <div className="space-y-4">
      <div className="glass flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[260px] flex-1">
          <label className="label">Promotor</label>
          <select className="input" value={promotor} onChange={(e) => setPromotor(e.target.value)}>
            <option value="">— Novo roteiro (sem promotor) —</option>
            {m.promotores.map((p) => <option key={p.nome} value={p.nome}>{p.nome}{p.semRoteiro ? ' (sem roteiro)' : ''}</option>)}
          </select>
        </div>
        <div className="w-44">
          <label className="label">Raio máximo: {raio} km</label>
          <input type="range" min={1} max={30} value={raio} onChange={(e) => setRaio(Number(e.target.value))} className="w-full accent-brand-600" />
        </div>
        <div className="min-w-[180px]">
          <label className="label">Candidatos</label>
          <select className="input" value={escopo} onChange={(e) => setEscopo(e.target.value as typeof escopo)}>
            <option value="todos">Todos os clientes válidos</option>
            <option value="livres">Sem promotor + carteira atual</option>
            <option value="carteira">Somente carteira atual</option>
          </select>
        </div>
        <label className="flex items-center gap-2 pb-1.5 text-sm"><input type="checkbox" className="accent-brand-600" checked={allowCPF} onChange={(e) => setAllowCPF(e.target.checked)} /> Aceitar CPF</label>
        <label className="flex items-center gap-2 pb-1.5 text-sm"><input type="checkbox" className="accent-brand-600" checked={multiDia} onChange={(e) => setMultiDia(e.target.checked)} /> Cliente em vários dias</label>
        <div className="flex flex-wrap gap-2">
          {prom && !prom.semRoteiro && <button className="btn-outline" onClick={importar}><Import size={15} /> Importar agenda atual</button>}
          <button className="btn-outline" onClick={() => { save(emptyPlan()); setMsg(''); }}><RotateCcw size={15} /> Limpar</button>
          <button className="btn-outline" onClick={xlsx} disabled={!tot.n}><FileSpreadsheet size={15} /> Excel</button>
          <button className="btn-primary" onClick={pdf} disabled={!tot.n}><Download size={15} /> PDF Dilnor</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge tone="brand">Máx. {MAX_DIA} clientes/dia</Badge>
        <Badge tone={raio === 10 ? 'brand' : 'amber'}>Raio {raio} km{raio !== 10 ? ' (padrão 10)' : ''}</Badge>
        <Badge tone="brand">Score = Faturamento ÷ (1 + Distância)</Badge>
        <Badge tone="slate">Excluídos pela validação: {excl.doc} documento · {excl.venda} sem venda · {excl.bloq} bloqueados · {excl.coord} sem coordenada</Badge>
      </div>
      {msg && <Info tone="amber">{msg}</Info>}

      {/* Dias */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {stats.map((s) => (
          <button key={s.d} onClick={() => setDia(s.d)}
            className={`glass p-3 text-left transition ${dia === s.d ? 'ring-2 ring-offset-0' : 'opacity-80 hover:opacity-100'}`} style={dia === s.d ? { boxShadow: `0 0 0 2px ${DAY_COLORS[s.d]}` } : undefined}>
            <div className="flex items-center justify-between text-sm font-semibold"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: DAY_COLORS[s.d] }} />{DAY_SHORT[s.d]}</span><span className={s.n >= MAX_DIA ? 'text-red-600' : 'text-slate-500'}>{s.n}/{MAX_DIA}</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-1.5 rounded-full" style={{ width: `${(s.n / MAX_DIA) * 100}%`, background: DAY_COLORS[s.d] }} /></div>
            <div className="mt-1 text-[11px] text-slate-500">{fmtKm(s.km)} · {fmtBRLc(s.media)}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-3" title={`${DAY_LABEL[dia]} · ${dayIds.length}/${MAX_DIA}`} sub="Sequência de visitas"
          actions={<button className="btn-ghost px-2 py-1 text-xs" disabled={dayIds.length < 3} onClick={() => optimizeDay(dia)} title="Otimizar ordem (2-opt)"><Wand2 size={14} /> Otimizar</button>}>
          <ol className="space-y-2">
            {dayIds.map((id, i) => {
              const c = get(id); const prev = i ? get(dayIds[i - 1]) : null;
              return (
                <li key={id} className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-white/60 p-2 dark:bg-slate-900/50" onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)}>
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: DAY_COLORS[dia] }}>{i + 1}</span>
                  <div className="min-w-0 flex-1 text-[12px]">
                    <div className="truncate font-semibold">{c.fantasia || c.nome}</div>
                    <div className="truncate text-slate-500">{c.cidadeLabel} · {fmtBRLc(c.media)}/mês</div>
                    {prev && <div className="text-[10.5px] text-slate-400">{fmtKm(haversine(prev.lat!, prev.lon!, c.lat!, c.lon!))} do anterior</div>}
                  </div>
                  <div className="flex flex-col">
                    <button className="text-slate-400 hover:text-slate-700" onClick={() => move(dia, i, -1)} aria-label="Subir"><ArrowUp size={13} /></button>
                    <button className="text-slate-400 hover:text-slate-700" onClick={() => move(dia, i, 1)} aria-label="Descer"><ArrowDown size={13} /></button>
                  </div>
                  <button className="text-slate-400 hover:text-red-600" onClick={() => remove(dia, id)} aria-label="Remover"><X size={15} /></button>
                </li>
              );
            })}
            {!dayIds.length && <li className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500 dark:border-slate-700">Escolha o primeiro cliente na lista de candidatos ou clique em um ponto laranja no mapa.</li>}
          </ol>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary flex-1 justify-center" onClick={autoFill} disabled={full}><Sparkles size={15} /> Auto-completar</button>
            {dayIds.length > 0 && <button className="btn-outline" onClick={() => save({ ...plan, [dia]: [] })}><Trash2 size={15} /></button>}
          </div>
        </Card>

        <Card className="xl:col-span-5" bodyClass="p-2" title="Mapa do roteiro" sub={anterior ? `Raio de ${raio} km a partir de ${anterior.fantasia || anterior.nome}` : prom ? 'Primeiro cliente: candidatos ordenados pela proximidade ao centroide da carteira' : 'Primeiro cliente: candidatos por faturamento'}>
          <MapView points={map.points} lines={map.lines} circles={map.circles} highlightId={hover} onPointClick={(id) => { if (!id.includes('~') && !dayIds.includes(id)) add(id); }} height={540} fitKey={`${promotor}|${dia}|${dayIds.length}`} />
        </Card>

        <Card className="xl:col-span-4" title={`Candidatos (${cands.length})`} sub={full ? 'Dia completo' : anterior ? `Até ${raio} km do último cliente` : 'Sem restrição de raio para o primeiro cliente'}>
          <input className="input mb-2" placeholder="Filtrar candidatos…" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="scroll-thin max-h-[470px] space-y-1.5 overflow-y-auto pr-1">
            {cands.slice(0, 120).map((x, i) => (
              <li key={x.c.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white/50 p-2 text-[12px] hover:border-accent-400 dark:bg-slate-900/40" onMouseEnter={() => setHover(x.c.id)} onMouseLeave={() => setHover(null)}>
                <span className="w-5 text-right text-[10px] text-slate-400">{i + 1}</span>
                <CurvaBadge c={x.c.curva} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{x.c.fantasia || x.c.nome}</div>
                  <div className="truncate text-slate-500">{x.c.cidadeLabel} · {fmtBRLc(x.c.media)}/mês{x.dist != null && ` · ${fmtKm(x.dist)}`}</div>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {!x.c.inRoteiro && <Badge tone="amber">sem promotor</Badge>}
                    {x.c.promotores.length > 0 && prom && !x.c.promotores.includes(prom.nome) && <Badge tone="slate">{x.c.promotores[0].split(' ')[0]}</Badge>}
                    {x.c.rotaNova && <Badge tone="violet">{x.c.rotaNova}</Badge>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="num text-[10px] text-slate-400">score</div>
                  <div className="num font-bold">{fmtBRLc(x.score)}</div>
                </div>
                <button className="btn-primary p-1.5" disabled={full} onClick={() => add(x.c.id)} aria-label="Adicionar"><Plus size={14} /></button>
              </li>
            ))}
            {!cands.length && <li className="p-4 text-center text-xs text-slate-500">Nenhum candidato atende às regras. Aumente o raio ou mude o último cliente.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
