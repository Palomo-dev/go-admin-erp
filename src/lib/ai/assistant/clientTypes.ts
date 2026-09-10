/**
 * Tipos que cruzan la frontera servidor → cliente en el asistente.
 *
 * Nota importante de seguridad: aquí ya NO viajan `organizationId`, `userId` ni
 * `userRole`. La propuesta vive en `ai_agent_actions` del lado del servidor y el
 * cliente solo conoce su `id`; al confirmar manda ese id y, como mucho, las
 * correcciones que el usuario hizo sobre los campos declarados en el esquema.
 * Ese es el cambio que cierra C1 y C2 del plan.
 */

import type { ActionFieldDef, ActionRisk, AIActionType } from './actionCatalog';

export type { ActionFieldDef, ActionRisk, AIActionType };

export interface PendingAction {
  /** uuid de `ai_agent_actions`. Es lo único que el cliente devuelve. */
  id: string;
  type: AIActionType;
  title: string;
  description: string;
  risk: ActionRisk;
  fields: ActionFieldDef[];
  /** ISO. Pasada esta hora la propuesta ya no se puede confirmar. */
  expiresAt: string;
}

export interface DynamicOptions {
  categories: Array<{ value: string; label: string }>;
  suppliers: Array<{ value: string; label: string }>;
  customers: Array<{ value: string; label: string }>;
  branches: Array<{ value: string; label: string }>;
}

export const EMPTY_DYNAMIC_OPTIONS: DynamicOptions = {
  categories: [],
  suppliers: [],
  customers: [],
  branches: [],
};

/** Qué lista de opciones alimenta cada campo `select` del catálogo. */
export const FIELD_OPTION_SOURCE: Record<string, keyof DynamicOptions> = {
  category_id: 'categories',
  parent_id: 'categories',
  supplier_id: 'suppliers',
  customer_id: 'customers',
  branch_id: 'branches',
  from_branch_id: 'branches',
  to_branch_id: 'branches',
};
