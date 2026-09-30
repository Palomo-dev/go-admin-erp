/**
 * Contrato de las rutas de reportes (cuerpos validados con zod). Puro: lo
 * usan las rutas, los diálogos de la interfaz y los tests.
 */
import { z } from 'zod';
import { locales } from '@/i18n/config';
import { normalizarPeriodo } from './periodosService';
import { PLANTILLAS_CIERRE } from './cierres/snapshot';
import type { PeriodoCierre } from './types';

const periodoSchema = z
  .object({
    tipo: z.string(),
    fechaInicio: z.string(),
    fechaFin: z.string(),
    horaInicio: z.string().nullish(),
    horaFin: z.string().nullish(),
  })
  .transform((v, ctx): PeriodoCierre => {
    const p = normalizarPeriodo(v);
    if (!p) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'periodo_invalido' });
      return z.NEVER;
    }
    return p;
  });

const sucursalSchema = z.number().int().positive().nullable();

export const cierreSchema = z
  .object({
    periodo: periodoSchema,
    plantilla: z.enum(PLANTILLAS_CIERRE),
    reportes: z.array(z.string().min(1).max(80)).max(80).optional(),
    sucursalId: sucursalSchema,
    reemplaza: z.string().uuid().nullish(),
    vistaPrevia: z.boolean().optional(),
    idioma: z.enum(locales).optional(),
  })
  .refine((v) => v.plantilla !== 'personalizada' || (v.reportes?.length ?? 0) > 0, { path: ['reportes'] });

export type CuerpoCierre = z.output<typeof cierreSchema>;

export const reabrirCierreSchema = z.object({ motivo: z.string().trim().min(5).max(500) });
