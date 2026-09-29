/**
 * Alta de organización — ÚNICO punto (acceso v3, docs/design/AUTH-ACCESO-V2.md §13).
 *
 * Lo usan el asistente del registro (/auth/signup/organizacion) y el de
 * «Nueva organización» dentro de la app. Antes había tres copias con tablas de
 * planes distintas y sin transacción (regla 7 de CLAUDE.md).
 *
 * 1. `fn_alta_organizacion` (RPC transaccional, SECURITY INVOKER): organización,
 *    membresía del dueño, sucursal principal, suscripción con el plan y la
 *    prueba del catálogo y última organización del perfil.
 * 2. Después, sin bloquear el alta: tarifa por defecto, referido del vendedor
 *    (`?ref=`) y la suscripción de Stripe (con la tarjeta del paso de pago).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { setOrganizationDefaultTaxByCode, type CodigoTarifaPorDefecto } from '@/lib/services/defaultTaxService';

export interface DatosAltaOrganizacion {
  organizacion: {
    nombre: string;
    razonSocial?: string;
    tipoId?: number | null;
    descripcion?: string;
    correo?: string;
    telefono?: string;
    sitioWeb?: string;
    nit?: string;
    dv?: string;
    direccion?: string;
    ciudad?: string;
    departamento?: string;
    paisCodigo: string;
    paisNombre?: string;
    municipioId?: string;
    codigoPostal?: string;
    colorPrimario?: string;
    colorSecundario?: string;
    subdominio?: string;
    logoUrl?: string | null;
  };
  sucursal: {
    nombre?: string;
    codigo?: string;
    direccion?: string;
    ciudad?: string;
    departamento?: string;
    departamentoCodigo?: string;
    paisCodigo?: string;
    paisNombre?: string;
    municipioId?: string;
    codigoPostal?: string;
    telefono?: string;
    correo?: string;
    nit?: string;
  };
  planCodigo: string;
  periodo: 'monthly' | 'yearly';
  sinPrueba: boolean;
  /** Zona horaria IANA del navegador (solo si coincide con el país elegido). */
  zonaHoraria?: string | null;
  tarifaPorDefecto?: CodigoTarifaPorDefecto;
  referido?: string | null;
  stripe?: {
    customerId?: string;
    paymentMethodId?: string;
    cupon?: string;
    nombreCliente?: string;
  };
  /** Atribución de marketing (tarea 02). Se guarda con marketing_consent. */
  atribucion?: {
    utm_source_first?: string;
    utm_medium_first?: string;
    utm_campaign_first?: string;
    utm_content_first?: string;
    utm_term_first?: string;
    utm_source_last?: string;
    utm_medium_last?: string;
    utm_campaign_last?: string;
    utm_content_last?: string;
    utm_term_last?: string;
    gclid?: string;
    fbclid?: string;
    fbp?: string;
    fbc?: string;
    ga_client_id?: string;
    landing_page?: string;
    referrer?: string;
    how_heard?: string;
    city?: string;
    seller_ref?: string;
    marketing_consent?: boolean;
    consent_ts?: string;
  } | null;
}

export interface OrganizacionCreada {
  id: number;
  nombre: string;
  sucursalId: number;
}

/** Plan del selector (`pro`, `business-yearly`…) → código del catálogo. */
export function codigoPlan(seleccion: string): string {
  const s = (seleccion || '').toLowerCase();
  if (s.startsWith('ultimate')) return 'ultimate';
  if (s.startsWith('business')) return 'business';
  if (s.startsWith('enterprise')) return 'enterprise';
  return 'pro';
}

