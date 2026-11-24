/** @jest-environment jsdom */
/**
 * Contraentrega en Pedidos online (Figma 3014:194407 › 04–07): la tarjeta «Pago contra entrega»
 * con sus cuatro estados, el aviso del anticipo pendiente, los totales, la celda del listado y el
 * «Ya pagado en línea» del cuadre. Las claves `contraentregaPedidos` existen en los cuatro idiomas.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import es from '../../../../../../messages/es.json';
import en from '../../../../../../messages/en.json';
import fr from '../../../../../../messages/fr.json';
import pt from '../../../../../../messages/pt.json';

const filasPedidos: Record<string, unknown[]> = {};
function consulta(tabla: string) {
  const r = {
    select: () => r,
    eq: () => r,
    in: () => r,
    order: () => r,
    limit: () => r,
    maybeSingle: async () => ({ data: tabla === 'organization_payment_methods' ? null : null, error: null }),
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: filasPedidos[tabla] ?? [], error: null }).then(ok),
  };
  return r;
}
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: (t: string) => consulta(t), rpc: jest.fn() } }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${Number(v).toLocaleString('es-CO')}` }) }));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

import { AvisoAnticipoPendiente, ChipContraentrega, TarjetaContraentrega, TotalesContraentrega, pagoDelAnticipo } from '../TarjetaContraentrega';
import { PagoContraentregaCelda, muestraCeldaContraentrega } from '../PagoContraentregaCelda';
import { AnticiposCuadre } from '@/components/logistica/cuadres/AnticiposCuadre';
import type { WebOrder } from '@/lib/services/webOrdersService';

const conIntl = (ui: ReactElement, messages: Record<string, unknown> = es) =>
  render(
    <NextIntlClientProvider locale="es" messages={messages} timeZone="America/Bogota">
      {ui}
    </NextIntlClientProvider>,
  );

const base = {
  id: '00000000-0000-0000-0000-000000000415',
  organization_id: 1,
  branch_id: 3,
  order_number: 'WO-000415',
  status: 'pending',
  source: 'website',
  subtotal: 142000,
  tax_total: 0,
  discount_total: 0,
  delivery_fee: 9000,
  tip_amount: 0,
  total: 151000,
  delivery_type: 'delivery_own',
  is_scheduled: false,
  payment_status: 'pending',
  payment_method: 'cash',
  customer_phone: '3184442109',
  created_at: '2026-11-24T19:50:00Z',
  updated_at: '2026-11-24T19:50:00Z',
} as unknown as WebOrder;

const enMin = (min: number) => new Date(Date.now() + min * 60_000).toISOString();

describe('claves en los cuatro idiomas', () => {
  const claves = (o: Record<string, unknown>, p = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? claves(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));
  it('mismas claves en es, en, fr y pt', () => {
    const ref = claves((es as Record<string, Record<string, unknown>>).contraentregaPedidos).sort();
    expect(ref.length).toBeGreaterThan(50);
    for (const m of [en, fr, pt]) expect(claves((m as Record<string, Record<string, unknown>>).contraentregaPedidos).sort()).toEqual(ref);
  });
});

describe('tarjeta «Pago contra entrega»', () => {
  it('A · sin anticipo: cobra el total al entregar', () => {
    conIntl(<TarjetaContraentrega order={base} timezone="America/Bogota" onCambio={jest.fn()} />);
    expect(screen.getByText('Sin anticipo')).toBeTruthy();
    expect(screen.getByText('$ 151.000')).toBeTruthy();
  });

  it('B · pendiente: vence, enlace por WhatsApp y marcar recibido; aviso arriba', () => {
    const o = { ...base, advance_amount: 9000, advance_status: 'pending', advance_due_at: enMin(28), advance_gateway: 'wompi_co' } as WebOrder;
    conIntl(
      <>
        <AvisoAnticipoPendiente order={o} timezone="America/Bogota" />
        <TarjetaContraentrega order={o} timezone="America/Bogota" onCambio={jest.fn()} />
      </>,
    );
    expect(screen.getByText('Anticipo pendiente')).toBeTruthy();
    expect(screen.getByText('Anticipo (el envío)')).toBeTruthy();
    expect(screen.getByText('Wompi')).toBeTruthy();
    expect(screen.getByText('$ 142.000')).toBeTruthy();
    expect(screen.getByText(/vence a las .* Si no se paga, el pedido se cancela solo/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enviar enlace de pago por WhatsApp' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Marcar anticipo recibido…' })).toBeTruthy();
  });

  it('C · pagado: cobrar al entregar = total − anticipo; totales con el anticipo', () => {
    const o = { ...base, payment_status: 'partial', advance_amount: 9000, advance_status: 'paid', advance_reference: 'WP-8841', advance_gateway: 'wompi_co' } as WebOrder;
    conIntl(
      <>
        <TarjetaContraentrega order={o} timezone="America/Bogota" onCambio={jest.fn()} />
        <TotalesContraentrega order={o} />
      </>,
    );
    expect(screen.getByText('Anticipo pagado')).toBeTruthy();
    expect(screen.getByText('WP-8841')).toBeTruthy();
    expect(screen.getByText('Anticipo pagado en línea (envío)')).toBeTruthy();
    expect(screen.getByText('−$ 9.000')).toBeTruthy();
    expect(screen.getAllByText('$ 142.000').length).toBeGreaterThanOrEqual(2);
  });

  it('A · sin anticipo: «Registrar cobro» solo si el pedido ya se puede cobrar', () => {
    const registrar = jest.fn();
    const { unmount } = conIntl(<TarjetaContraentrega order={base} timezone="America/Bogota" onCambio={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Registrar cobro' })).toBeNull();
    unmount();
    conIntl(<TarjetaContraentrega order={base} timezone="America/Bogota" onCambio={jest.fn()} onRegistrarCobro={registrar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }));
    expect(registrar).toHaveBeenCalledTimes(1);
  });

  it('C · pagado: fecha del pago del anticipo y «Ver el anticipo»', () => {
    const o = { ...base, payment_status: 'partial', advance_amount: 9000, advance_status: 'paid', advance_reference: 'WP-8841', advance_gateway: 'wompi_co' } as WebOrder;
    const ver = jest.fn();
    const pagos = [
      { id: 'p1', pasarela: 'wompi', metodo: 'wompi_co', submetodo: null, marcaTarjeta: null, ultimos4: null, referencia: 'WP-8841', fecha: '2026-11-24T19:53:00Z', monto: 9000, estado: 'completed' },
    ] as const;
    conIntl(<TarjetaContraentrega order={o} timezone="America/Bogota" onCambio={jest.fn()} pagos={pagos} onVerAnticipo={ver} />);
    expect(screen.getByText('Fecha')).toBeTruthy();
    expect(screen.getByText(/14:53/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ver el anticipo' }));
    expect(ver).toHaveBeenCalledTimes(1);
  });

  it('pagoDelAnticipo: por referencia y, sin ella, el único completado por ese monto', () => {
    const p = (referencia: string | null, monto: number, estado = 'completed') => ({ referencia, monto, estado, fecha: 'x' });
    expect(pagoDelAnticipo({ advance_amount: 9000, advance_reference: 'R1' }, [p('R0', 9000), p('R1', 9000)])?.referencia).toBe('R1');
    expect(pagoDelAnticipo({ advance_amount: 9000, advance_reference: null }, [p(null, 9000), p(null, 151000)])?.monto).toBe(9000);
    expect(pagoDelAnticipo({ advance_amount: 9000, advance_reference: null }, [p(null, 9000), p(null, 9000)])).toBeNull();
    expect(pagoDelAnticipo({ advance_amount: 9000, advance_reference: null }, [p(null, 9000, 'failed')])).toBeNull();
  });

  it('chip de la cabecera: «Contraentrega · anticipo pagado»; nada si no es contraentrega', () => {
    const o = { ...base, advance_amount: 9000, advance_status: 'paid' } as WebOrder;
    const { container } = conIntl(
      <>
        <ChipContraentrega order={o} />
        <ChipContraentrega order={{ ...base, payment_method: 'wompi_co' } as WebOrder} />
      </>,
    );
    expect(screen.getByText('Contraentrega · anticipo pagado')).toBeTruthy();
    expect(container.textContent).toBe('Contraentrega · anticipo pagado');
  });

  it('chip en los cuatro idiomas', () => {
    const o = { ...base, advance_amount: 9000, advance_status: 'pending' } as WebOrder;
    for (const m of [en, fr, pt]) {
      const { container, unmount } = conIntl(<ChipContraentrega order={o} />, m);
      expect(container.textContent).not.toMatch(/contraentregaPedidos|detalle\.chip/);
      unmount();
    }
  });

  it('D · vencido: cancelado sin cobro', () => {
    const o = { ...base, status: 'expired', payment_status: 'failed', advance_amount: 9000, advance_status: 'expired', advance_due_at: '2026-11-24T20:20:00Z' } as WebOrder;
    conIntl(<TarjetaContraentrega order={o} timezone="America/Bogota" onCambio={jest.fn()} />);
    expect(screen.getByText('Anticipo vencido')).toBeTruthy();
    expect(screen.getByText('Cancelado · sin cobro')).toBeTruthy();
  });

  it('un pedido de pasarela o para recoger no pinta nada', () => {
    const { container } = conIntl(
      <>
        <TarjetaContraentrega order={{ ...base, payment_method: 'wompi_co' } as WebOrder} timezone="America/Bogota" onCambio={jest.fn()} />
        <TarjetaContraentrega order={{ ...base, delivery_type: 'pickup' } as WebOrder} timezone="America/Bogota" onCambio={jest.fn()} />
      </>,
    );
    expect(container.textContent).toBe('');
  });
});

describe('listado y cuadre', () => {
  it('celda «Pago»: «Cobrar $ X» o «Anticipo vence HH:MM»', () => {
    expect(muestraCeldaContraentrega(base)).toBe(true);
    expect(muestraCeldaContraentrega({ ...base, payment_status: 'paid' })).toBe(false);
    conIntl(<PagoContraentregaCelda pedido={base} timezone="America/Bogota" formatear={(v) => `$ ${v.toLocaleString('es-CO')}`} />);
    expect(screen.getByText('Contraentrega')).toBeTruthy();
    expect(screen.getByText('Cobrar $ 151.000')).toBeTruthy();
  });

  it('cuadre: «Ya pagado en línea» con la nota por pedido', async () => {
    filasPedidos.shipments = [{ source_id: base.id }];
    filasPedidos.web_orders = [{ order_number: 'WO-000415', advance_amount: '9000.00', advance_status: 'paid', advance_gateway: 'wompi_co' }];
    conIntl(<AnticiposCuadre organizationId={1} shipmentIds={['s-1']} />);
    await waitFor(() => expect(screen.getByText('Ya pagado en línea')).toBeTruthy());
    expect(screen.getByText(/WO-000415 · Anticipo de \$ 9\.000 ya pagado con Wompi: no se cobra en la puerta\./)).toBeTruthy();
  });
});
