import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { calculateRoi } from '@/lib/services/crm/roiService';
import { evaluateFormula } from '@/lib/services/crm/roiEvaluator';
import { getRoiTemplate, ROI_TEMPLATES } from '@/lib/services/crm/roiTemplates';
import { failResponse, foreignOrgResponse, isSafeId, readJson } from '@/lib/services/crm/f10RouteHelpers';

export const runtime = 'nodejs';

const MAX_INPUTS = 40;

function sanitizeInputs(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > MAX_INPUTS) return null;
  for (const [k, v] of entries) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) || k === '__proto__' || k === 'constructor' || k === 'prototype') return null;
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN;
    if (!Number.isFinite(n)) return null;
    out[k] = n;
  }
  return out;
}

/**
 * POST /api/crm/roi — calcula ROI. La fórmula NUNCA viene del cliente:
 *  - { calculator_id, inputs } → calculadora de la organización (`roi_calculators`)
 *  - { template, inputs }      → plantilla integrada por vertical (`roiTemplates`)
 * Evaluación con `roiEvaluator` (sin eval/Function). F10.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await readJson(request);
    const forbidden = foreignOrgResponse('CRM ROI POST', body, ctx, request);
    if (forbidden) return forbidden;
    const inputs = sanitizeInputs(body?.inputs);
    if (!inputs) {
      return NextResponse.json({ success: false, error: 'inputs debe ser un objeto de números finitos' }, { status: 400 });
    }
    if (typeof body?.formula !== 'undefined' || typeof body?.operations !== 'undefined') {
      return NextResponse.json({ success: false, error: 'La fórmula no se acepta del cliente: usa calculator_id o template' }, { status: 400 });
    }
    if (isSafeId(body?.calculator_id)) {
      const result = await calculateRoi(body!.calculator_id as string, inputs, ctx.supabase, ctx.organizationId);
      return NextResponse.json({ success: true, data: result });
    }
    if (typeof body?.template === 'string') {
      const slug = body.template.toLowerCase();
      if (!ROI_TEMPLATES.some((t) => t.slug === slug)) {
        return NextResponse.json({ success: false, error: 'Plantilla desconocida' }, { status: 400 });
      }
      const t = getRoiTemplate(slug);
      const { outputs, errors } = evaluateFormula(t.formula.operations, inputs);
      return NextResponse.json({ success: true, data: { calculator_id: null, template: t.slug, inputs, outputs, errors, output_defs: t.outputs } });
    }
    return NextResponse.json({ success: false, error: 'Faltan campos: calculator_id o template, e inputs' }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && /no encontrada/i.test(error.message)) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    return failResponse('CRM ROI POST', error);
  }
}
