/** @jest-environment jsdom */
/**
 * «Cobrar y entregar» con envío activo (decisión del dueño 2026-11-25): abre el MISMO registro de
 * entrega de Logística (`DialogoEntregar`) con `cobroEnCaja`; al confirmar, una sola RPC entrega y
 * cobra en la caja. Sin `cobroEnCaja`, el registro de siempre (`markAsDelivered`).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import pt from '../../../../../messages/pt.json';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ code: 'COP', locale: 'es-CO', decimals: 0, formatear: (v: number) => `$ ${Number(v).toLocaleString('es-CO')}` }),
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ timezone: 'America/Bogota', getToday: () => '2026-11-25' }),
}));
const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({
  toastSuccess: (...a: unknown[]) => toastSuccess(...a),
  toastError: (...a: unknown[]) => toastError(...a),
}));
const markAsDelivered = jest.fn();
const entregarYCobrarEnCaja = jest.fn();
jest.mock('@/lib/services/deliveryIntegrationService', () => {
  class EnvioError extends Error {
    constructor(public readonly codigo: string) {
      super(codigo);
    }
  }
  return {
    EnvioError,
    deliveryIntegrationService: {
      markAsDelivered: (...a: unknown[]) => markAsDelivered(...a),
      entregarYCobrarEnCaja: (...a: unknown[]) => entregarYCobrarEnCaja(...a),
    },
  };
});
jest.mock('@/lib/services/shipmentsService', () => ({ shipmentsService: {} }));
const facturaParaCobroEnCaja = jest.fn(async () => ({ number: 'FACT-9', total: 250700, lineas: [] }));
jest.mock('@/lib/services/webOrderConfirmationService', () => ({
  webOrderConfirmationService: { facturaParaCobroEnCaja: (...a: unknown[]) => facturaParaCobroEnCaja(...(a as [])) },
}));

import { DialogoEntregar } from '../DialogosEnvio';
import { EnvioError } from '@/lib/services/deliveryIntegrationService';
import type { WebOrder } from '@/lib/services/webOrdersService';

const IDIOMAS = { es, en, fr, pt } as const;
type Idioma = keyof typeof IDIOMAS;

function pintar(ui: ReactElement, locale: Idioma = 'es') {
  const errores: string[] = [];
  const r = render(
    <NextIntlClientProvider locale={locale} messages={IDIOMAS[locale] as unknown as Record<string, never>} onError={(e) => errores.push(e.message)}>
      {ui}
    </NextIntlClientProvider>,
  );
  return { errores, ...r };
}

const ENVIO = { id: 's-1', cliente: 'Ana Gómez', contraentrega: 250700, codStatus: 'pending', codigoRequerido: true };
const PEDIDO = { id: 'wo-1', organization_id: 358, total: 270700 } as unknown as WebOrder;

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: true, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
beforeEach(() => jest.clearAllMocks());

describe('DialogoEntregar en modo caja', () => {
  it.each(['es', 'en', 'fr', 'pt'] as const)('%s: todos los textos existen', (locale) => {
    const { errores } = pintar(
      <DialogoEntregar
        abierto
        onAbiertoChange={() => undefined}
        envio={ENVIO}
        onEntregado={() => undefined}
        cobroEnCaja={{ order: PEDIDO, monto: 250700, cajaEtiqueta: null }}
      />,
      locale,
    );
    expect(errores).toEqual([]);
  });

  it('una sola RPC: entrega con código y cobra en la caja con la factura de «Cobrar»', async () => {
    entregarYCobrarEnCaja.mockResolvedValueOnce({
      ok: true, shipmentId: 's-1', proofId: 'p-1', codStatus: 'remitted', aviso: 'entregado',
      cobradoEnCaja: true, invoiceNumber: 'FACT-9', cashSessionId: 66, yaCobrado: false,
    });
    const onEntregado = jest.fn();
    pintar(
      <DialogoEntregar
        abierto
        onAbiertoChange={() => undefined}
        envio={ENVIO}
        onEntregado={onEntregado}
        cobroEnCaja={{ order: PEDIDO, monto: 250700, cajaEtiqueta: 'Entra a la caja 66 · Sede Centro' }}
      />,
    );
    expect(screen.getByText('Cobrar $ 250.700 en la caja')).toBeTruthy();
    expect(screen.getByText('Entra a la caja 66 · Sede Centro')).toBeTruthy();
    // En caja el monto no se edita: lo cobra la base.
    expect(screen.queryByLabelText(/Monto cobrado/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Código de entrega/), { target: { value: '7432' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Cobrar y entregar' }).at(-1)!);
    await waitFor(() => expect(onEntregado).toHaveBeenCalledWith({ aviso: 'entregado', factura: 'FACT-9', cobradoEnCaja: true }));
    expect(facturaParaCobroEnCaja).toHaveBeenCalledWith(PEDIDO);
    expect(entregarYCobrarEnCaja).toHaveBeenCalledWith(
      's-1',
      expect.objectContaining({ recipientName: 'Ana Gómez', recipientRelationship: 'customer' }),
      expect.objectContaining({ codigo: '7432', metodo: 'cash', factura: { number: 'FACT-9', total: 250700, lineas: [] } }),
    );
    expect(markAsDelivered).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith('Pedido cobrado y entregado', 'Factura FACT-9');
  });

  it('sin permiso de entrega: muestra el motivo de la base y no cierra', async () => {
    entregarYCobrarEnCaja.mockRejectedValueOnce(new EnvioError('SIN_PERMISO_ENTREGA'));
    const onEntregado = jest.fn();
    pintar(
      <DialogoEntregar
        abierto
        onAbiertoChange={() => undefined}
        envio={{ ...ENVIO, codigoRequerido: false }}
        onEntregado={onEntregado}
        cobroEnCaja={{ order: PEDIDO, monto: 250700, cajaEtiqueta: null }}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Cobrar y entregar' }).at(-1)!);
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'No se pudo cobrar y entregar',
        'Solo entrega el domiciliario asignado o quien tenga el permiso «Registrar entregas en oficina».',
      ),
    );
    expect(onEntregado).not.toHaveBeenCalled();
  });

  it('sin cobroEnCaja: el registro de siempre (contraentrega al cuadre del domiciliario)', async () => {
    markAsDelivered.mockResolvedValueOnce({ ok: true, shipmentId: 's-1', proofId: 'p-1', codStatus: 'collected', aviso: 'entregado' });
    const onEntregado = jest.fn();
    pintar(<DialogoEntregar abierto onAbiertoChange={() => undefined} envio={ENVIO} onEntregado={onEntregado} />);
    fireEvent.change(screen.getByLabelText(/Código de entrega/), { target: { value: '7432' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Marcar entregado' }).at(-1)!);
    await waitFor(() => expect(onEntregado).toHaveBeenCalledWith({ aviso: 'entregado' }));
    expect(markAsDelivered).toHaveBeenCalledWith('s-1', expect.anything(), { codigo: '7432', cobro: { metodo: 'cash', monto: 250700 } });
    expect(entregarYCobrarEnCaja).not.toHaveBeenCalled();
  });
});
