// Mapas base 100% gratuitos e SEM API key (OpenStreetMap, Esri, OpenTopoMap) + Mapbox opcional via env.
// CARTO foi removido: os servidores passaram a responder com marca d'água "API KEY REQUIRED".
import L from './leaflet-setup';

const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
const ESRI_ATTR = 'Tiles &copy; <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>';
const ESRI_SAT_ATTR = 'Imagens &copy; Esri, Maxar, Earthstar Geographics, GIS User Community';
const TOPO_ATTR = `${OSM_ATTR}, SRTM | Estilo &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)`;

const MAP_KEY = process.env.NEXT_PUBLIC_MAPS_API_KEY;
const MAP_PROVIDER = (process.env.NEXT_PUBLIC_MAPS_PROVIDER || 'mapbox').toLowerCase();

const esri = (service: string) => `https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`;

/** Pane próprio para rótulos/linhas acima das imagens e abaixo dos pinos */
export const LABELS_PANE = 'dilnor-labels';

// O navegador não permite definir User-Agent; a identificação exigida pela política de uso do OSM
// é feita pelo cabeçalho Referer, garantido explicitamente com esta política.
const common: L.TileLayerOptions = {
  maxZoom: 20,
  crossOrigin: true,
  referrerPolicy: 'strict-origin-when-cross-origin',
  updateWhenIdle: false,
  keepBuffer: 4,
};

export interface BaseMapDef {
  id: string;
  name: string;
  /** cria a(s) camada(s); a primeira é a principal (monitorada para fallback) */
  create: () => L.TileLayer[];
  fallback?: string; // id do próximo provedor se este falhar
}

export const BASEMAPS: BaseMapDef[] = [
  {
    id: 'osm',
    name: 'Ruas · OpenStreetMap',
    create: () => [L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { ...common, maxNativeZoom: 19, attribution: OSM_ATTR })],
    fallback: 'esri-streets',
  },
  {
    id: 'esri-streets',
    name: 'Ruas detalhadas · Esri',
    create: () => [L.tileLayer(esri('World_Street_Map'), { ...common, maxNativeZoom: 19, attribution: ESRI_ATTR })],
    fallback: 'topo',
  },
  {
    id: 'hybrid',
    name: 'Satélite híbrido (ruas e cidades)',
    create: () => [
      L.tileLayer(esri('World_Imagery'), { ...common, maxNativeZoom: 19, attribution: ESRI_SAT_ATTR }),
      L.tileLayer(esri('Reference/World_Transportation'), { ...common, maxNativeZoom: 19, pane: LABELS_PANE }),
      L.tileLayer(esri('Reference/World_Boundaries_and_Places'), { ...common, maxNativeZoom: 19, pane: LABELS_PANE }),
    ],
    fallback: 'esri-streets',
  },
  {
    id: 'sat',
    name: 'Satélite (sem rótulos)',
    create: () => [L.tileLayer(esri('World_Imagery'), { ...common, maxNativeZoom: 19, attribution: ESRI_SAT_ATTR })],
    fallback: 'hybrid',
  },
  {
    id: 'gray',
    name: 'Cinza claro · Esri',
    create: () => [
      L.tileLayer(esri('Canvas/World_Light_Gray_Base'), { ...common, maxNativeZoom: 16, attribution: ESRI_ATTR }),
      L.tileLayer(esri('Canvas/World_Light_Gray_Reference'), { ...common, maxNativeZoom: 16, pane: LABELS_PANE }),
    ],
    fallback: 'osm',
  },
  {
    id: 'dark',
    name: 'Escuro · Esri',
    create: () => [
      L.tileLayer(esri('Canvas/World_Dark_Gray_Base'), { ...common, maxNativeZoom: 16, attribution: ESRI_ATTR }),
      L.tileLayer(esri('Canvas/World_Dark_Gray_Reference'), { ...common, maxNativeZoom: 16, pane: LABELS_PANE }),
    ],
    fallback: 'osm',
  },
  {
    id: 'topo',
    name: 'Topográfico · OpenTopoMap',
    create: () => [L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { ...common, subdomains: 'abc', maxNativeZoom: 17, attribution: TOPO_ATTR })],
    fallback: 'gray',
  },
  ...(MAP_KEY && MAP_PROVIDER === 'mapbox'
    ? [
        {
          id: 'mapbox-streets',
          name: 'Ruas · Mapbox',
          create: () => [L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${MAP_KEY}`, { ...common, maxZoom: 22, attribution: '&copy; Mapbox &copy; OpenStreetMap' })],
          fallback: 'osm',
        },
        {
          id: 'mapbox-sat',
          name: 'Satélite · Mapbox',
          create: () => [L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${MAP_KEY}`, { ...common, maxZoom: 22, attribution: '&copy; Mapbox &copy; OpenStreetMap &copy; Maxar' })],
          fallback: 'hybrid',
        },
      ] as BaseMapDef[]
    : []),
];

export const DEFAULT_LIGHT = 'osm';
export const DEFAULT_DARK = 'dark';
