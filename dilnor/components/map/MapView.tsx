'use client';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { useData } from '@/store/data';
import type { MapProps } from './types';

const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[240px] w-full items-center justify-center gap-2 rounded-2xl bg-slate-200/50 text-sm text-slate-500 dark:bg-slate-800/50">
      <Loader2 size={16} className="animate-spin" /> Carregando mapa…
    </div>
  ),
});

export default function MapView(props: MapProps) {
  const { theme } = useData();
  return <LeafletMap {...props} dark={theme === 'dark'} key={theme} />;
}
