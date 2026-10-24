import type { SupabaseClient } from '@supabase/supabase-js';
import { configuracionPredeterminada, type ConfiguracionInformes, type CambiosConfiguracionInformes, type CuentaConfiguracionInforme } from '@/lib/finanzas/informes/configuracion';
import { resolverPlantillaNotas } from '@/lib/finanzas/informes/notasCertificacion';
import { OrgContextError } from '@/lib/utils/orgContextError';

/** La configuración se lee con la sesión y RLS; no se usa service role. */
export async function cargarConfiguracionInformes(cliente: SupabaseClient, organizationId: number): Promise<ConfiguracionInformes> {
  const [{ data: fila, error }, { data: org, error: errorOrg }] = await Promise.all([
    cliente.from('financial_report_settings').select('version,grupo_niif,presenta_cambios_patrimonio,notas,certificacion,parametros_fiscales,anotaciones_asientos').eq('organization_id', organizationId).maybeSingle(),
    cliente.from('organizations').select('name,legal_name,nit,tax_id').eq('id', organizationId).single(),
  ]);
  if (error) throw new Error('No se pudo leer la configuración de informes.');
  if (errorOrg) throw new Error('No se pudo leer la entidad de los informes.');
  const base = configuracionPredeterminada(org.legal_name || org.name || '', org.nit || org.tax_id || '');
  const cuentas: CuentaConfiguracionInforme[] = [];
  // No se limita el PUC a las primeras 1000 cuentas; los títulos también se pueden clasificar.
  const metadatos = new Map<string, Partial<CuentaConfiguracionInforme>>();
  for (let desde = 0; ; desde += 1000) {
    const respuesta = await cliente.from('financial_report_account_metadata').select('account_code,costo_comportamiento,es_ori,equivalente_efectivo,plazo_meses').eq('organization_id', organizationId).order('account_code').range(desde, desde + 999);
    if (respuesta.error) throw new Error('No se pudo leer la clasificación de las cuentas.');
    for (const meta of respuesta.data ?? []) metadatos.set(meta.account_code, meta);
    if ((respuesta.data?.length ?? 0) < 1000) break;
  }
  for (let desde = 0; ; desde += 1000) {
    const respuesta = await cliente.from('chart_of_accounts').select('account_code,name,presentacion_niif').eq('organization_id', organizationId).order('account_code').range(desde, desde + 999);
    if (respuesta.error) throw new Error('No se pudo leer el plan de cuentas.');
    for (const cuenta of respuesta.data ?? []) cuentas.push({
      account_code: cuenta.account_code, name: cuenta.name,
      costo_comportamiento: null, es_ori: false, equivalente_efectivo: false, plazo_meses: null,
      ...metadatos.get(cuenta.account_code),
      // Se conserva el valor crudo (incluido segun_plazo y null/heredar) de la fuente canónica.
      clasificacion_corriente: cuenta.presentacion_niif ?? null,
    });
    if ((respuesta.data?.length ?? 0) < 1000) break;
  }
  if (!fila) return { ...base, cuentas };
  return {
    ...base, ...fila,
    notas: resolverPlantillaNotas(fila.grupo_niif, fila.notas),
    certificacion: {
      ...base.certificacion, ...fila.certificacion,
      representante: { ...base.certificacion.representante, ...fila.certificacion?.representante },
      contador: { ...base.certificacion.contador, ...fila.certificacion?.contador },
    },
    cuentas,
  };
}

export async function guardarConfiguracionInformes(cliente: SupabaseClient, organizationId: number, cambios: CambiosConfiguracionInformes): Promise<void> {
  const { error } = await cliente.rpc('fn_guardar_configuracion_informes', { p_organization_id: organizationId, p_configuracion: cambios });
  if (error) {
    if (error.code === '40001') throw new OrgContextError('La configuración cambió en otra sesión. Vuelva a cargar antes de guardar.', 409, 'CONFIGURATION_CONFLICT');
    if (error.code === '42501') throw new OrgContextError('No tiene permiso para modificar la configuración de informes.', 403, 'FORBIDDEN');
    throw new Error('No se pudo guardar la configuración de informes.');
  }
}
