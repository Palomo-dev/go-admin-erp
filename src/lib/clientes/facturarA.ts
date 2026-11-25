/**
 * «Facturar a: persona o empresa» (Figma «06 Clientes» 3201-21438, 2026-11-25), con el cambio del
 * dueño: el cobro NUNCA se bloquea. Con empresas ligadas el selector arranca en «Persona» (o en
 * «Consumidor final» si la ficha no tiene documento) con un aviso y la lista de empresas para escoger
 * con un toque; si el cajero no toca nada, la factura sale a la persona, como siempre.
 *
 * Regla contable (aprobada): con empresa escogida, la venta y la factura llevan `customer_id` = la
 * empresa (adquiriente: datos fiscales, cartera y retenciones) y `contact_customer_id` = la persona
 * (quien recibe; sus membresías e historial siguen en ella). El servidor valida el vínculo
 * (`fn_cliente_puede_facturar_a`, migración 20261125200000) y responde `empresa_no_ligada` si no.
 *
 * Módulo puro: sin React ni Supabase. Lo usan el cobro del POS (`checkoutRpc.ts`) y la factura de
 * venta manual (`FormularioFacturaVenta`).
 */
import { responsabilidadIvaDe, type CodigoIva } from './facturacionElectronica';

export type ModoFacturarA = 'consumidor_final' | 'persona' | 'empresa';

export interface FacturarA {
  modo: ModoFacturarA;
  /** Solo con `modo: 'empresa'`: la empresa ligada escogida. */
  empresaId: string | null;
}

/** Cómo arranca el selector: la persona si tiene documento; si no, consumidor final (como hoy). */
export function facturarAInicial(personaTieneDocumento: boolean): FacturarA {
  return { modo: personaTieneDocumento ? 'persona' : 'consumidor_final', empresaId: null };
}

/** ¿La elección es la de siempre? (no cambia nada en el sobre ni en la factura) */
export function esFacturaHabitual(f: FacturarA | null | undefined, personaTieneDocumento: boolean): boolean {
  if (!f) return true;
  if (f.modo === 'persona') return true;
  if (f.modo === 'consumidor_final') return !personaTieneDocumento;
  return !f.empresaId;
}

export interface PartesFactura {
  /** Adquiriente: `sales.customer_id` / `invoice_sales.customer_id`. `null` = consumidor final. */
  customer_id: string | null;
  /** Quien recibe (`contact_customer_id`). `null` = el adquiriente es la misma persona. */
  contact_customer_id: string | null;
}

/**
 * Adquiriente y contacto que viajan al servidor.
 *  - Persona (o sin elección): la persona, sin contacto — exactamente como antes.
 *  - Consumidor final sin documento en la ficha: también como antes (la cola de Factus ya factura a
 *    222222222222 cuando la ficha no tiene documento).
 *  - Consumidor final con documento: sin adquiriente y la persona como contacto.
 *  - Empresa escogida: la empresa como adquiriente y la persona como contacto.
 */
export function partesFactura(personaId: string | null | undefined, f: FacturarA | null | undefined, personaTieneDocumento: boolean): PartesFactura {
  const persona = personaId || null;
  if (!persona || !f || esFacturaHabitual(f, personaTieneDocumento)) return { customer_id: persona, contact_customer_id: null };
  if (f.modo === 'empresa' && f.empresaId && f.empresaId !== persona) return { customer_id: f.empresaId, contact_customer_id: persona };
  if (f.modo === 'consumidor_final') return { customer_id: null, contact_customer_id: persona };
  return { customer_id: persona, contact_customer_id: null };
}

/** El cliente cuya lista de precios (y plazo) manda: la empresa escogida; si no, la persona. */
export function clienteDePrecios(personaId: string | null | undefined, f: FacturarA | null | undefined): string | null {
  if (f?.modo === 'empresa' && f.empresaId) return f.empresaId;
  return personaId || null;
}

/** Empresa ligada con lo que muestra la tarjeta (razón social, NIT con DV, IVA 48/49, correo). */
export interface EmpresaFacturable {
  id: string;
  nombre: string;
  documento: string;
  iva: CodigoIva | null;
  correoFactura: string | null;
  cargo: string | null;
  principal: boolean;
}

export function ivaDeEmpresa(resps: readonly unknown[] | null | undefined): CodigoIva | null {
  return responsabilidadIvaDe(resps);
}

/**
 * «La última vez: <empresa>» — solo sugerencia, nunca se marca sola. Devuelve la empresa si sigue
 * ligada a la persona.
 */
export function sugerenciaUltimaVez(empresas: readonly EmpresaFacturable[], ultimaEmpresaId: string | null | undefined): EmpresaFacturable | null {
  if (!ultimaEmpresaId) return null;
  return empresas.find((e) => e.id === ultimaEmpresaId) ?? null;
}

/** La elección sigue siendo válida con estas empresas (p. ej. tras quitar un enlace)? Si no, vuelve al inicio. */
export function normalizarFacturarA(f: FacturarA, empresas: readonly { id: string }[], personaTieneDocumento: boolean): FacturarA {
  if (f.modo === 'empresa' && (!f.empresaId || !empresas.some((e) => e.id === f.empresaId))) return facturarAInicial(personaTieneDocumento);
  if (f.modo === 'persona' && !personaTieneDocumento) return facturarAInicial(false);
  return f;
}

/** Lo que el selector entrega a quien lo usa (cobro del POS, factura manual). */
export interface SeleccionFacturarA {
  valor: FacturarA;
  personaTieneDocumento: boolean;
  /** La empresa escogida (para el resumen «Factura a nombre de»), o null. */
  empresa: EmpresaFacturable | null;
}

/**
 * Cómo queda la elección guardada en el carrito del POS (`Cart.facturar_a`, localStorage y outbox):
 * `null` = la de siempre. Viaja con el carrito para que la lista de precios y el sobre la usen.
 */
export interface FacturarAGuardado {
  modo: ModoFacturarA;
  empresa_id: string | null;
  persona_tiene_documento: boolean;
}

export function aGuardado(f: FacturarA | null | undefined, personaTieneDocumento: boolean): FacturarAGuardado | null {
  if (!f || esFacturaHabitual(f, personaTieneDocumento)) return null;
  return { modo: f.modo, empresa_id: f.modo === 'empresa' ? f.empresaId : null, persona_tiene_documento: personaTieneDocumento };
}

export function desdeGuardado(g: FacturarAGuardado | null | undefined): FacturarA | null {
  return g ? { modo: g.modo, empresaId: g.empresa_id } : null;
}

export function mismaEleccion(a: FacturarAGuardado | null | undefined, b: FacturarAGuardado | null | undefined): boolean {
  const firma = (g: FacturarAGuardado | null | undefined) => (g ? `${g.modo}:${g.empresa_id ?? ''}:${g.persona_tiene_documento ? 1 : 0}` : '');
  return firma(a) === firma(b);
}

/** Adquiriente y contacto a partir de lo guardado en el carrito. */
export function partesDesdeGuardado(personaId: string | null | undefined, g: FacturarAGuardado | null | undefined): PartesFactura {
  return partesFactura(personaId, desdeGuardado(g), g?.persona_tiene_documento ?? false);
}
