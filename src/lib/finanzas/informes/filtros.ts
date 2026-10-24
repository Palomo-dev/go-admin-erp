import { z } from 'zod';
import { codigoNormalizado } from '@/lib/finanzas/pucPrefijo';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((valor) => {
  const [anio, mes, dia] = valor.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() + 1 === mes && d.getUTCDate() === dia;
}, 'Fecha de calendario inválida');
const id = z.string().regex(/^[1-9]\d*$/).transform(Number).refine(Number.isSafeInteger);
const filtros = z.object({
  desde: fecha, hasta: fecha,
  nivel: z.enum(['1', '2', '4', '6', 'auxiliar']).default('4'),
  branch_id: id.optional(), cost_center_id: z.string().uuid().optional(),
  cuenta: z.string().max(60).refine((codigo) => /^\d{1,30}$/.test(codigoNormalizado(codigo)), 'Cuenta PUC inválida').optional(), product_id: id.optional(),
}).refine((valor) => valor.desde <= valor.hasta, 'La fecha inicial no puede ser posterior al corte.');

export function leerFiltrosInforme(parametros: URLSearchParams) {
  const resultado = filtros.safeParse(Object.fromEntries(parametros));
  if (!resultado.success) return { datos: null, error: resultado.error.issues.map((issue) => issue.message).join(' ') };
  return { datos: resultado.data, error: null };
}
