import type { Client, Curva } from './types';
import type { DayKey } from './utils';

export interface Filters {
  supervisor?: string;
  promotor?: string;
  cidade?: string;
  dia?: DayKey;
  curva?: Curva;
  status?: 'ativo' | 'bloqueado';
  ramo?: string;
  rota?: string;
}

export const FILTER_LABEL: Record<keyof Filters, string> = {
  supervisor: 'Supervisor', promotor: 'Promotor', cidade: 'Cidade', dia: 'Dia', curva: 'Curva',
  status: 'Status', ramo: 'Ramo', rota: 'Rota Nova',
};

export function applyFilters(list: Client[], f: Filters): Client[] {
  return list.filter((c) => {
    if (f.supervisor && !c.supervisores.includes(f.supervisor)) return false;
    if (f.promotor && !c.promotores.includes(f.promotor)) return false;
    if (f.cidade && c.cidadeLabel !== f.cidade) return false;
    if (f.dia && !(c.dias.includes(f.dia) || (!c.inRoteiro && c.diasNova.includes(f.dia)))) return false;
    if (f.curva && c.curva !== f.curva) return false;
    if (f.status === 'ativo' && c.bloqueado) return false;
    if (f.status === 'bloqueado' && !c.bloqueado) return false;
    if (f.ramo && c.ramoFmt !== f.ramo) return false;
    if (f.rota && c.rotaNova !== f.rota) return false;
    return true;
  });
}

export function activeFilterCount(f: Filters) {
  return Object.values(f).filter(Boolean).length;
}
