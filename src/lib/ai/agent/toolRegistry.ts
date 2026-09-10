/**
 * GO Assistant — registro de herramientas.
 *
 * Una sola puerta para: registrar, filtrar por usuario y traducir al formato del
 * proveedor.
 *
 * La regla que gobierna este archivo (§9.2): **una herramienta que el usuario no
 * puede ejecutar no se le ofrece al modelo**. No se filtra la respuesta después;
 * se filtra el catálogo antes. Así el asistente nunca promete algo que luego
 * rechace, que es la peor experiencia posible.
 */

import { FORBIDDEN_ACTIONS } from '@/lib/ai/assistant/actionCatalog';
import { hasAnyPermission, levelAtLeast, type AssistantCapabilities } from '@/lib/ai/assistant/capabilities';
import { catalogTools } from './catalogTools';
import { CONSULTA_TOOLS } from './tools/consulta';
import { VENTAS_TOOLS } from './tools/ventas';
import { DOCUMENTOS_TOOLS } from './tools/documentos';
import { NAVEGACION_TOOLS } from './tools/navegacion';
import type { ToolDefinition } from './types';

/** Formato de herramienta de la API de chat completions de OpenAI. */
export interface ProviderTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Construye el registro.
 *
 * Se hace en una función y no en una constante de módulo porque el catálogo
 * deriva de `ACTION_CATALOG` y así el orden de importación no importa.
 */
function buildRegistry(): Map<string, ToolDefinition<never>> {
  const all = [
    ...(CONSULTA_TOOLS as unknown as Array<ToolDefinition<never>>),
    ...(VENTAS_TOOLS as unknown as Array<ToolDefinition<never>>),
    ...(DOCUMENTOS_TOOLS as unknown as Array<ToolDefinition<never>>),
    ...(NAVEGACION_TOOLS as unknown as Array<ToolDefinition<never>>),
    ...(catalogTools() as unknown as Array<ToolDefinition<never>>),
  ];

  const registry = new Map<string, ToolDefinition<never>>();
  const forbidden = new Set(FORBIDDEN_ACTIONS);

  for (const tool of all) {
    // §9.4: la lista negra es permanente y se comprueba al registrar, no al
    // ejecutar. Si alguien intenta registrar `delete_organization`, el proceso
    // no arranca — y hay un test que lo verifica antes de llegar aquí.
    if (forbidden.has(tool.name)) {
      throw new Error(
        `[GO Assistant] Intento de registrar una herramienta de la lista negra: "${tool.name}". ` +
          'Ver §9.4 del plan: no puede existir.'
      );
    }
    if (registry.has(tool.name)) {
      throw new Error(`[GO Assistant] Herramienta duplicada: "${tool.name}"`);
    }
    registry.set(tool.name, tool);
  }

  return registry;
}

let cached: Map<string, ToolDefinition<never>> | null = null;

export function getRegistry(): Map<string, ToolDefinition<never>> {
  if (!cached) cached = buildRegistry();
  return cached;
}

/** Solo para tests: fuerza a reconstruir el registro. */
export function resetRegistry(): void {
  cached = null;
}

export function getTool(name: string): ToolDefinition<never> | undefined {
  return getRegistry().get(name);
}

export type DenyReason =
  | 'level_off'
  | 'level_too_low'
  | 'no_permission'
  | 'module_inactive'
  | 'not_enabled'
  | 'voice_blocked';

export interface ToolDecision {
  allowed: boolean;
  reason?: DenyReason;
}

/**
 * ¿Puede este usuario, en este canal, usar esta herramienta?
 *
 * Mismo criterio que `actionGuard.evaluateAction` de la F0, extendido con el
 * canal. Se mantienen separados a propósito: `actionGuard` sigue gobernando el
 * camino de `/execute-action`, que es el que protege la escritura, y este
 * gobierna qué se le enseña al modelo. Que ambos denieguen es defensa en
 * profundidad, no duplicación.
 */
export function evaluateTool(
  caps: AssistantCapabilities,
  tool: ToolDefinition<never>,
  channel: 'text' | 'voice'
): ToolDecision {
  if (caps.level === 'off') return { allowed: false, reason: 'level_off' };
  if (!levelAtLeast(caps.level, tool.minLevel)) return { allowed: false, reason: 'level_too_low' };
  if (caps.enabledTools && !caps.enabledTools.includes(tool.name)) {
    return { allowed: false, reason: 'not_enabled' };
  }
  if (channel === 'voice' && !tool.availableInVoice) {
    return { allowed: false, reason: 'voice_blocked' };
  }
  if (!hasAnyPermission(caps, tool.permissions)) return { allowed: false, reason: 'no_permission' };

  // Los módulos solo se comprueban si se pudieron resolver: "no sé" no puede
  // significar "no".
  if (tool.requiredModule && caps.activeModules.size > 0 && !caps.activeModules.has(tool.requiredModule)) {
    return { allowed: false, reason: 'module_inactive' };
  }

  return { allowed: true };
}

/** Las herramientas que este usuario puede usar ahora mismo. */
export function resolveTools(
  caps: AssistantCapabilities,
  channel: 'text' | 'voice' = 'text'
): Array<ToolDefinition<never>> {
  return Array.from(getRegistry().values()).filter((t) => evaluateTool(caps, t, channel).allowed);
}

/** Traduce al formato que espera el proveedor. */
export function toProviderTools(tools: Array<ToolDefinition<never>>): ProviderTool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters as unknown as Record<string, unknown>,
    },
  }));
}
