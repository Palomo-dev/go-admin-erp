/**
 * F10 — plantillas de calculadora de ROI por vertical (puro).
 *
 * `roi_calculators` tiene 0 filas en producción. Estas plantillas son el punto
 * de partida: la UI las ofrece por `verticals.slug` y el vendedor puede
 * guardarlas en la organización con `POST /api/crm/roi/templates`. Las
 * fórmulas se evalúan con `roiEvaluator` (sin `Function`).
 */

import type { RoiInputDef, RoiOutputDef, RoiFormula } from '@/lib/services/crm/roiService';
import { formatMoney } from '@/lib/services/crm/proposalNarrative';

export interface RoiTemplate {
  slug: string;
  name: string;
  inputs: RoiInputDef[];
  formula: RoiFormula;
  outputs: RoiOutputDef[];
}

const BASE_OUTPUTS: RoiOutputDef[] = [
  { key: 'savings_monthly', label: 'Ahorro mensual', type: 'currency' },
  { key: 'savings_yearly', label: 'Ahorro anual', type: 'currency' },
  { key: 'net_yearly', label: 'Beneficio neto anual', type: 'currency' },
  { key: 'roi_pct', label: 'ROI anual', type: 'percentage' },
  { key: 'payback_months', label: 'Recuperación (meses)', type: 'number' },
];

/** Cadena común: ahorro mensual → anual → neto → ROI → payback. */
function chain(savingsExpr: string): RoiFormula {
  return {
    operations: [
      { output_key: 'savings_monthly', expression: savingsExpr },
      { output_key: 'savings_yearly', expression: 'savings_monthly * 12' },
      { output_key: 'net_yearly', expression: 'savings_yearly - inputs.annual_fee' },
      { output_key: 'roi_pct', expression: '(net_yearly / (inputs.investment + inputs.annual_fee)) * 100' },
      { output_key: 'payback_months', expression: '(inputs.investment + inputs.annual_fee) / savings_monthly' },
    ],
  };
}

const COMMON_INPUTS: RoiInputDef[] = [
  { key: 'investment', label: 'Inversión inicial (implementación)', type: 'currency', default: 1500000, required: true },
  { key: 'annual_fee', label: 'Suscripción anual', type: 'currency', default: 3600000, required: true },
];

