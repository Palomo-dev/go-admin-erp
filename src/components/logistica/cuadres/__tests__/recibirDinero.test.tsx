/** @jest-environment jsdom */
/**
 * Hoja «Recibir dinero»: sin caja abierta no se recibe; con faltante exige motivo (el reparto del
 * faltante a la última línea lo prueba cuadresVista.test); al confirmar abre el cuadre y, en UNA
 * llamada (`recibirYCerrarCuadre`, RPC transaccional), recibe cada línea con su medio
 * (datáfono → card, QR → breb_qr) y cierra.
 * Y la pantalla de Domiciliarios (alta rápida) en los cuatro idiomas.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import pt from '../../../../../messages/pt.json';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => undefined }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${Number(v).toLocaleString('es-CO')}` }) }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatTime: () => '7:02 a. m.', getToday: () => '2026-11-22', timezone: 'America/Bogota' }),
}));
jest.mock('@/lib/context/BranchContext', () => ({ useBranch: () => ({ branches: [{ id: 3, name: 'Sede Centro' }], selectedBranchId: 3, branchFilter: 3 }) }));

const abrirCuadre = jest.fn();
const recibirYCerrarCuadre = jest.fn();
jest.mock('@/lib/services/logistica/cuadresDomiciliarioService', () => ({
  CuadreError: class extends Error {
    constructor(public codigo: string) {
      super(codigo);
    }
  },
  abrirCuadre: (...a: unknown[]) => abrirCuadre(...a),
  recibirYCerrarCuadre: (...a: unknown[]) => recibirYCerrarCuadre(...a),
}));
const registrarDomiciliario = jest.fn();
jest.mock('../../logisticaApi', () => ({
  LogisticaApiError: class extends Error {},
  leerCandidatos: jest.fn(async () => ({ empleados: [], miembros: [] })),
  registrarDomiciliario: (...a: unknown[]) => registrarDomiciliario(...a),
}));

import { RecibirDineroHoja, type LineaHoja } from '../RecibirDineroHoja';
import { RegistrarDomiciliarioDialog } from '../../domiciliarios/RegistrarDomiciliarioDialog';
import type { FilaCuadre } from '@/lib/logistica/cuadresVista';

const IDIOMAS = { es, en, fr, pt } as const;
function pintar(ui: ReactElement, locale: keyof typeof IDIOMAS = 'es') {
  const errores: string[] = [];
  render(
    <NextIntlClientProvider locale={locale} messages={IDIOMAS[locale] as unknown as Record<string, never>} onError={(e) => errores.push(e.message)}>
      {ui}
    </NextIntlClientProvider>,
  );
  return errores;
}

const fila: FilaCuadre = {
  clave: 'pendiente:d1:3',
  cuadreId: null,
  driverId: 'd1',
  branchId: 3,
  fecha: '2026-11-22T14:00:00Z',
  estado: 'por_recibir',
  entregas: 4,
  esperado: 286900,
  porMedio: { efectivo: 188900, datafono: 64000, transferencia: 34000 },
  diferencia: 0,
  motivo: null,
  responsable: null,
  pendienteContador: false,
};
// Antes de abrir el cuadre, las líneas son los envíos cobrados (id = envío).
const previas: LineaHoja[] = [
  { id: 's1', shipment_id: 's1', source_type: null, source_id: null, esperado: 128900, reportado: 128900, metodo_reportado: 'cash', recibido: null, status: 'pending', numero: 'WO-000412' },
  { id: 's2', shipment_id: 's2', source_type: null, source_id: null, esperado: 60000, reportado: 60000, metodo_reportado: 'cash', recibido: null, status: 'pending', numero: 'WO-000415' },
  { id: 's3', shipment_id: 's3', source_type: null, source_id: null, esperado: 64000, reportado: 64000, metodo_reportado: 'card', recibido: null, status: 'pending', numero: 'POS-V-1088' },
  { id: 's4', shipment_id: 's4', source_type: null, source_id: null, esperado: 34000, reportado: 34000, metodo_reportado: 'qr', recibido: null, status: 'pending', numero: 'WO-000419' },
];
const linea = (l: LineaHoja, id: string) => ({ ...l, id, source_type: 'web_order', source_id: `wo-${id}`, diferencia: 0, motivo: null, payment_id: null, metodo_recibido: null });
const cuadreAbierto = {
  settlement_id: 'cs-1', status: 'open', branch_id: 3, driver_id: 'd1', cash_session_id: 7, esperado: 286900, recibido: 0, diferencia: 0,
  esperado_por_metodo: {}, recibido_por_metodo: {}, accounting_status: 'not_required',
  lineas: previas.map((l, i) => linea(l, `l${i + 1}`)),
};

const caja = { id: 7, opened_at: '2026-11-22T12:02:00Z' };

beforeAll(() => {
  // PanelAdaptable decide hoja o panel con matchMedia (jsdom no lo trae): escritorio.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({ matches: true, media: q, onchange: null, addEventListener: jest.fn(), removeEventListener: jest.fn(), addListener: jest.fn(), removeListener: jest.fn(), dispatchEvent: jest.fn() }),
  });
});
beforeEach(() => jest.clearAllMocks());

describe.each(Object.keys(IDIOMAS) as (keyof typeof IDIOMAS)[])('cuatro idiomas: %s', (locale) => {
  test('Recibir dinero y Registrar domiciliario sin claves faltantes', () => {
    expect(
      pintar(
        <RecibirDineroHoja abierta onAbiertaChange={jest.fn()} fila={fila} organizationId={120} nombreDomiciliario="Andrés Pérez" nombreSede="Sede Centro" lineasIniciales={previas} caja={caja} onTerminado={jest.fn()} />,
        locale,
      ),
    ).toEqual([]);
  });
  test('alta rápida', () => {
    expect(pintar(<RegistrarDomiciliarioDialog abierto onAbiertoChange={jest.fn()} onRegistrado={jest.fn()} candidatos={{ empleados: [], miembros: [] }} />, locale)).toEqual([]);
  });
});

describe('Recibir dinero', () => {
  test('sin caja abierta en la sede no se puede recibir', () => {
    pintar(<RecibirDineroHoja abierta onAbiertaChange={jest.fn()} fila={fila} organizationId={120} nombreDomiciliario="Andrés Pérez" nombreSede="Sede Centro" lineasIniciales={previas} caja={null} onTerminado={jest.fn()} />);
    const boton = screen.getByRole('button', { name: 'Recibir y cerrar cuadre' }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(boton.title).toBe('No hay caja abierta en la sede');
  });

  test('cuadra exacto: abre y, en una sola llamada, recibe cada línea con su medio y cierra sin motivo', async () => {
    abrirCuadre.mockResolvedValue(cuadreAbierto);
    recibirYCerrarCuadre.mockResolvedValue({ ...cuadreAbierto, status: 'closed', diferencia: 0 });
    const onTerminado = jest.fn();
    pintar(<RecibirDineroHoja abierta onAbiertaChange={jest.fn()} fila={fila} organizationId={120} nombreDomiciliario="Andrés Pérez" nombreSede="Sede Centro" lineasIniciales={previas} caja={caja} onTerminado={onTerminado} />);
    expect(screen.getByText('Entran a Caja 7: $ 188.900')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Recibir y cerrar cuadre' }));
    await waitFor(() => expect(onTerminado).toHaveBeenCalled());
    expect(abrirCuadre).toHaveBeenCalledWith({}, { organizationId: 120, branchId: 3, driverId: 'd1' });
    expect(recibirYCerrarCuadre).toHaveBeenCalledTimes(1);
    const [, p] = recibirYCerrarCuadre.mock.calls[0];
    expect(p).toMatchObject({ settlementId: 'cs-1', motivo: null, responsable: null, detalleResponsable: null });
    const llamadas = p.recibos.map((r: { linea: { id: string }; metodo: string; monto: number; motivoDiferencia: string | null }) => [r.linea.id, r.metodo, r.monto, r.motivoDiferencia]);
    expect(llamadas).toEqual([
      ['l1', 'cash', 128900, null],
      ['l2', 'cash', 60000, null],
      ['l3', 'card', 64000, null],
      ['l4', 'breb_qr', 34000, null],
    ]);
  });

  test('faltante en efectivo: aparece el motivo de la diferencia y sin motivo no se recibe nada', async () => {
    abrirCuadre.mockResolvedValue(cuadreAbierto);
    recibirYCerrarCuadre.mockResolvedValue({ ...cuadreAbierto, status: 'closed', diferencia: -4000 });
    const onTerminado = jest.fn();
    pintar(<RecibirDineroHoja abierta onAbiertaChange={jest.fn()} fila={fila} organizationId={120} nombreDomiciliario="Andrés Pérez" nombreSede="Sede Centro" lineasIniciales={previas} caja={caja} onTerminado={onTerminado} />);

    const contadoEfectivo = screen.getByRole('textbox', { name: /Contado en Efectivo/ });
    fireEvent.change(contadoEfectivo, { target: { value: '184900' } });
    fireEvent.blur(contadoEfectivo);
    expect(await screen.findByText('Motivo de la diferencia')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Recibir y cerrar cuadre' }));
    expect(screen.getByText('Elige el motivo de la diferencia.')).toBeTruthy();
    expect(abrirCuadre).not.toHaveBeenCalled();
    expect(recibirYCerrarCuadre).not.toHaveBeenCalled();
  });

  test('si la base rechaza, no se termina y se ve el error (nada queda a medias: es una transacción)', async () => {
    abrirCuadre.mockResolvedValue(cuadreAbierto);
    const { CuadreError } = jest.requireMock('@/lib/services/logistica/cuadresDomiciliarioService') as { CuadreError: new (c: string) => Error };
    recibirYCerrarCuadre.mockRejectedValue(new CuadreError('METODO_INVALIDO'));
    const onTerminado = jest.fn();
    pintar(<RecibirDineroHoja abierta onAbiertaChange={jest.fn()} fila={fila} organizationId={120} nombreDomiciliario="Andrés Pérez" nombreSede="Sede Centro" lineasIniciales={previas} caja={caja} onTerminado={onTerminado} />);
    fireEvent.click(screen.getByRole('button', { name: 'Recibir y cerrar cuadre' }));
    expect(await screen.findByText(es.logistica.cuadres.errores.METODO_INVALIDO)).toBeTruthy();
    expect(onTerminado).not.toHaveBeenCalled();
  });
});

describe('Registrar domiciliario', () => {
  test('externo: valida y manda el alta sin organización (la pone el servidor)', async () => {
    registrarDomiciliario.mockResolvedValue({ domiciliario: { id: 'nuevo', full_name: 'Luisa Martínez' } });
    const onRegistrado = jest.fn();
    pintar(<RegistrarDomiciliarioDialog abierto onAbiertoChange={jest.fn()} onRegistrado={onRegistrado} candidatos={{ empleados: [], miembros: [] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(screen.getByText('Escribe el nombre completo.')).toBeTruthy();
    expect(registrarDomiciliario).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Nombre completo/), { target: { value: 'Luisa Martínez' } });
    fireEvent.change(screen.getByLabelText(/^Celular/), { target: { value: '315 220 41 87' } });
    fireEvent.change(screen.getByLabelText(/Número de documento/), { target: { value: '1.020.456.789' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(registrarDomiciliario).toHaveBeenCalled());
    const alta = registrarDomiciliario.mock.calls[0][0];
    expect(alta).toMatchObject({ nombre: 'Luisa Martínez', tipoDocumento: 'CC', branchId: 3, cobraContraentrega: true, employmentId: null });
    // El celular sale del PhoneInput del kit (con indicativo de Colombia).
    expect(String(alta.celular).replace(/\D/g, '')).toContain('3152204187');
    expect(alta).not.toHaveProperty('organization_id');
    await waitFor(() => expect(onRegistrado).toHaveBeenCalledWith({ id: 'nuevo', full_name: 'Luisa Martínez' }));
  });
});
