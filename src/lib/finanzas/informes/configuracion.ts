import { z } from 'zod';
import { resolverPlantillaNotas, type ConfiguracionCertificacion, type PlantillaNotas } from './notasCertificacion';
import { codigoNormalizado } from '@/lib/finanzas/pucPrefijo';

export const conceptoPatrimonioSchema = z.enum(['aportes', 'dividendos_efectivo', 'dividendos_acciones', 'reservas', 'traslado_resultados', 'correccion_errores', 'ori']);
export const anotacionAsientoSchema = z.object({
  concepto_patrimonio: conceptoPatrimonioSchema.nullable().optional(),
  provision_sin_caja: z.boolean().optional(),
  cash_flow_activity: z.enum(['operacion', 'inversion', 'financiacion']).nullable().optional(),
}).strict();
export type AnotacionAsientoInforme = z.infer<typeof anotacionAsientoSchema>;

const firmanteSchema = z.object({ nombre: z.string().max(500), cedula: z.string().max(100), tarjetaProfesional: z.string().max(100).optional() }).strict();
const certificacionSchema = z.object({
  entidad: z.string().max(500), nit: z.string().max(100), representante: firmanteSchema, contador: firmanteSchema,
  revisorFiscal: firmanteSchema.nullable().optional(), dictamen: z.string().max(100000).nullable().optional(),
}).strict();
const notasSchema = z.object({ entidad: z.string().max(100000), basesPreparacion: z.string().max(100000), politicas: z.string().max(100000), revelaciones: z.string().max(100000) }).strict();

export const cuentaConfiguracionSchema = z.object({
  account_code: z.string().max(50).refine((codigo) => /^\d{1,20}$/.test(codigoNormalizado(codigo)), 'Indique un código PUC válido.'), name: z.string().max(500).optional(),
  /** Alias de chart_of_accounts.presentacion_niif; no se guarda una segunda clasificación. */
  clasificacion_corriente: z.enum(['corriente', 'no_corriente', 'segun_plazo']).nullable().optional(),
  costo_comportamiento: z.enum(['fijo', 'variable']).nullable(),
  es_ori: z.boolean(), equivalente_efectivo: z.boolean(), plazo_meses: z.number().finite().min(0).max(1200).nullable(),
}).strict().superRefine((cuenta, ctx) => {
  const codigo = codigoNormalizado(cuenta.account_code);
  if (cuenta.es_ori && !codigo.startsWith('38')) ctx.addIssue({ code: 'custom', message: 'Solo auxiliares de la 38 pueden marcarse como ORI.' });
  if (cuenta.equivalente_efectivo && (!codigo.startsWith('12') || cuenta.plazo_meses === null || cuenta.plazo_meses > 3)) ctx.addIssue({ code: 'custom', message: 'El equivalente debe ser una inversión de la 12 con vencimiento original de tres meses o menos.' });
});
export type CuentaConfiguracionInforme = z.infer<typeof cuentaConfiguracionSchema> & { name: string; clasificacion_corriente: 'corriente' | 'no_corriente' | 'segun_plazo' | null };

export const guardarConfiguracionSchema = z.object({
  version: z.number().int().nonnegative().optional(),
  grupo_niif: z.union([z.literal(2), z.literal(3)]), presenta_cambios_patrimonio: z.boolean(),
  notas: notasSchema, certificacion: certificacionSchema,
  cuentas: z.array(cuentaConfiguracionSchema).max(10000),
  parametros_fiscales: z.record(z.unknown()).optional(),
  anotaciones_asientos: z.record(z.string().regex(/^[1-9]\d{0,9}$/), anotacionAsientoSchema).optional(),
}).strict().superRefine((config, ctx) => {
  const codigos = config.cuentas.map((cuenta) => cuenta.account_code);
  if (new Set(codigos).size !== codigos.length) ctx.addIssue({ code: 'custom', message: 'No repita una cuenta en la configuración.' });
  if (config.parametros_fiscales && JSON.stringify(config.parametros_fiscales).length > 1000000) ctx.addIssue({ code: 'custom', message: 'Los parámetros fiscales superan el tamaño permitido.' });
});
export type CambiosConfiguracionInformes = z.infer<typeof guardarConfiguracionSchema>;
export interface ConfiguracionInformes {
  version: number;
  grupo_niif: 2 | 3;
  presenta_cambios_patrimonio: boolean;
  notas: PlantillaNotas;
  certificacion: ConfiguracionCertificacion;
  cuentas: CuentaConfiguracionInforme[];
  parametros_fiscales: Record<string, unknown>;
  anotaciones_asientos: Record<string, AnotacionAsientoInforme>;
}

export function configuracionPredeterminada(entidad = '', nit = ''): ConfiguracionInformes {
  return {
    version: 0, grupo_niif: 2, presenta_cambios_patrimonio: true,
    notas: resolverPlantillaNotas(2),
    certificacion: { entidad, nit, representante: { nombre: '', cedula: '' }, contador: { nombre: '', cedula: '', tarjetaProfesional: '' } },
    cuentas: [], parametros_fiscales: {}, anotaciones_asientos: {},
  };
}
