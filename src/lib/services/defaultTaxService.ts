/**
 * Tarifa por defecto de la organización para productos sin impuesto asignado.
 *
 * `resolveLineTax` (taxResolver.ts) usa `organization_taxes.is_default = true`
 * como penúltimo recurso: si un producto no tiene `product_tax_relations`, la
 * línea toma la tarifa por defecto; si tampoco hay, queda en 0 (`has_no_tax`).
 * Aquí se escribe esa marca, de a una por organización (o ninguna).
 *
 * El módulo no importa ningún cliente Supabase: lo recibe como argumento para
 * servir tanto al navegador (configuración de impuestos, asistente de
 * organización) como a `auth/callback` (servidor, sesión del usuario).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Valor de «ninguna tarifa por defecto» en formularios. */
export const SIN_TARIFA_POR_DEFECTO = 'NINGUNA' as const;

/** Códigos de `tax_templates` (COL) que se ofrecen al crear la organización. */
export type CodigoTarifaPorDefecto = 'IVA_19' | 'IVA_5' | typeof SIN_TARIFA_POR_DEFECTO;

/** Preselección al crear una organización: IVA general. */
export const TARIFA_POR_DEFECTO_INICIAL: CodigoTarifaPorDefecto = 'IVA_19';

export const OPCIONES_TARIFA_POR_DEFECTO: ReadonlyArray<{ value: CodigoTarifaPorDefecto; label: string }> = [
  { value: 'IVA_19', label: 'IVA 19% (tarifa general)' },
  { value: 'IVA_5', label: 'IVA 5%' },
  { value: SIN_TARIFA_POR_DEFECTO, label: 'Ninguna — vendo productos excluidos/exentos' },
];

/**
 * Valida un código que llega de un formulario o de metadatos de registro.
 * Devuelve null si no es una opción conocida (en ese caso no se toca nada).
 */
export function parseCodigoTarifaPorDefecto(value: unknown): CodigoTarifaPorDefecto | null {
  return OPCIONES_TARIFA_POR_DEFECTO.some((o) => o.value === value)
    ? (value as CodigoTarifaPorDefecto)
    : null;
}

/**
 * Marca `taxId` como la única tarifa por defecto de la organización, o deja la
 * organización sin ninguna si `taxId` es null.
 *
 * Una sola RPC transaccional (`fn_impuesto_fijar_por_defecto`): exige permiso
 * de finanzas (admin o finance.create/approve), valida que el impuesto sea de la
 * organización y desmarca/marca en la misma transacción. El índice único
 * `uq_organization_taxes_un_por_defecto` impide que queden dos. Antes eran dos
 * UPDATE desde el cliente, sin atomicidad ni permiso.
 */
export async function setOrganizationDefaultTax(
  client: SupabaseClient,
  organizationId: number,
  taxId: string | null,
): Promise<void> {
  const { error } = await client.rpc('fn_impuesto_fijar_por_defecto', {
    p_organization_id: organizationId,
    p_id: taxId,
  });
  if (error?.code === 'P0002') throw new Error('El impuesto no pertenece a esta organización');
  if (error) throw error;
}

/**
 * Igual que `setOrganizationDefaultTax`, pero a partir del código de plantilla
 * (`tax_templates.code`). Pensado para justo después de crear la organización,
 * cuando el disparador de la base ya sembró sus `organization_taxes`.
 *
 * @returns false si la organización no tiene un impuesto activo con ese código.
 */
export async function setOrganizationDefaultTaxByCode(
  client: SupabaseClient,
  organizationId: number,
  code: CodigoTarifaPorDefecto,
): Promise<boolean> {
  if (code === SIN_TARIFA_POR_DEFECTO) {
    await setOrganizationDefaultTax(client, organizationId, null);
    return true;
  }

  const { data, error } = await client
    .from('organization_taxes')
    .select('id, tax_templates!inner(code)')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .eq('tax_templates.code', code)
    .limit(1);
  if (error) throw error;

  const taxId = (data?.[0] as { id?: string } | undefined)?.id;
  if (!taxId) return false;

  await setOrganizationDefaultTax(client, organizationId, taxId);
  return true;
}
