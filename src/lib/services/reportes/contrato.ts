/**
 * Contrato de las rutas de reportes (cuerpos validados con zod). Puro: lo
 * usan las rutas, los diálogos de la interfaz y los tests.
 */
import { z } from 'zod';
import { locales } from '@/i18n/config';
import { esHora, normalizarPeriodo } from './periodosService';
import { PLANTILLAS_CIERRE } from './cierres/snapshot';
import { COMPARATIVOS, FORMATOS_ENVIO, FRECUENCIAS, PERIODOS_ENVIO, esCorreo, programacionValida } from './programados/programacion';
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

/** Tope de destinatarios por envío (el de `sendEmail` es por correo; este, por programación). */
export const MAX_DESTINATARIOS = 30;

const horaSchema = z.string().refine(esHora);

export const programadoSchema = z
  .object({
    nombre: z.string().trim().min(1).max(120),
    reportId: z.string().min(1).max(80),
    frecuencia: z.enum(FRECUENCIAS),
    hora: horaSchema,
    dia: z.number().int().min(1).max(28).nullish(),
    diasSemana: z.array(z.number().int().min(1).max(7)).min(1).max(7).nullish(),
    periodo: z.enum(PERIODOS_ENVIO),
    horaInicio: horaSchema.nullish(),
    horaFin: horaSchema.nullish(),
    comparar: z.enum(COMPARATIVOS).nullish(),
    vista: z.string().regex(/^[\w-]{1,60}$/).nullish(),
    sucursalId: sucursalSchema,
    formato: z.enum(FORMATOS_ENVIO),
    miembros: z.array(z.string().uuid()).max(MAX_DESTINATARIOS),
    externos: z.array(z.string().trim().toLowerCase().refine(esCorreo)).max(MAX_DESTINATARIOS),
  })
  .superRefine((v, ctx) => {
    if (!programacionValida({ frequency: v.frecuencia, hora: v.hora, dia: v.dia ?? null, dias_semana: v.diasSemana ?? null })) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dia'], message: 'dia_invalido' });
    }
    if (!v.horaInicio !== !v.horaFin) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['horaFin'], message: 'franja_incompleta' });
    const total = new Set(v.miembros).size + new Set(v.externos).size;
    if (total === 0 || total > MAX_DESTINATARIOS) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['miembros'], message: 'destinatarios' });
  });

export type CuerpoProgramado = z.output<typeof programadoSchema>;

export const accionProgramadoSchema = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('pausar') }),
  z.object({ accion: z.literal('reanudar') }),
  z.object({ accion: z.literal('aprobar'), correos: z.array(z.string().trim().toLowerCase().refine(esCorreo)).min(1).max(MAX_DESTINATARIOS) }),
  z.object({ accion: z.literal('editar'), datos: programadoSchema }),
]);

export type AccionProgramado = z.output<typeof accionProgramadoSchema>;
