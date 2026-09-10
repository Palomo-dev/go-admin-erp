import type { CustomerDetails } from '@/components/crm/oportunidades/types';
import type { OpportunityFull, UseOpportunityDataResult } from '../../hooks/useOpportunityData';

/** Contrato común de las pestañas del drawer y del detalle (FASE-09 §5.2). */
export interface DrawerTabProps {
  opportunity: OpportunityFull;
  customer: CustomerDetails | null;
  data: UseOpportunityDataResult;
  active: boolean;
}

export type DrawerTab = 'resumen' | 'actividad' | 'tareas' | 'notas' | 'documentos' | 'ia';

export const DRAWER_TABS: Array<{ id: DrawerTab; label: string }> = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'actividad', label: 'Actividad' },
  { id: 'tareas', label: 'Tareas' },
  { id: 'notas', label: 'Notas' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'ia', label: 'IA' },
];
