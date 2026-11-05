/**
 * Ajustes de envío por organización (`shipping_settings`) y peso por defecto por categoría
 * (`categories.default_weight_kg`).
 *
 * - Sin fila en shipping_settings = integraciones de transportadoras apagadas: el envío propio a
 *   tarifa plana sigue idéntico.
 * - Corre con el cliente de la sesión (RLS): leer, cualquier miembro; guardar, administradores.
 * - Dropshipping (Fase 5) no se puede encender todavía.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AjustesEnvio {
  carrierIntegrationsEnabled: boolean;
  dropshippingEnabled: boolean;
  defaultWeightKg: number | null;
  defaultLengthCm: number | null;
  defaultWidthCm: number | null;
  defaultHeightCm: number | null;
}

export interface PesoCategoria {
  id: number;
  nombre: string;
  defaultWeightKg: number | null;
}

const SIN_FILA: AjustesEnvio = {
  carrierIntegrationsEnabled: false,
  dropshippingEnabled: false,
  defaultWeightKg: null,
  defaultLengthCm: null,
  defaultWidthCm: null,
  defaultHeightCm: null,
};

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export async function leerAjustesEnvio(db: SupabaseClient, organizationId: number): Promise<{ ajustes: AjustesEnvio; categorias: PesoCategoria[] }> {
  const [{ data: fila, error }, { data: cats, error: errCats }] = await Promise.all([
    db
      .from('shipping_settings')
      .select('carrier_integrations_enabled, dropshipping_enabled, default_weight_kg, default_length_cm, default_width_cm, default_height_cm')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    db.from('categories').select('id, name, default_weight_kg').eq('organization_id', organizationId).order('name'),
  ]);
  if (error) throw new Error(`shipping_settings: ${error.message}`);
  if (errCats) throw new Error(`categories: ${errCats.message}`);
  const f = fila as Record<string, unknown> | null;
  return {
    ajustes: f
      ? {
          carrierIntegrationsEnabled: f.carrier_integrations_enabled === true,
          dropshippingEnabled: f.dropshipping_enabled === true,
          defaultWeightKg: num(f.default_weight_kg),
          defaultLengthCm: num(f.default_length_cm),
          defaultWidthCm: num(f.default_width_cm),
          defaultHeightCm: num(f.default_height_cm),
        }
      : SIN_FILA,
    categorias: ((cats ?? []) as { id: number; name: string; default_weight_kg: unknown }[]).map((c) => ({
      id: c.id,
      nombre: c.name,
      defaultWeightKg: num(c.default_weight_kg),
    })),
  };
}

export interface CambiosAjustesEnvio {
  carrierIntegrationsEnabled?: boolean;
  defaultWeightKg?: number | null;
  defaultLengthCm?: number | null;
  defaultWidthCm?: number | null;
  defaultHeightCm?: number | null;
  categorias?: { id: number; defaultWeightKg: number | null }[];
}

export async function guardarAjustesEnvio(
  db: SupabaseClient,
  ctx: { organizationId: number; userId: string },
  cambios: CambiosAjustesEnvio,
): Promise<void> {
  const fila: Record<string, unknown> = { organization_id: ctx.organizationId, updated_at: new Date().toISOString(), updated_by: ctx.userId };
  if (cambios.carrierIntegrationsEnabled !== undefined) fila.carrier_integrations_enabled = cambios.carrierIntegrationsEnabled;
  if (cambios.defaultWeightKg !== undefined) fila.default_weight_kg = cambios.defaultWeightKg;
  if (cambios.defaultLengthCm !== undefined) fila.default_length_cm = cambios.defaultLengthCm;
  if (cambios.defaultWidthCm !== undefined) fila.default_width_cm = cambios.defaultWidthCm;
  if (cambios.defaultHeightCm !== undefined) fila.default_height_cm = cambios.defaultHeightCm;
  const { error } = await db.from('shipping_settings').upsert(fila, { onConflict: 'organization_id' });
  if (error) throw new Error(`shipping_settings: ${error.message}`);

  for (const c of cambios.categorias ?? []) {
    const { error: e } = await db
      .from('categories')
      .update({ default_weight_kg: c.defaultWeightKg })
      .eq('id', c.id)
      .eq('organization_id', ctx.organizationId);
    if (e) throw new Error(`categories: ${e.message}`);
  }
}
