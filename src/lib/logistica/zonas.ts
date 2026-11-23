/**
 * Zonas y tarifas de envío: tipos y validación del formulario (logística Fase 1). Puro.
 *
 * Mismas reglas que los CHECK de shipping_zones / shipping_zone_locations / delivery_rules
 * (migración 20261123145549): validar aquí solo evita un viaje a la base con un error críptico.
 */
import { normalizarCodigoDane } from './cotizacion';

export const APLICA_ENVIO_GRATIS = ['web', 'pos', 'both'] as const;
export type AplicaEnvioGratis = (typeof APLICA_ENVIO_GRATIS)[number];

export const TIPOS_UBICACION = ['municipality', 'neighborhood', 'postal_code', 'polygon'] as const;
export type TipoUbicacion = (typeof TIPOS_UBICACION)[number];

export interface ZonaEnvio {
  id: string;
  organization_id: number;
  branch_id: number | null;
  name: string;
  description: string | null;
  is_active: boolean;
  is_fallback: boolean;
  priority: number;
  fee: number;
  currency: string | null;
  promise_min_minutes: number | null;
  promise_max_minutes: number | null;
  promise_text: string | null;
  min_order_amount: number;
  free_shipping_from: number | null;
  free_shipping_applies_to: AplicaEnvioGratis;
  /** 'HH:MM:SS' en la zona horaria de la sede. */
  cutoff_time: string | null;
  /** ISO: 1 = lunes … 7 = domingo. */
  delivery_days: number[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ZonaEnvioEntrada = Partial<Omit<ZonaEnvio, 'id' | 'organization_id' | 'created_at' | 'updated_at'>> & {
  name: string;
};

export interface UbicacionZona {
  id: string;
  organization_id: number;
  zone_id: string;
  location_type: TipoUbicacion;
  municipality_code: string | null;
  neighborhood: string | null;
  neighborhood_key: string | null;
  postal_code: string | null;
  polygon: Record<string, unknown> | null;
  label: string | null;
  created_at: string;
}

export type UbicacionZonaEntrada = Pick<UbicacionZona, 'location_type'> &
  Partial<Pick<UbicacionZona, 'municipality_code' | 'neighborhood' | 'postal_code' | 'polygon' | 'label'>>;

export interface ReglaDespacho {
  id: string;
  organization_id: number;
  branch_id: number | null;
  name: string;
  is_active: boolean;
  priority: number;
  zone_ids: string[] | null;
  channels: Array<'web' | 'pos' | 'manual'> | null;
  payment_methods: string[] | null;
  min_order_value: number | null;
  max_order_value: number | null;
  min_weight_kg: number | null;
  max_weight_kg: number | null;
  weekdays: number[] | null;
  time_from: string | null;
  time_to: string | null;
  /** Fase 1: solo 'own' (CHECK delivery_rules_fase1_solo_propio). */
  action: 'own';
  carrier_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ReglaDespachoEntrada = Partial<Omit<ReglaDespacho, 'id' | 'organization_id' | 'created_at' | 'updated_at'>> & {
  name: string;
};

export type ErrorZona =
  | 'nombre_requerido'
  | 'tarifa_invalida'
  | 'promesa_invalida'
  | 'minimo_invalido'
  | 'envio_gratis_invalido'
  | 'aplica_gratis_invalido'
  | 'dias_invalidos'
  | 'corte_invalido';

const noNegativo = (n: unknown) => n === null || n === undefined || (typeof n === 'number' && Number.isFinite(n) && n >= 0);

export function validarZona(z: ZonaEnvioEntrada): ErrorZona[] {
  const errores: ErrorZona[] = [];
  const nombre = (z.name ?? '').trim();
  if (nombre.length < 1 || nombre.length > 120) errores.push('nombre_requerido');
  if (!noNegativo(z.fee)) errores.push('tarifa_invalida');
  if (!noNegativo(z.promise_min_minutes) || !noNegativo(z.promise_max_minutes)
      || (z.promise_min_minutes != null && z.promise_max_minutes != null && z.promise_max_minutes < z.promise_min_minutes)) {
    errores.push('promesa_invalida');
  }
  if (!noNegativo(z.min_order_amount)) errores.push('minimo_invalido');
  if (z.free_shipping_from != null && !(typeof z.free_shipping_from === 'number' && z.free_shipping_from > 0)) {
    errores.push('envio_gratis_invalido');
  }
  if (z.free_shipping_applies_to != null && !(APLICA_ENVIO_GRATIS as readonly string[]).includes(z.free_shipping_applies_to)) {
    errores.push('aplica_gratis_invalido');
  }
  if (z.delivery_days != null
      && (z.delivery_days.length === 0 || z.delivery_days.some((d) => !Number.isInteger(d) || d < 1 || d > 7))) {
    errores.push('dias_invalidos');
  }
  if (z.cutoff_time != null && !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(z.cutoff_time)) errores.push('corte_invalido');
  return errores;
}

export type ErrorUbicacion = 'tipo_invalido' | 'municipio_invalido' | 'barrio_requerido' | 'codigo_postal_invalido' | 'poligono_invalido';

/** Valida y deja la ubicación lista para insertar (DANE normalizado). */
export function prepararUbicacion(u: UbicacionZonaEntrada): { ok: true; fila: UbicacionZonaEntrada } | { ok: false; error: ErrorUbicacion } {
  if (!(TIPOS_UBICACION as readonly string[]).includes(u.location_type)) return { ok: false, error: 'tipo_invalido' };
  const municipio = u.municipality_code ? normalizarCodigoDane(u.municipality_code) : null;
  if (u.municipality_code && !municipio) return { ok: false, error: 'municipio_invalido' };
  const base = { location_type: u.location_type, label: u.label?.trim() || null, municipality_code: municipio };
  switch (u.location_type) {
    case 'municipality':
      return municipio ? { ok: true, fila: base } : { ok: false, error: 'municipio_invalido' };
    case 'neighborhood': {
      const barrio = (u.neighborhood ?? '').trim();
      return barrio ? { ok: true, fila: { ...base, neighborhood: barrio } } : { ok: false, error: 'barrio_requerido' };
    }
    case 'postal_code': {
      const cp = (u.postal_code ?? '').trim();
      return /^[0-9A-Za-z -]{3,10}$/.test(cp) ? { ok: true, fila: { ...base, postal_code: cp } } : { ok: false, error: 'codigo_postal_invalido' };
    }
    case 'polygon': {
      const tipo = (u.polygon as { type?: unknown } | null | undefined)?.type;
      return tipo === 'Polygon' || tipo === 'MultiPolygon' || tipo === 'Feature'
        ? { ok: true, fila: { ...base, polygon: u.polygon } }
        : { ok: false, error: 'poligono_invalido' };
    }
  }
}
