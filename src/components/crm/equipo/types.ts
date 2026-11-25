// Tipos compartidos de la pantalla Equipo comercial (los datos vienen de
// `/api/crm/teams/overview`, `/api/crm/teams/performance`,
// `/api/crm/assignment/config` y `/api/crm/territories`).

export type { EquipoVista, MiembroVista, VistaEquipos, VistaDesempeno } from '@/lib/services/crm/equipoComercialService';
export type { Previsualizacion } from '@/lib/services/crm/assignmentPreviewService';
export type { LeadAssignmentConfig, LeadAssignmentStrategy } from '@/lib/services/crm/leadAssignmentConfig';

export interface OpcionCatalogo {
  id: string;
  nombre: string;
}

export interface OrgMember {
  id: string;
  name: string;
  email?: string | null;
}

export interface Territory {
  id: string;
  name: string;
  criteria: Record<string, unknown> | null;
  is_active: boolean;
  sort_order?: number | null;
}
