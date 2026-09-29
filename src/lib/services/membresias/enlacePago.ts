/**
 * Enlace de pago de una membresía (Figma C5, opción «Enviar enlace de pago») — lógica pura.
 *
 * Contrato del dueño: al pagarse el enlace, la membresía se activa/renueva por el camino que ya
 * existe (`fn_registrar_pago` o pedido web → `fn_membresias_activar_venta`), sin lógica nueva de
 * activación. Hallazgo al investigar la infraestructura (docs/design/MEMBRESIAS-FASE-1-2.md §12.2):
 * ninguno de los enlaces de pago que existen hoy termina en ese camino.
 *
 *  - ERP · Stripe Payment Link (`stripePaymentLinkService`): solo para cotizaciones del CRM; el
 *    webhook registra con `fn_register_crm_payment`, que NO llama `fn_membresias_activar_venta`.
 *  - ERP · Bold link / QR (`cobroQrServidor`): solo POS y folio; la confirmación inserta un `payments`
 *    suelto (sin factura) y la venta del POS se crea después, desde el navegador.
 *  - Sitio web · «Pagar factura» (`/api/checkout/init` con `source=invoice`): el webhook
 *    (`handleInvoicePayment`) actualiza `invoice_sales` y `accounts_receivable` a mano, sin
 *    `fn_registrar_pago`, y busca la factura por número sin filtrar la organización.
 *
 * Por eso el enlace se muestra deshabilitado con su motivo. Cuando exista un riel que pague la
 * factura por `fn_registrar_pago` (decisión del dueño, §12), basta con cambiar
 * `RIEL_ENLACE_QUE_ACTIVA_MEMBRESIA` y añadir la creación en el servidor.
 */

/** Conectores de pasarela con checkout en línea (`integration_connectors.code`). */
export const PASARELAS_EN_LINEA = ['wompi_co', 'stripe_payments', 'bold_link', 'mp_checkout', 'payu_co', 'paypal_checkout'] as const;

export type PasarelaEnLinea = (typeof PASARELAS_EN_LINEA)[number];

/** ¿Hay un enlace de pago cuyo cobro active la membresía por `fn_registrar_pago`? Hoy no (ver arriba). */
export const RIEL_ENLACE_QUE_ACTIVA_MEMBRESIA = false;

export type MotivoEnlaceNoDisponible = 'sin_pasarela' | 'pago_no_activa_membresia' | 'membresia_cancelada';

export interface EstadoEnlacePago {
  disponible: boolean;
  motivo: MotivoEnlaceNoDisponible | null;
  /** Pasarelas en línea conectadas de la organización (solo códigos; nunca credenciales). */
  pasarelas: PasarelaEnLinea[];
}

export function pasarelasEnLinea(codigos: readonly (string | null | undefined)[]): PasarelaEnLinea[] {
  const set = new Set<string>();
  for (const c of codigos) if (c && (PASARELAS_EN_LINEA as readonly string[]).includes(c)) set.add(c);
  return PASARELAS_EN_LINEA.filter((p) => set.has(p));
}

export function evaluarEnlacePago(args: {
  estadoMembresia: string;
  pasarelasConectadas: readonly (string | null | undefined)[];
  rielQueActiva?: boolean;
}): EstadoEnlacePago {
  const pasarelas = pasarelasEnLinea(args.pasarelasConectadas);
  if (args.estadoMembresia === 'cancelled') return { disponible: false, motivo: 'membresia_cancelada', pasarelas };
  if (pasarelas.length === 0) return { disponible: false, motivo: 'sin_pasarela', pasarelas };
  if (!(args.rielQueActiva ?? RIEL_ENLACE_QUE_ACTIVA_MEMBRESIA)) {
    return { disponible: false, motivo: 'pago_no_activa_membresia', pasarelas };
  }
  return { disponible: true, motivo: null, pasarelas };
}