export const ROI_TEMPLATES: RoiTemplate[] = [
  {
    slug: 'restaurantes',
    name: 'Restaurantes — mermas e inventario',
    inputs: [
      { key: 'monthly_purchases', label: 'Compras mensuales de insumos', type: 'currency', default: 20000000, required: true },
      { key: 'waste_pct', label: 'Merma actual (%)', type: 'percentage', default: 12, required: true },
      { key: 'waste_target_pct', label: 'Merma objetivo con control (%)', type: 'percentage', default: 6, required: true },
      { key: 'hours_admin', label: 'Horas administrativas al mes', type: 'number', default: 40 },
      { key: 'hour_cost', label: 'Costo por hora administrativa', type: 'currency', default: 25000 },
      ...COMMON_INPUTS,
    ],
    formula: chain('inputs.monthly_purchases * (inputs.waste_pct - inputs.waste_target_pct) / 100 + inputs.hours_admin * inputs.hour_cost * 0.5'),
    outputs: BASE_OUTPUTS,
  },
  {
    slug: 'retail',
    name: 'Retail — quiebres de stock y caja',
    inputs: [
      { key: 'monthly_sales', label: 'Ventas mensuales', type: 'currency', default: 50000000, required: true },
      { key: 'stockout_pct', label: 'Ventas perdidas por quiebre (%)', type: 'percentage', default: 5, required: true },
      { key: 'stockout_target_pct', label: 'Quiebre objetivo (%)', type: 'percentage', default: 2, required: true },
      { key: 'shrink_pct', label: 'Diferencias de caja e inventario (%)', type: 'percentage', default: 1.5 },
      ...COMMON_INPUTS,
    ],
    formula: chain('inputs.monthly_sales * (inputs.stockout_pct - inputs.stockout_target_pct) / 100 + inputs.monthly_sales * inputs.shrink_pct / 100 * 0.5'),
    outputs: BASE_OUTPUTS,
  },
  {
    slug: 'hoteleria',
    name: 'Hotelería — ocupación y no-shows',
    inputs: [
      { key: 'rooms', label: 'Habitaciones', type: 'number', default: 30, required: true },
      { key: 'adr', label: 'Tarifa promedio por noche', type: 'currency', default: 180000, required: true },
      { key: 'occupancy_gain_pts', label: 'Puntos de ocupación ganados', type: 'percentage', default: 3, required: true },
      { key: 'no_show_pct', label: 'No-shows actuales (%)', type: 'percentage', default: 4 },
      ...COMMON_INPUTS,
    ],
    formula: chain('inputs.rooms * 30 * inputs.adr * inputs.occupancy_gain_pts / 100 + inputs.rooms * 30 * inputs.adr * inputs.no_show_pct / 100 * 0.3'),
    outputs: BASE_OUTPUTS,
  },
  {
    slug: 'servicios',
    name: 'Servicios — horas facturables y cartera',
    inputs: [
      { key: 'billable_hours', label: 'Horas facturables al mes', type: 'number', default: 400, required: true },
      { key: 'hour_rate', label: 'Tarifa por hora', type: 'currency', default: 80000, required: true },
      { key: 'leak_pct', label: 'Horas no facturadas hoy (%)', type: 'percentage', default: 8, required: true },
      { key: 'overdue_balance', label: 'Cartera vencida', type: 'currency', default: 15000000 },
      ...COMMON_INPUTS,
    ],
    formula: chain('inputs.billable_hours * inputs.hour_rate * inputs.leak_pct / 100 * 0.6 + inputs.overdue_balance * 0.02'),
    outputs: BASE_OUTPUTS,
  },
  {
    slug: 'salud',
    name: 'Salud — agenda y ausentismo',
    inputs: [
      { key: 'appointments', label: 'Citas al mes', type: 'number', default: 800, required: true },
      { key: 'ticket', label: 'Valor promedio por cita', type: 'currency', default: 90000, required: true },
      { key: 'no_show_pct', label: 'Ausentismo actual (%)', type: 'percentage', default: 15, required: true },
      { key: 'no_show_target_pct', label: 'Ausentismo objetivo con recordatorios (%)', type: 'percentage', default: 8, required: true },
      ...COMMON_INPUTS,
    ],
    formula: chain('inputs.appointments * inputs.ticket * (inputs.no_show_pct - inputs.no_show_target_pct) / 100'),
    outputs: BASE_OUTPUTS,
  },
  {
    slug: 'educacion',
    name: 'Educación — matrícula y cobranza',
    inputs: [
      { key: 'students', label: 'Estudiantes', type: 'number', default: 300, required: true },
      { key: 'monthly_fee', label: 'Mensualidad', type: 'currency', default: 450000, required: true },
      { key: 'late_pct', label: 'Mora actual (%)', type: 'percentage', default: 12, required: true },
      { key: 'late_target_pct', label: 'Mora objetivo (%)', type: 'percentage', default: 6, required: true },
      ...COMMON_INPUTS,
    ],
    formula: chain('inputs.students * inputs.monthly_fee * (inputs.late_pct - inputs.late_target_pct) / 100 * 0.5'),
    outputs: BASE_OUTPUTS,
  },
  {
    slug: 'saas',
    name: 'SaaS — retención y eficiencia comercial',
    inputs: [
      { key: 'mrr', label: 'MRR actual', type: 'currency', default: 30000000, required: true },
      { key: 'churn_pct', label: 'Churn mensual (%)', type: 'percentage', default: 4, required: true },
      { key: 'churn_target_pct', label: 'Churn objetivo (%)', type: 'percentage', default: 2.5, required: true },
      { key: 'sales_hours', label: 'Horas comerciales manuales al mes', type: 'number', default: 120 },
      { key: 'hour_cost', label: 'Costo por hora comercial', type: 'currency', default: 40000 },
      ...COMMON_INPUTS,
    ],
    formula: chain('inputs.mrr * (inputs.churn_pct - inputs.churn_target_pct) / 100 + inputs.sales_hours * inputs.hour_cost * 0.4'),
    outputs: BASE_OUTPUTS,
  },
  {
    slug: 'otros',
    name: 'General — ahorro operativo',
    inputs: [
      { key: 'current_cost', label: 'Costo operativo mensual actual', type: 'currency', default: 10000000, required: true },
      { key: 'proposed_cost', label: 'Costo operativo mensual con la solución', type: 'currency', default: 7000000, required: true },
      ...COMMON_INPUTS,
    ],
    formula: chain('inputs.current_cost - inputs.proposed_cost'),
    outputs: BASE_OUTPUTS,
  },
];

export function getRoiTemplate(slug: string | null | undefined): RoiTemplate {
  const s = (slug ?? '').toLowerCase();
  return ROI_TEMPLATES.find((t) => t.slug === s) ?? ROI_TEMPLATES[ROI_TEMPLATES.length - 1];
}

export function defaultInputs(inputs: RoiInputDef[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of inputs) out[i.key] = typeof i.default === 'number' ? i.default : 0;
  return out;
}

function fmt(value: number, def: RoiOutputDef | undefined, currency: string): string {
  if (!Number.isFinite(value)) return '—';
  const type = def?.type ?? 'number';
  if (type === 'currency') return formatMoney(value, currency);
  if (type === 'percentage') return `${Math.round(value * 10) / 10} %`;
  return `${Math.round(value * 10) / 10}`;
}

/** Texto de la sección ROI de la propuesta a partir de las salidas calculadas. */
export function formatRoiSummary(outputs: Record<string, number>, defs: RoiOutputDef[], currency: string): string {
  const by = (k: string) => defs.find((d) => d.key === k);
  const parts: string[] = [];
  if ('savings_yearly' in outputs) parts.push(`Ahorro anual estimado: ${fmt(outputs.savings_yearly, by('savings_yearly'), currency)}`);
  if ('roi_pct' in outputs) parts.push(`ROI ${fmt(outputs.roi_pct, by('roi_pct'), currency)}`);
  if ('payback_months' in outputs) parts.push(`retorno en ${fmt(outputs.payback_months, by('payback_months'), currency)} meses`);
  const rest = Object.keys(outputs).filter((k) => !['savings_yearly', 'roi_pct', 'payback_months'].includes(k));
  const head = parts.join(' · ');
  const lines = rest.map((k) => `• ${by(k)?.label ?? k}: ${fmt(outputs[k], by(k), currency)}`);
  return [head, ...lines].filter(Boolean).join('\n');
}
