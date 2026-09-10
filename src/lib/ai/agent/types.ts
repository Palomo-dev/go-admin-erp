/**
 * GO Assistant — contrato de herramienta.
 *
 * Este es el contrato que hace posible todo lo demás (§5.3 del plan). Se
 * escribe primero y no se negocia.
 *
 * Diferencia clave con la Fase 0: allí el modelo devolvía un bloque de texto
 * ```action que se parseaba con una expresión regular, y si escribía una coma
 * de más la acción se perdía en silencio. Aquí el modelo llama a herramientas
 * declaradas, con salida estructurada garantizada por el proveedor.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssistantCapabilities } from '@/lib/ai/assistant/capabilities';

export type ToolRisk = 'low' | 'medium' | 'high';

/**
 * Todo lo que una herramienta necesita saber sobre QUIÉN la está ejecutando.
 *
 * Invariante: ni `preview()` ni `execute()` reciben `organizationId` por
 * argumento. Sale de aquí, y aquí sale de la sesión. Es lo que impide que el
 * modelo —o el cliente— apunte a otra organización.
 */
export interface ToolContext {
  /** SIEMPRE de la sesión, nunca del body ni de los argumentos del modelo. */
  organizationId: number;
  branchId: number | null;
  userId: string;
  /** Cliente de sesión, con RLS activa. */
  supabase: SupabaseClient;
  capabilities: AssistantCapabilities;
  locale: string;
  currency: string;
  /** Algunas herramientas se bloquean en voz (§5.5.2). */
  channel: 'text' | 'voice';
  conversationId: string | null;
}

/** Una línea del resumen que ve el usuario antes de confirmar. */
export interface PreviewLine {
  label: string;
  value: string;
  /** 0–1. Solo lo rellena la extracción de documentos (F4). */
  confidence?: number;
}

/**
 * Lo que se le enseña al usuario antes de escribir nada.
 *
 * `summary` tiene que poder **leerse en voz alta y entenderse**: es lo que el
 * agente de voz dice antes de pedir un sí (§5.5.2). Si no se puede decir, está
 * mal escrito.
 */
export interface ToolPreview {
  title: string;
  summary: string;
  lines: PreviewLine[];
  /** Avisos en ámbar: "el proveedor no existe, se creará". */
  warnings: string[];
  totals?: Record<string, string>;
  /** Carga masiva (§6.3). */
  bulk?: {
    total: number;
    nuevos: number;
    duplicados: number;
    conErrores: number;
    rows: Array<Record<string, unknown>>;
  };
  estimatedCredits: number;
  /** `false` obliga a decírselo al usuario ANTES de confirmar (§6.4). */
  reversible: boolean;
}

export interface UndoPayload {
  kind: string;
  payload: Record<string, unknown>;
}

export interface ToolResult {
  ok: boolean;
  /** Legible y decible en voz alta. */
  message: string;
  entity?: { type: string; id: string | number; url?: string };
  /** `undefined` = no reversible. */
  undo?: UndoPayload;
  data?: unknown;
  /** Código estable para el cliente. */
  errorCode?: string;
}

/**
 * Definición de una herramienta.
 *
 * Cinco invariantes, no negociables (§5.3):
 *
 * 1. `preview()` **jamás** escribe. Es puro cálculo y lectura, y se puede llamar
 *    N veces sin efecto.
 * 2. `execute()` **jamás** se llama sin una fila `ai_agent_actions` confirmada,
 *    salvo riesgo `low`.
 * 3. Ni `preview()` ni `execute()` reciben `organizationId` por argumento.
 * 4. Toda escritura multi-tabla va en una RPC transaccional, no en N llamadas
 *    desde Node.
 * 5. `execute()` es idempotente por la fila de `ai_agent_actions`.
 */
export interface ToolDefinition<A = Record<string, unknown>> {
  /** snake_case, estable: es contrato con el modelo y con la BD. */
  name: string;
  /** En español, para el modelo. */
  description: string;
  /** JSON Schema de los argumentos, tal como lo espera el proveedor. */
  parameters: JsonSchemaObject;
  risk: ToolRisk;
  /** Códigos de `permissions`. Basta uno. Vacío = solo exige el nivel. */
  permissions: readonly string[];
  /** Nivel mínimo de `ai_assistant_settings.capability_level`. */
  minLevel: 'read' | 'write_low' | 'write_full';
  /** Código en `organization_modules`. `null` = no depende de un módulo. */
  requiredModule: string | null;
  availableInVoice: boolean;
  /** Valida y normaliza lo que devolvió el modelo. `null` = argumentos malos. */
  parseArgs(raw: unknown): A | null;
  preview(ctx: ToolContext, args: A): Promise<ToolPreview>;
  execute(ctx: ToolContext, args: A): Promise<ToolResult>;
  undo?(ctx: ToolContext, payload: UndoPayload): Promise<ToolResult>;
}

/** Subconjunto de JSON Schema que los proveedores aceptan para `parameters`. */
export interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface JsonSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

/** Herramienta ya resuelta contra un usuario concreto. */
export interface ResolvedTool {
  definition: ToolDefinition;
  /** Solo las de riesgo `low` se ejecutan sin confirmar. */
  autoExecutes: boolean;
}
