// Garante que o plugin markercluster encontre o L global antes de ser avaliado.
import L from 'leaflet';
if (typeof window !== 'undefined') (window as unknown as { L: typeof L }).L = L;
export default L;
