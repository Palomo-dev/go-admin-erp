import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateFormula } from '@/lib/services/crm/roiEvaluator';

/**
 * Servicio CRM - Calculadoras de ROI (Fase 10).
 *
 * Tabla: roi_calculators
 *   id, organization_id, name, vertical_id, inputs (jsonb),
 *   formula (jsonb), outputs (jsonb), is_active, created_at
 *
 * La estructura de `formula` (jsonb) define cómo calcular outputs desde inputs:
 *   {
 *     "operations": [
 *       { "output_key": "savings_monthly", "expression": "inputs.current_cost - inputs.proposed_cost" },
 *       { "output_key": "roi_percentage", "expression": "(savings_monthly * 12 / inputs.investment) * 100" },
 *       ...
 *     ]
 *   }
 *
 * El cálculo se evalúa con `roiEvaluator` (parser aritmético propio: sin eval ni Function).
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface RoiInputDef {
  key: string;
  label: string;
  type: 'number' | 'currency' | 'percentage' | 'text';
  default?: number | string;
  required?: boolean;
}

export interface RoiOutputDef {
  key: string;
  label: string;
  type: 'number' | 'currency' | 'percentage';
  format?: string;
}

export interface RoiFormulaOperation {
  output_key: string;
  expression: string;
}

export interface RoiFormula {
  operations: RoiFormulaOperation[];
}

export interface RoiCalculator {
  id: string;
  organization_id: number;
  name: string;
  vertical_id: string | null;
  inputs: RoiInputDef[];
  formula: RoiFormula;
  outputs: RoiOutputDef[];
  is_active: boolean;
  created_at: string;
}

export interface CreateRoiInput {
  name: string;
  vertical_id?: string | null;
  inputs: RoiInputDef[];
  formula: RoiFormula;
  outputs: RoiOutputDef[];
  is_active?: boolean;
}

export interface UpdateRoiInput {
  name?: string;
  vertical_id?: string | null;
  inputs?: RoiInputDef[];
  formula?: RoiFormula;
  outputs?: RoiOutputDef[];
  is_active?: boolean;
}

export interface RoiCalculationResult {
  calculator_id: string;
  inputs: Record<string, number>;
  outputs: Record<string, number>;
  /** Operaciones que no pudieron evaluarse (clave de salida → motivo). */
  errors: Record<string, string>;
}

// ─── Evaluación ──────────────────────────────────────────────────────────────
// F10: la evaluación vive en `roiEvaluator.ts` (parser propio, sin `Function`).
// Antes aquí se construía una función a partir del texto de una fila jsonb.

// ─── Funciones del servicio ──────────────────────────────────────────────────

/**
 * Lista calculadoras de ROI activas de una organización.
 */
export async function getRoiCalculators(
  orgId: number,
  supabase: SupabaseClient
): Promise<RoiCalculator[]> {
  const { data, error } = await supabase
    .from('roi_calculators')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    console.warn('roiService.getRoiCalculators - error:', error.message);
    return [];
  }

  return (data || []) as RoiCalculator[];
}

/**
 * Crea una calculadora de ROI.
 */
export async function createRoiCalculator(
  orgId: number,
  data: CreateRoiInput,
  supabase: SupabaseClient
): Promise<RoiCalculator | null> {
  const { data: result, error } = await supabase
    .from('roi_calculators')
    .insert({
      organization_id: orgId,
      name: data.name,
      vertical_id: data.vertical_id ?? null,
      inputs: data.inputs,
      formula: data.formula,
      outputs: data.outputs,
      is_active: data.is_active ?? true,
    })
    .select('*')
    .single();

  if (error) {
    console.error('roiService.createRoiCalculator - error:', error.message);
    throw new Error(`Error creando calculadora ROI: ${error.message}`);
  }

  return result as RoiCalculator;
}

/**
 * Actualiza una calculadora de ROI.
 */
export async function updateRoiCalculator(
  id: string,
  orgId: number,
  data: UpdateRoiInput,
  supabase: SupabaseClient
): Promise<RoiCalculator | null> {
  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.vertical_id !== undefined) updateData.vertical_id = data.vertical_id;
  if (data.inputs !== undefined) updateData.inputs = data.inputs;
  if (data.formula !== undefined) updateData.formula = data.formula;
  if (data.outputs !== undefined) updateData.outputs = data.outputs;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;

  const { data: result, error } = await supabase
    .from('roi_calculators')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('roiService.updateRoiCalculator - error:', error.message);
    throw new Error(`Error actualizando calculadora ROI: ${error.message}`);
  }

  return (result as RoiCalculator) || null;
}

/**
 * Elimina una calculadora de ROI.
 */
export async function deleteRoiCalculator(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('roi_calculators')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) {
    throw new Error(`Error eliminando calculadora ROI: ${error.message}`);
  }
}

/**
 * Calcula el ROI desde inputs + formula de una calculadora DE LA ORGANIZACIÓN.
 * La fórmula viene de la fila (nunca del cliente) y se evalúa con el parser
 * seguro; una operación inválida queda en `errors`, no tumba el cálculo.
 */
export async function calculateRoi(
  calculatorId: string,
  inputs: Record<string, number>,
  supabase: SupabaseClient,
  orgId: number
): Promise<RoiCalculationResult> {
  const { data, error } = await supabase
    .from('roi_calculators')
    .select('id, formula')
    .eq('id', calculatorId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error || !data) {
    throw new Error('Calculadora ROI no encontrada');
  }

  const formula = (data as { formula: RoiFormula | null }).formula;
  const { outputs, errors } = evaluateFormula(formula?.operations ?? [], inputs);
  return { calculator_id: calculatorId, inputs, outputs, errors };
}
