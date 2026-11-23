'use client';
// Mapa de ruas real (Leaflet + tiles OSM/Esri/OpenTopoMap, sem API key), com clusterização, destaque sincronizado,
// satélite híbrido com rótulos, fallback automático de provedor e geocodificação.
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import L from './leaflet-setup';
import 'leaflet.markercluster';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, ScaleControl, useMap } from 'react-leaflet';
import { Loader2, MapPin, Search, X } from 'lucide-react';
import type { MapProps, MapPoint } from './types';
import { BASEMAPS, DEFAULT_DARK, DEFAULT_LIGHT, LABELS_PANE } from './basemaps';

const RECIFE: [number, number] = [-8.06, -35.0];

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
export { esc as escapeHtml };

function makeIcon(p: MapPoint, hl = false) {
  const cls = `pin ${p.shape === 'dot' ? 'dot' : ''} ${p.dim ? 'dim' : ''} ${hl ? 'hl' : ''}`;
  const size = p.shape === 'dot' ? 14 : 26;
  return L.divIcon({
    className: '',
    html: `<div class="${cls}" style="--c:${p.color}"><span>${p.label ? esc(p.label) : ''}</span></div>`,
    iconSize: [size, size],
    iconAnchor: p.shape === 'dot' ? [size / 2, size / 2] : [size / 2, size + 2],
    popupAnchor: [0, p.shape === 'dot' ? -8 : -size],
  });
}

function PointsLayer({ points, cluster, highlightId, focusId, onPointClick, fitKey }: Pick<MapProps, 'points' | 'cluster' | 'highlightId' | 'focusId' | 'onPointClick' | 'fitKey'>) {
  const map = useMap();
  const groupRef = useRef<L.LayerGroup | L.MarkerClusterGroup | null>(null);
  const markersRef = useRef(new Map<string, { m: L.Marker; p: MapPoint }>());
  const prevHl = useRef<string | null>(null);
  const clickRef = useRef(onPointClick);
  clickRef.current = onPointClick;

  // (re)constrói camada
  useEffect(() => {
    const group = cluster
      ? L.markerClusterGroup({
          showCoverageOnHover: false,
          spiderfyOnMaxZoom: true,
          maxClusterRadius: 48,
          chunkedLoading: true,
          iconCreateFunction: (c) => {
            const n = c.getChildCount();
            const cls = n >= 50 ? 'lg' : n >= 15 ? 'md' : '';
            return L.divIcon({ html: `<div class="cluster-badge ${cls}">${n}</div>`, className: '', iconSize: [44, 44] });
          },
        })
      : L.layerGroup();
    const ms = new Map<string, { m: L.Marker; p: MapPoint }>();
    for (const p of points) {
      const m = L.marker([p.lat, p.lon], { icon: makeIcon(p), title: p.title, riseOnHover: true, keyboard: false });
      if (p.popup) m.bindPopup(p.popup, { maxWidth: 320, autoPan: true });
      m.on('click', () => clickRef.current?.(p.id));
      ms.set(p.id, { m, p });
      group.addLayer(m);
    }
    group.addTo(map);
    groupRef.current = group;
    markersRef.current = ms;
    prevHl.current = null;
    return () => { group.remove(); };
  }, [map, points, cluster]);

  // Enquadrar
  useEffect(() => {
    if (!points.length) return;
    const b = L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number]));
    if (b.isValid()) map.fitBounds(b, { padding: [36, 36], maxZoom: 15, animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey]);

  // Destaque (hover na tabela) — sem mover o mapa
  useEffect(() => {
    const prev = prevHl.current ? markersRef.current.get(prevHl.current) : null;
    if (prev) { prev.m.setIcon(makeIcon(prev.p)); prev.m.setZIndexOffset(0); prev.m.closePopup(); }
    document.querySelectorAll('.cluster-badge.hl').forEach((el) => el.classList.remove('hl'));
    prevHl.current = null;
    if (!highlightId) return;
    const cur = markersRef.current.get(highlightId);
    if (!cur) return;
    prevHl.current = highlightId;
    const g = groupRef.current as L.MarkerClusterGroup;
    const parent = cluster && g.getVisibleParent ? g.getVisibleParent(cur.m) : cur.m;
    if (parent && parent !== cur.m) {
      (parent as unknown as { _icon?: HTMLElement })._icon?.querySelector('.cluster-badge')?.classList.add('hl');
      return;
    }
    cur.m.setIcon(makeIcon(cur.p, true));
    cur.m.setZIndexOffset(1000);
    if (map.getBounds().contains(cur.m.getLatLng())) {
      const popup = cur.m.getPopup();
      if (popup) { popup.options.autoPan = false; cur.m.openPopup(); popup.options.autoPan = true; }
    }
  }, [highlightId, map, cluster, points]);

  // Foco (clique na tabela) — voa até o pino e abre o popup
  useEffect(() => {
    if (!focusId) return;
    const cur = markersRef.current.get(focusId.split('#')[0]);
    if (!cur) return;
    const g = groupRef.current as L.MarkerClusterGroup;
    if (cluster && g.zoomToShowLayer) g.zoomToShowLayer(cur.m, () => cur.m.openPopup());
    else { map.flyTo(cur.m.getLatLng(), Math.max(map.getZoom(), 14), { duration: 0.6 }); setTimeout(() => cur.m.openPopup(), 650); }
  }, [focusId, map, cluster]);

  return null;
}

