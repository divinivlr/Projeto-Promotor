import type { ReactNode } from 'react';

export interface MapPoint {
  id: string;
  lat: number;
  lon: number;
  color: string;
  title: string;
  label?: string;
  popup?: string; // HTML (já escapado)
  dim?: boolean;
  shape?: 'pin' | 'dot';
}
export interface MapLine { id: string; latlngs: [number, number][]; color: string; dashed?: boolean; weight?: number; opacity?: number }
export interface MapCircle { lat: number; lon: number; radiusM?: number; color: string; title?: string; fillOpacity?: number }

export interface MapProps {
  points: MapPoint[];
  lines?: MapLine[];
  circles?: MapCircle[];
  cluster?: boolean;
  highlightId?: string | null;
  focusId?: string | null;
  onPointClick?: (id: string) => void;
  fitKey?: string;
  height?: number | string;
  className?: string;
  dark?: boolean;
  geocoder?: boolean;
  overlay?: ReactNode;
}
