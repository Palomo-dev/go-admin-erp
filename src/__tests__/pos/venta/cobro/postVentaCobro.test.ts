/**
 * L51 y L52 (POS-PLAN §2.6): qué pasa después de cobrar, extraído literal de
 * `handleCheckout` (`CheckoutDialog.tsx`) a
 * `src/lib/pos/venta/cobro/postVentaCobro.ts`. Servicios simulados: fija qué
 * se llama en cada caso y en qué orden (ticket → cajón), sin impresoras ni red.
 *
 * El orden completo del diálogo (recibo → «Gracias» → háptica → ticket →
 * cajón → envío → factura) sigue escrito en `handleCheckout`; el plan solo
 * decide qué hace cada paso.
 */

import {
  AVISO_SIN_IMPRESORA_CAJA,
  AVISO_VENTA_SIN_SUCURSAL,
  estadoPostVenta,
  lanzarTicketYCajon,
  planPostVenta,
  type EntradaPlanPostVenta,
  type ServiciosTicketYCajon,
} from '@/lib/pos/venta/cobro/postVentaCobro';

const EN_LINEA = { id: 'venta-1' };
const SIN_RED = { id: 'venta-2', pending_sync: true, receipt_number_local: 'OFF-7-3' };

const ENTRADA: EntradaPlanPostVenta = {
  sale: EN_LINEA,
  branchId: 7,
  payments: [{ id: 'p1', method: 'cash', amount: 30000 }],
  deliveryType: 'delivery_own',
  deliveryAddress: 'Cra 1 # 2-3',
  sendToFactus: true,
};

/** Servicios de mentira que anotan el orden de las llamadas. */
function servicios(encolado: Promise<{ enqueued: number }>, cajon: Promise<unknown> = Promise.resolve({ ok: true })) {
  const orden: string[] = [];
  const s: ServiciosTicketYCajon & { advertencias: string[]; errores: string[] } = {
    advertencias: [],
    errores: [],
    encolarTicket: jest.fn(() => { orden.push('ticket'); return encolado; }),
    abrirCajon: jest.fn(() => { orden.push('cajon'); return cajon; }),
    avisarAdvertencia: (m) => { s.advertencias.push(m); },
    avisarError: (m) => { s.errores.push(m); },
  };
  return { s, orden };
}

/** Deja correr los `.then` / `.catch` pendientes. */
const drenar = () => new Promise((r) => setTimeout(r, 0));

describe('L51 · venta sin red (Desktop, outbox)', () => {
  it('con red: sin número local y la pantalla recibe el id de la venta', () => {
    expect(estadoPostVenta(EN_LINEA)).toEqual({ pendienteSincronizar: false, numeroLocal: null, saleIdPantalla: 'venta-1' });
  });

  it('sin red: número OFF-…, saleId nulo para «Gracias», y envío y factura electrónica quedan para después', () => {
    expect(estadoPostVenta(SIN_RED)).toEqual({ pendienteSincronizar: true, numeroLocal: 'OFF-7-3', saleIdPantalla: null });
    const plan = planPostVenta({ ...ENTRADA, sale: SIN_RED });
    expect(plan.envio).toBe('avisar_sin_red');
    expect(plan.factura).toBe('avisar_sin_red');
    // El ticket y el cajón no dependen de la red: salen igual (el ticket con «Pendiente de sincronizar»).
    expect(plan.ticket).toBe('encolar');
    expect(plan.abrirCajon).toBe(true);
  });
});

describe('L52 · qué se hace tras la venta', () => {
  it('con red: ticket, cajón (hay efectivo), envío propio con dirección y factura', () => {
    expect(planPostVenta(ENTRADA)).toMatchObject({ ticket: 'encolar', abrirCajon: true, envio: 'hacer', factura: 'hacer' });
  });

  it('sin efectivo no se abre el cajón; sin sucursal ni ticket ni cajón; tercero o sin dirección no crea envío', () => {
    expect(planPostVenta({ ...ENTRADA, payments: [{ id: 'p1', method: 'card', amount: 30000 }] }).abrirCajon).toBe(false);
    expect(planPostVenta({ ...ENTRADA, branchId: null })).toMatchObject({ ticket: 'sin_sucursal', abrirCajon: false });
    expect(planPostVenta({ ...ENTRADA, deliveryType: 'delivery_third_party' }).envio).toBe('nada');
    expect(planPostVenta({ ...ENTRADA, deliveryAddress: '' }).envio).toBe('nada');
    expect(planPostVenta({ ...ENTRADA, sendToFactus: false }).factura).toBe('nada');
  });

  it('ticket antes que cajón, sin esperar a ninguno; con impresora no hay aviso', async () => {
    const { s, orden } = servicios(Promise.resolve({ enqueued: 1 }));
    lanzarTicketYCajon({ ticket: 'encolar', abrirCajon: true }, s);
    expect(orden).toEqual(['ticket', 'cajon']);
    await drenar();
    expect(s.advertencias).toEqual([]);
    expect(s.errores).toEqual([]);
  });

  it('sin impresora de caja: aviso y el recibo queda para impresión manual; si encolar falla, error visible', async () => {
    const sinImpresora = servicios(Promise.resolve({ enqueued: 0 }));
    lanzarTicketYCajon({ ticket: 'encolar', abrirCajon: false }, sinImpresora.s);
    await drenar();
    expect(sinImpresora.s.advertencias).toEqual([AVISO_SIN_IMPRESORA_CAJA]);
    expect(sinImpresora.s.abrirCajon).not.toHaveBeenCalled();

    const falla = servicios(Promise.reject(new Error('cola caída')));
    lanzarTicketYCajon({ ticket: 'encolar', abrirCajon: false }, falla.s);
    await drenar();
    expect(falla.s.errores).toEqual(['No se pudo encolar la impresión física del recibo: cola caída']);
  });

  it('sin sucursal: solo el aviso; un cajón que falla solo se registra, sin avisar al cajero', async () => {
    const sinSucursal = servicios(Promise.resolve({ enqueued: 1 }));
    lanzarTicketYCajon({ ticket: 'sin_sucursal', abrirCajon: false }, sinSucursal.s);
    expect(sinSucursal.s.encolarTicket).not.toHaveBeenCalled();
    expect(sinSucursal.s.advertencias).toEqual([AVISO_VENTA_SIN_SUCURSAL]);

    const registro = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const cajonRoto = servicios(Promise.resolve({ enqueued: 1 }), Promise.reject(new Error('sin puerto')));
    lanzarTicketYCajon({ ticket: 'encolar', abrirCajon: true }, cajonRoto.s);
    await drenar();
    expect(registro).toHaveBeenCalledWith('[cashDrawer] No se pudo abrir el cajón:', 'sin puerto');
    expect(cajonRoto.s.errores).toEqual([]);
    expect(cajonRoto.s.advertencias).toEqual([]);
    registro.mockRestore();
  });
});