function VectorLayer({ lines, circles }: Pick<MapProps, 'lines' | 'circles'>) {
  const map = useMap();
  useEffect(() => {
    const g = L.layerGroup();
    (lines ?? []).forEach((l) => {
      if (l.latlngs.length < 2) return;
      L.polyline(l.latlngs, { color: l.color, weight: l.weight ?? 3, opacity: l.opacity ?? 0.85, dashArray: l.dashed ? '6 6' : undefined, interactive: false }).addTo(g);
    });
    (circles ?? []).forEach((c) => {
      if (c.radiusM) L.circle([c.lat, c.lon], { radius: c.radiusM, color: c.color, weight: 1.5, fillOpacity: c.fillOpacity ?? 0.06, dashArray: '5 5', interactive: false }).addTo(g);
      else L.marker([c.lat, c.lon], { icon: L.divIcon({ className: '', html: `<div class="centroid-icon" style="background:${c.color}"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: !!c.title, title: c.title }).addTo(g);
    });
    g.addTo(map);
    return () => { g.remove(); };
  }, [map, lines, circles]);
  return null;
}

/** Camadas base com seletor, satélite híbrido (rótulos sempre ligados) e fallback automático entre provedores */
function BaseLayers({ dark, onNotice }: { dark?: boolean; onNotice: (msg: string) => void }) {
  const map = useMap();
  const noticeRef = useRef(onNotice);
  noticeRef.current = onNotice;
  useEffect(() => {
    if (!map.getPane(LABELS_PANE)) {
      const pane = map.createPane(LABELS_PANE);
      pane.style.zIndex = '450';
      pane.style.pointerEvents = 'none';
    }
    const storeKey = `dilnor-basemap-${dark ? 'dark' : 'light'}`;
    const entries = new Map<string, { name: string; fallback?: string; group: L.LayerGroup; main: L.TileLayer }>();
    const byName = new Map<string, string>();
    const baseLayers: Record<string, L.Layer> = {};
    for (const def of BASEMAPS) {
      const layers = def.create();
      const group = L.layerGroup(layers);
      entries.set(def.id, { name: def.name, fallback: def.fallback, group, main: layers[0] });
      byName.set(def.name, def.id);
      baseLayers[def.name] = group;
    }
    const control = L.control.layers(baseLayers, undefined, { position: 'topright' }).addTo(map);
    const failed = new Set<string>();
    let active = '';
    let unwatch = () => {};

    const watch = (id: string) => {
      unwatch();
      const e = entries.get(id)!;
      let ok = 0, err = 0;
      const onLoad = () => { ok++; };
      const onErr = () => {
        err++;
        if (err >= 6 && ok === 0) {
          failed.add(id);
          // percorre a cadeia de fallback sem repetir provedores (evita laço quando todos falham)
          const seen = new Set<string>([id]);
          let next = e.fallback;
          while (next && (failed.has(next) || !entries.has(next)) && !seen.has(next)) { seen.add(next); next = entries.get(next)?.fallback; }
          if (next && entries.has(next) && !failed.has(next) && next !== active) {
            noticeRef.current(`“${e.name}” indisponível na sua rede — alternado para “${entries.get(next)!.name}”.`);
            activate(next);
          }
        }
      };
      e.main.on('tileload', onLoad).on('tileerror', onErr);
      unwatch = () => { e.main.off('tileload', onLoad).off('tileerror', onErr); };
    };
    const activate = (id: string) => {
      if (active && entries.has(active)) map.removeLayer(entries.get(active)!.group);
      active = id;
      map.addLayer(entries.get(id)!.group);
      watch(id);
    };
    const onUserChange = (ev: L.LayersControlEvent) => {
      const id = byName.get(ev.name);
      if (!id) return;
      active = id;
      watch(id);
      try { localStorage.setItem(storeKey, id); } catch { /* ignore */ }
    };
    map.on('baselayerchange', onUserChange);

    let initial = dark ? DEFAULT_DARK : DEFAULT_LIGHT;
    try { const saved = localStorage.getItem(storeKey); if (saved && entries.has(saved)) initial = saved; } catch { /* ignore */ }
    activate(entries.has(initial) ? initial : BASEMAPS[0].id);

    return () => {
      unwatch();
      map.off('baselayerchange', onUserChange);
      control.remove();
      entries.forEach((e) => map.removeLayer(e.group));
    };
  }, [map, dark]);
  return null;
}

function MapRefBridge({ onMap }: { onMap: (m: L.Map) => void }) {
  const map = useMap();
  useEffect(() => { onMap(map); }, [map, onMap]);
  return null;
}

/** Geocodificação (OpenStreetMap Nominatim — sem chave, uso moderado) */
function Geocoder({ map }: { map: L.Map | null }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ display_name: string; lat: string; lon: string }[]>([]);
  const markerRef = useRef<L.Marker | null>(null);
  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=br&accept-language=pt-BR&q=${encodeURIComponent(q)}`;
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      setRes(r.ok ? await r.json() : []);
    } catch { setRes([]); } finally { setBusy(false); }
  };
  const go = (r: { display_name: string; lat: string; lon: string }) => {
    if (!map) return;
    const ll: [number, number] = [Number(r.lat), Number(r.lon)];
    markerRef.current?.remove();
    markerRef.current = L.marker(ll, { icon: makeIcon({ id: 'geo', lat: ll[0], lon: ll[1], color: '#F28C28', title: '', label: '★' }) })
      .bindPopup(`<b>Endereço localizado</b><br/>${esc(r.display_name)}`).addTo(map).openPopup();
    map.flyTo(ll, 16, { duration: 0.8 });
    setRes([]);
  };
  return (
    <div className="absolute left-14 top-3 z-[600] w-[min(320px,calc(100%-120px))]">
      <div className="flex items-center gap-1 rounded-xl bg-white/95 p-1 shadow-lg ring-1 ring-black/5 dark:bg-slate-900/95 dark:ring-white/10">
        <MapPin size={15} className="ml-1.5 shrink-0 text-accent-500" />
        <input className="min-w-0 flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-slate-400 dark:text-slate-100"
          placeholder="Buscar endereço (geocodificação)…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
        {q && <button className="rounded p-1 text-slate-400 hover:text-slate-600" onClick={() => { setQ(''); setRes([]); markerRef.current?.remove(); }} aria-label="Limpar"><X size={14} /></button>}
        <button className="rounded-lg bg-brand-600 p-1.5 text-white hover:bg-brand-700" onClick={search} aria-label="Buscar">{busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}</button>
      </div>
      {res.length > 0 && (
        <ul className="mt-1 max-h-60 overflow-auto rounded-xl bg-white/95 py-1 text-xs shadow-lg ring-1 ring-black/5 dark:bg-slate-900/95 dark:text-slate-200">
          {res.map((r, i) => (
            <li key={i}><button className="w-full px-3 py-1.5 text-left hover:bg-brand-50 dark:hover:bg-slate-800" onClick={() => go(r)}>{r.display_name}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function LeafletMap(props: MapProps) {
  const { points, height = 480, className = '', dark, geocoder = true } = props;
  const [map, setMap] = useState<L.Map | null>(null);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 7000);
  }, []);
  const center = useMemo<[number, number]>(() => (points[0] ? [points[0].lat, points[0].lon] : RECIFE), [points]);

  // Leaflet precisa recalcular o tamanho quando o container muda (menu retrátil, painéis)
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!map || !wrapRef.current) return;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [map]);

  return (
    <div ref={wrapRef} className={`relative isolate overflow-hidden rounded-2xl ${className}`} style={{ height }}>
      <MapContainer center={center} zoom={10} zoomSnap={0.5} wheelPxPerZoomLevel={90} preferCanvas className="h-full w-full" attributionControl>
        <BaseLayers dark={dark} onNotice={showNotice} />
        <ScaleControl position="bottomleft" imperial={false} />
        <VectorLayer lines={props.lines} circles={props.circles} />
        <PointsLayer points={points} cluster={props.cluster} highlightId={props.highlightId} focusId={props.focusId} onPointClick={props.onPointClick} fitKey={props.fitKey ?? String(points.length)} />
        <MapRefBridge onMap={setMap} />
      </MapContainer>
      {geocoder && <Geocoder map={map} />}
      {notice && (
        <div className="pointer-events-none absolute bottom-8 left-1/2 z-[650] max-w-[90%] -translate-x-1/2 rounded-lg bg-slate-900/90 px-3 py-1.5 text-center text-xs text-white shadow-lg">{notice}</div>
      )}
      {props.overlay}
    </div>
  );
}
