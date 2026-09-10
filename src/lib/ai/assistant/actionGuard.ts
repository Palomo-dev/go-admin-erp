/**
 * GO Assistant — guarda de acciones.
 *
 * Decide, EN EL SERVIDOR, si un usuario concreto puede ejecutar una acción
 * concreta en su organización. Es lo que sustituye a
 * `canExecuteAction(type, userRole)` con el rol declarado por el cliente (C2).
 *
 * La regla del plan (§9.2): el permiso efectivo es la intersección de
 *
 *   nivel de la organización  ∩  permisos del usuario  ∩  módulos activos
 *
 * y una herramienta que el usuario no puede ejecutar **no se le ofrece al
 * modelo**. No se filtra la respuesta después: se filtra el catálogo antes, para
 * que el asistente nunca prometa algo que luego rechace.
 */

import {
  ACTION_CATALOG,
  ALL_ACTION_TYPES,
  getActionDefinition,
  type ActionDefinition,
  type AIActionType,
} from './actionCatalog';
import { hasAnyPermission, levelAtLeast, type AssistantCapabilities } from './capabilities';

export type DenyReason =
  | 'level_off'
  | 'level_too_low'
  | 'no_permission'
  | 'module_inactive'
  | 'not_implemented'
  | 'not_enabled';

export interface ActionDecision {
  allowed: boolean;
  reason?: DenyReason;
  /** Mensaje en español, decible al usuario. */
  message?: string;
}

const DENY_MESSAGES: Record<DenyReason, string> = {
  level_off:
    'El asistente de esta organización está en modo consulta: puedo explicarte cómo hacerlo, pero no ejecutarlo. Un administrador puede activarlo en la configuración.',
  level_too_low:
    'Esta operación necesita un nivel de asistente superior al que tiene activado la organización.',
  no_permission: 'Tu rol no tiene permiso para esta operación.',
  module_inactive: 'El módulo necesario para esto no está activo en el plan de esta organización.',
  not_implemented: 'Todavía no puedo hacer eso desde el chat.',
  not_enabled: 'Esta operación no está habilitada para esta organización.',
};

/**
 * Evalúa una acción. Devuelve el motivo del rechazo para que el asistente
 * pueda explicarlo en vez de responder un 403 mudo.
 */
export function evaluateAction(
  caps: AssistantCapabilities,
  type: AIActionType
): ActionDecision {
  const def: ActionDefinition | undefined = ACTION_CATALOG[type];
  if (!def) return deny('not_implemented');

  if (!def.available) {
    return { allowed: false, reason: 'not_implemented', message: def.unavailableReason ?? DENY_MESSAGES.not_implemented };
  }
  if (caps.level === 'off') return deny('level_off');
  if (!levelAtLeast(caps.level, def.minLevel)) return deny('level_too_low');
  if (caps.enabledTools && !caps.enabledTools.includes(type)) return deny('not_enabled');
  if (!hasAnyPermission(caps, def.permissions)) return deny('no_permission');

  // Los módulos solo se comprueban si se pudieron resolver: si la consulta a
  // `organization_modules` falla, no bloqueamos por una lista vacía —
  // "no sé" no puede significar "no".
  if (def.requiredModule && caps.activeModules.size > 0 && !caps.activeModules.has(def.requiredModule)) {
    return deny('module_inactive');
  }

  return { allowed: true };
}

function deny(reason: DenyReason): ActionDecision {
  return { allowed: false, reason, message: DENY_MESSAGES[reason] };
}

/** Acciones que este usuario sí puede ejecutar ahora mismo. */
export function listAllowedActions(caps: AssistantCapabilities): ActionDefinition[] {
  return ALL_ACTION_TYPES.filter((t) => evaluateAction(caps, t).allowed).map(getActionDefinition);
}

/**
 * Bloque para el prompt del sistema con lo que el asistente puede hacer AHORA.
 * Si no puede hacer nada, se lo decimos explícitamente para que no invente
 * ofertas que luego no podrá cumplir (§13, regla 5).
 */
export function describeAllowedActions(caps: AssistantCapabilities): string {
  const allowed = listAllowedActions(caps);
  if (allowed.length === 0) {
    return [
      '## ACCIONES DISPONIBLES',
      'Ninguna. En esta organización solo puedes explicar y guiar; no puedes ejecutar cambios.',
      'Si el usuario pide crear o modificar algo, explícale cómo hacerlo en el sistema y dile con franqueza que tú no puedes hacerlo por él.',
      'NO propongas bloques ```action bajo ninguna circunstancia.',
    ].join('\n');
  }

  const lines = allowed.map((a) => `- **${a.type}**: ${a.description}`);
  return ['## ACCIONES DISPONIBLES', ...lines].join('\n');
}