/** Cuerpo de la RPC (claves en español, las que lee `fn_alta_organizacion`). */
export function cuerpoRpcAlta(d: DatosAltaOrganizacion): Record<string, unknown> {
  const o = d.organizacion;
  const s = d.sucursal;
  return {
    plan_codigo: d.planCodigo,
    periodo: d.periodo,
    sin_prueba: d.sinPrueba,
    zona_horaria: d.zonaHoraria ?? null,
    organizacion: {
      nombre: o.nombre,
      razon_social: o.razonSocial,
      tipo_id: o.tipoId ?? null,
      descripcion: o.descripcion,
      correo: o.correo,
      telefono: o.telefono,
      sitio_web: o.sitioWeb,
      nit: o.nit,
      dv: o.dv,
      direccion: o.direccion,
      ciudad: o.ciudad,
      departamento: o.departamento,
      pais_codigo: o.paisCodigo,
      pais_nombre: o.paisNombre,
      municipio_id: o.municipioId,
      codigo_postal: o.codigoPostal,
      color_primario: o.colorPrimario,
      color_secundario: o.colorSecundario,
      subdominio: o.subdominio,
      logo_url: o.logoUrl ?? null,
    },
    sucursal: {
      nombre: s.nombre,
      codigo: s.codigo,
      direccion: s.direccion,
      ciudad: s.ciudad,
      departamento: s.departamento,
      departamento_codigo: s.departamentoCodigo,
      pais_codigo: s.paisCodigo,
      pais_nombre: s.paisNombre,
      municipio_id: s.municipioId,
      codigo_postal: s.codigoPostal,
      telefono: s.telefono,
      correo: s.correo,
      nit: s.nit,
    },
  };
}

export async function crearOrganizacionInicial(
  supabase: SupabaseClient,
  datos: DatosAltaOrganizacion,
  opciones: { fetchImpl?: typeof fetch } = {},
): Promise<OrganizacionCreada> {
  const { data, error } = await supabase.rpc('fn_alta_organizacion', { p_datos: cuerpoRpcAlta(datos) });
  if (error) throw new Error(error.message);
  const r = data as { organization_id: number; branch_id: number } | null;
  if (!r?.organization_id) throw new Error('fn_alta_organizacion no devolvió la organización');
  const orgId = Number(r.organization_id);

  // Lo que sigue no bloquea el alta: si falla, se registra y se sigue.
  if (datos.tarifaPorDefecto) {
    try {
      await setOrganizationDefaultTaxByCode(supabase, orgId, datos.tarifaPorDefecto);
    } catch (e) {
      console.warn('[alta] No se pudo guardar la tarifa por defecto:', e);
    }
  }
  if (datos.referido) {
    try {
      const { error: errRef } = await supabase.rpc('fn_registrar_referido_vendedor', {
        p_referral_code: datos.referido,
        p_organization_id: orgId,
      });
      if (errRef) console.warn('[alta] No se pudo registrar el referido:', errRef.message);
    } catch (e) {
      console.warn('[alta] Error registrando el referido:', e);
    }
  }
  if (datos.atribucion) {
    try {
      const { error: errAttr } = await supabase.rpc('fn_guardar_signup_attribution', {
        p_organization_id: orgId,
        p_attribution: datos.atribucion,
      });
      if (errAttr) console.warn('[alta] No se pudo guardar la atribución:', errAttr.message);
    } catch (e) {
      console.warn('[alta] Error guardando la atribución:', e);
    }
  }
  try {
    const f = opciones.fetchImpl ?? fetch;
    const res = await f('/api/stripe/create-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: orgId,
        planCode: datos.planCodigo,
        billingPeriod: datos.periodo,
        useTrial: !datos.sinPrueba,
        customerName: datos.stripe?.nombreCliente,
        ...(datos.stripe?.customerId ? { existingCustomerId: datos.stripe.customerId } : {}),
        ...(datos.stripe?.paymentMethodId ? { paymentMethodId: datos.stripe.paymentMethodId } : {}),
        ...(datos.stripe?.cupon ? { couponCode: datos.stripe.cupon } : {}),
      }),
    });
    const cuerpo = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      subscriptionId?: string;
      customerId?: string;
      trialEnd?: string | null;
    };
    if (res.ok && cuerpo.success) {
      const cambios: Record<string, unknown> = {};
      if (cuerpo.subscriptionId) cambios.stripe_subscription_id = cuerpo.subscriptionId;
      if (cuerpo.customerId) cambios.stripe_customer_id = cuerpo.customerId;
      if (cuerpo.trialEnd && !datos.sinPrueba) cambios.trial_end = new Date(cuerpo.trialEnd).toISOString();
      if (Object.keys(cambios).length) await supabase.from('subscriptions').update(cambios).eq('organization_id', orgId);
    } else {
      console.warn('[alta] Stripe no creó la suscripción (la organización queda en prueba):', res.status);
    }
  } catch (e) {
    console.warn('[alta] Error llamando a Stripe (no bloquea):', e);
  }

  return { id: orgId, nombre: datos.organizacion.nombre, sucursalId: Number(r.branch_id) };
}
