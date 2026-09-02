import type { SupabaseClient } from '@supabase/supabase-js';

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
 * El cálculo se evalúa en runtime con un parser seguro de expresiones matemáticas.
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
}

// ─── Parser seguro de expresiones ────────────────────────────────────────────

/**
 * Evalúa una expresión matemática de forma segura.
 * Solo permite: números, operadores (+, -, *, /, %, paréntesis),
 * variables (identificadores con puntos), y funciones Math básicas.
 *
 * Construye un scope con los valores de inputs y los outputs ya calculados,
 * luego evalúa la expresión sustituyendo variables.
 */
function safeEvalExpression(
  expression: string,
  scope: Record<string, number>
): number {
  try {
    // Sustituir variables del scope en la expresión
    // Las variables pueden tener formato: inputs.xxx, outputs.xxx, o nombres simples
    let expr = expression;

    // Ordenar claves por longitud descendente para sustituir las más largas primero
    const keys = Object.keys(scope).sort((a, b) => b.length - a.length);

    for (const key of keys) {
      // Escapar caracteres especiales en el key
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedKey}\\b`, 'g');
      expr = expr.replace(regex, String(scope[key]));
    }

    // Validar que solo queden caracteres seguros
    if (!/^[\d\s+\-*/%.()]+$/.test(expr)) {
      console.warn('roiService.safeEvalExpression - expresión no segura:', expr);
      return 0;
    }

    // Evaluar con Function constructor (más seguro que eval)
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr})`)();
    return typeof result === 'number' && !isNaN(result) ? result : 0;
  } catch (err) {
    console.warn('roiService.safeEvalExpression - error:', err);
    return 0;
  }
}

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
 * Calcula el ROI desde inputs + formula de una calculadora.
 *
 * @param calculatorId - ID de la calculadora
 * @param inputs - Valores de entrada (key → número)
 * @param supabase - Cliente Supabase
 * @returns Outputs calculados
 */
export async function calculateRoi(
  calculatorId: string,
  inputs: Record<string, number>,
  supabase: SupabaseClient
): Promise<RoiCalculationResult> {
  // 1. Obtener la calculadora
  const { data, error } = await supabase
    .from('roi_calculators')
    .select('id, formula')
    .eq('id', calculatorId)
    .maybeSingle();

  if (error || !data) {
    throw new Error('Calculadora ROI no encontrada');
  }

  const formula = (data as { formula: RoiFormula }).formula;
  const operations = formula.operations || [];

  // 2. Construir scope inicial con los inputs
  const scope: Record<string, number> = {};

  // Aplanar inputs: soporta tanto inputs.xxx como claves directas
  for (const [key, value] of Object.entries(inputs)) {
    scope[key] = Number(value) || 0;
    scope[`inputs.${key}`] = Number(value) || 0;
  }

  // 3. Ejecutar operaciones en orden, alimentando el scope con cada resultado
  const outputs: Record<string, number> = {};

  for (const op of operations) {
    const result = safeEvalExpression(op.expression, scope);
    outputs[op.output_key] = result;
    scope[op.output_key] = result;
    scope[`outputs.${op.output_key}`] = result;
  }

  return {
    calculator_id: calculatorId,
    inputs,
    outputs,
  };
}
