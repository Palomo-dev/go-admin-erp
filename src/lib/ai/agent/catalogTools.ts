/**
 * GO Assistant — puente entre el catálogo de acciones de F0 y las herramientas
 * de F1.
 *
 * Las 16 acciones de `ACTION_CATALOG` ya declaran nombre, riesgo, permisos,
 * módulo, disponibilidad y esquema de campos. Volver a escribir todo eso como
 * `ToolDefinition` a mano habría creado dos fuentes de verdad que divergen en
 * semanas — el mismo error que este proyecto ya cometió con "el filtro gemelo".
 *
 * Así que se derivan. Cada acción del catálogo se convierte en una herramienta
 * cuyo `preview()` construye la tarjeta y cuyo `execute()` llama a
 * `aiActionsService`, que es quien conoce el esquema real.
 *
 * F2 añadirá herramientas que NO son acciones de catálogo (ventas, compras,
 * ajustes documentados) apoyándose en los servicios existentes.
 */

import {
  ACTION_CATALOG,
  getActionSchema,
  sanitizeActionFields,
  type ActionDefinition,
  type ActionFieldDef,
  type AIActionType,
} from '@/lib/ai/assistant/actionCatalog';
import { aiActionsService } from '@/lib/services/aiActionsService';
import type {
  JsonSchemaObject,
  JsonSchemaProperty,
  ToolContext,
  ToolDefinition,
  ToolPreview,
  ToolResult,
} from './types';

/**
 * Traduce un campo del catálogo a una propiedad de JSON Schema.
 *
 * Los `select` con opciones fijas se declaran como `enum` para que el modelo no
 * invente valores; los que se rellenan por API (categorías, sucursales…) se
 * declaran como texto libre y su pertenencia la valida el ejecutor contra la
 * organización.
 */
function fieldToSchema(field: ActionFieldDef): JsonSchemaProperty {
  const description = field.placeholder ? `${field.label}. ${field.placeholder}` : field.label;

  switch (field.type) {
    case 'number':
      return { type: 'number', description };
    case 'boolean':
      return { type: 'boolean', description };
    case 'select':
      if (field.options && field.options.length > 0) {
        return { type: 'string', description, enum: field.options.map((o) => o.value) };
      }
      return { type: 'string', description };
    case 'date':
      return { type: 'string', description: `${description} (formato YYYY-MM-DD)` };
    default:
      return { type: 'string', description };
  }
}

function buildParameters(type: AIActionType): JsonSchemaObject {
  const fields = getActionSchema(type);
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];

  for (const field of fields) {
    properties[field.name] = fieldToSchema(field);
    if (field.required) required.push(field.name);
  }

  return {
    type: 'object',
    properties,
    required,
    // El modelo no puede añadir claves: la lista blanca lo filtraría igual, pero
    // decírselo al proveedor evita el viaje de ida y vuelta.
    additionalProperties: false,
  };
}

function formatValue(field: ActionFieldDef, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field.type === 'boolean') return value ? 'Sí' : 'No';
  if (field.type === 'select' && field.options) {
    const match = field.options.find((o) => o.value === String(value));
    if (match) return match.label;
  }
  return String(value);
}

/**
 * Coste estimado en créditos de una acción.
 *
 * De momento es fijo por riesgo: lo que cuesta es el turno del modelo, no la
 * escritura. Se muestra en la tarjeta antes de confirmar (§10.6) para que no
 * haya sorpresas. F4 lo afina cuando entren la visión y la carga masiva, que sí
 * tienen coste variable por documento.
 */
function estimateCredits(def: ActionDefinition): number {
  return def.risk === 'high' ? 2 : 1;
}

/**
 * `preview()` de una acción de catálogo.
 *
 * Invariante 1 del contrato: no escribe nada. Aquí es literal — solo formatea
 * los argumentos y comprueba qué falta. Las validaciones que sí consultan la
 * base (que la categoría exista en la organización, por ejemplo) las hace
 * `execute()`, dentro de la transacción, que es donde tienen valor.
 */
function buildPreview(def: ActionDefinition, args: Record<string, unknown>): ToolPreview {
  const fields = getActionSchema(def.type);
  const lines = fields
    .filter((f) => args[f.name] !== undefined && args[f.name] !== null && args[f.name] !== '')
    .map((f) => ({ label: f.label, value: formatValue(f, args[f.name]) }));

  const faltan = aiActionsService.missingRequiredFields(def.type, args);
  const warnings = faltan.length > 0 ? [`Falta por definir: ${faltan.join(', ')}.`] : [];

  // El resumen tiene que poder leerse en voz alta (§5.5.2).
  const detalle = lines
    .slice(0, 3)
    .map((l) => `${l.label.toLowerCase()} ${l.value}`)
    .join(', ');
  const summary = detalle ? `${def.label}: ${detalle}.` : `${def.label}.`;

  return {
    title: def.label,
    summary,
    lines,
    warnings,
    estimatedCredits: estimateCredits(def),
    // Todo lo que hoy hace el catálogo se puede revertir (F3 conecta el botón).
    reversible: true,
  };
}

/** Convierte una acción del catálogo en una herramienta del agente. */
export function toolFromAction(def: ActionDefinition): ToolDefinition<Record<string, unknown>> {
  return {
    name: def.type,
    description: def.description,
    parameters: buildParameters(def.type),
    risk: def.risk,
    permissions: def.permissions,
    minLevel: def.minLevel,
    requiredModule: def.requiredModule,
    // Ninguna acción de escritura se ofrece por voz mientras no exista la
    // confirmación verbal (F5). El plan además bloquea `high` en voz por
    // defecto; aquí se es más estricto porque todavía no hay canal de voz.
    availableInVoice: false,

    parseArgs(raw: unknown): Record<string, unknown> | null {
      if (!raw || typeof raw !== 'object') return null;
      // Se reutiliza el mismo saneado que usan `/chat` y `/execute-action`: el
      // modelo es una fuente no fiable más, como el cliente.
      const entries = Object.entries(raw as Record<string, unknown>).map(([name, value]) => ({
        name,
        value,
      }));
      return sanitizeActionFields(def.type, entries);
    },

    async preview(_ctx: ToolContext, args: Record<string, unknown>): Promise<ToolPreview> {
      return buildPreview(def, args);
    },

    async execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
      const result = await aiActionsService.executeAction(def.type, args, {
        supabase: ctx.supabase,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        branchId: ctx.branchId,
      });

      return {
        ok: result.success,
        message: result.message,
        entity: result.entity,
        undo: result.undo,
        data: result.data,
        errorCode: result.errorCode,
      };
    },
  };
}

/**
 * Campos de la tarjeta de confirmación para una herramienta de catálogo.
 *
 * El evento `action` del stream tiene que llevarlos: la tarjeta los muestra y el
 * usuario puede corregirlos antes de confirmar. Devuelve `null` si la
 * herramienta no es una acción de catálogo (las de consulta no proponen nada).
 */
export function actionFieldsFor(
  toolName: string,
  args: Record<string, unknown>
): ActionFieldDef[] | null {
  if (!Object.prototype.hasOwnProperty.call(ACTION_CATALOG, toolName)) return null;
  const type = toolName as AIActionType;
  return getActionSchema(type).map((field) => ({
    ...field,
    value: args[field.name] !== undefined ? args[field.name] : field.value,
  }));
}

/** Todas las acciones del catálogo que están implementadas, como herramientas. */
export function catalogTools(): Array<ToolDefinition<Record<string, unknown>>> {
  return Object.values(ACTION_CATALOG)
    .filter((def) => def.available)
    .map(toolFromAction);
}
