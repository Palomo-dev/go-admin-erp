/** @jest-environment jsdom */
/**
 * Logística 1b — hoja «Asignar» con el vehículo (Figma «21 Logística» 3158-11641 … 3159-12140):
 * - SOAT vencido con el bloqueo efectivo: «Asignar» deshabilitado y la excepción pide el diálogo
 *   del supervisor; el PIN viaja a la RPC y un PIN errado se explica sin cerrar el diálogo;
 * - bici sin vehículo registrado: preseleccionada de forma explícita y asignada con ese motivo;
 * - los cuatro idiomas no tienen claves sin traducir en esos estados.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import pt from '../../../../../messages/pt.json';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ code: 'COP', formatear: (v: number) => `$ ${v}` }) }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatTime: () => '3:47 p. m.', formatPlain: (d: string) => d, getToday: () => '2026-11-24', timezone: 'America/Bogota' }),
}));

const mockAsignar = jest.fn();
const mockRevisar = jest.fn();
jest.mock('@/lib/services/deliveryIntegrationService', () => {
  class EnvioError extends Error {
    constructor(public codigo: string) {
      super(codigo);
    }
  }
  class AsignacionNoPasoError extends EnvioError {
    constructor(public resultado: { estado: string }) {
      super(resultado.estado.toUpperCase());
    }
  }
  return {
    EnvioError,
    AsignacionNoPasoError,
    deliveryIntegrationService: {
      getAvailableDrivers: jest.fn(async () => [
        { id: 'd1', full_name: 'Andrés Pérez', phone: '300', is_active: true, vehicle_type: 'motorcycle', default_vehicle_id: 'v2', license_category: 'A2', metadata: {} },
        { id: 'd2', full_name: 'Jhon Ramírez', phone: '301', is_active: true, vehicle_type: 'bicycle', metadata: {} },
      ]),
      getAvailableVehicles: jest.fn(async () => [
        { id: 'v2', plate: 'XYZ 34H', vehicle_type: 'motorcycle', status: 'available', ownership: 'driver', usage: 'logistics' },
        { id: 'v1', plate: 'ABC 12F', vehicle_type: 'motorcycle', status: 'available', ownership: 'company', usage: 'logistics' },
      ]),
      revisarAsignacion: (...a: unknown[]) => mockRevisar(...a),
      getAutorizadoresAsignacion: jest.fn(async () => [{ userId: 'u2', nombre: 'Carlos Mejía', tienePin: true }]),
      assignVehicleAndDriver: (...a: unknown[]) => mockAsignar(...a),
    },
  };
});
jest.mock('@/lib/services/logistica/despachoService', () => ({ enviosDeDomiciliarios: jest.fn(async () => []) }));

import { HojaAsignarDomiciliario } from '../HojaAsignarDomiciliario';
import { AsignacionNoPasoError } from '@/lib/services/deliveryIntegrationService';
import type { FilaDespacho } from '@/lib/logistica/despacho';

const IDIOMAS = { es, en, fr, pt } as const;
type Idioma = keyof typeof IDIOMAS;

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: true, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

function pintar(ui: ReactElement, locale: Idioma = 'es') {
  const errores: string[] = [];
  render(
    <NextIntlClientProvider locale={locale} messages={IDIOMAS[locale] as unknown as Record<string, never>} onError={(e) => errores.push(e.message)}>
      {ui}
    </NextIntlClientProvider>,
  );
  return errores;
}

function envio(p: Partial<FilaDespacho>): FilaDespacho {
  return {
    id: 'e1', numero: 'DEL-WO-418', status: 'pending', modo: 'own', branchId: 1, canal: 'web', pedido: 'WO-000418', pedidoWebId: 'w1',
    creado: '2026-11-24T15:00:00Z', cliente: 'Ana', telefono: null, direccion: 'Cra 45 #12-30', ciudad: 'Bogotá', barrio: 'Chapinero',
    instrucciones: null, promesa: '2026-11-24T18:00:00Z', fechaEsperada: null, valor: 128900, moneda: null, contraentrega: 0, codStatus: null,
    pagado: true, domiciliarioId: null, domiciliario: null, vehiculoId: null, asignado: null, intentosFallidos: 0, motivoNovedad: null,
    codigoRequerido: false, ...p,
  };
}

const revision = (p: Record<string, unknown>) => ({
  fecha: '2026-11-24', tipoPersona: 'motorcycle', requiereVehiculo: true, vehiculo: null, sinVehiculo: null, peso: 2, volumen: null,
  bloqueos: [], avisos: [], bloqueoActivo: false, hayAutorizadorConPin: false, bloquea: false, admiteExcepcion: false, origen: 'defecto', vehiculoOcupado: false, ...p,
});
const SOAT_VENCIDO = { causa: 'soat', grupo: 'vehiculo', vence: '2026-11-20', dias: null, excepcion: true, categoria: null, requeridas: [], valor: null, capacidad: null };
const V2 = { id: 'v2', placa: 'XYZ 34H', tipo: 'motorcycle', dueno: 'driver', ownerDriverId: 'd1', capacidadKg: null, capacidadM3: null };

describe('Logística 1b · hoja «Asignar» con vehículo', () => {
  beforeEach(() => {
    mockAsignar.mockReset();
    mockRevisar.mockReset();
  });

  test('SOAT vencido con bloqueo efectivo: preselecciona el por defecto, bloquea y pide la excepción con PIN', async () => {
    mockRevisar.mockResolvedValue(revision({ vehiculo: V2, bloqueos: [SOAT_VENCIDO], bloqueoActivo: true, hayAutorizadorConPin: true, bloquea: true, admiteExcepcion: true }));
    const onAsignado = jest.fn();
    const errores = pintar(<HojaAsignarDomiciliario abierto onAbiertoChange={() => undefined} organizationId={7} envios={[envio({})]} onAsignado={onAsignado} />);
    fireEvent.click(await screen.findByRole('radio', { name: /Andrés Pérez/ }));
    expect(await screen.findByText('No se puede asignar con XYZ 34H')).toBeTruthy();
    expect(screen.getByText('Obligatorio en moto')).toBeTruthy();
    const boton = screen.getByRole('button', { name: 'Asignar 1 envío' }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);

    // PIN errado: la base lo rechaza (y lo cuenta sobre el PIN del supervisor); el diálogo sigue abierto.
    mockAsignar.mockRejectedValueOnce(new (AsignacionNoPasoError as unknown as new (r: unknown) => Error)({ ok: false, estado: 'pin_rechazado', intentosRestantes: 4 }));
    fireEvent.click(screen.getByRole('button', { name: /Pedir autorización al supervisor/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Autorización requerida' });
    await within(dialogo).findByText(/Carlos Mejía escribe su PIN/);
    fireEvent.change(dialogo.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: '000000' } });
    fireEvent.click(within(dialogo).getByRole('radio', { name: 'Entrega urgente' }));
    const autorizar = within(dialogo).getByRole('button', { name: /Autorizar y asignar/ }) as HTMLButtonElement;
    await waitFor(() => expect(autorizar.disabled).toBe(false));
    fireEvent.click(autorizar);
    expect(await within(dialogo).findByText(/PIN incorrecto. Te quedan 4 intentos/)).toBeTruthy();
    expect(mockAsignar).toHaveBeenCalledWith('e1', 'v2', 'd1', undefined, {
      sinVehiculo: null,
      excepcion: { motivo: 'Entrega urgente', supervisorId: 'u2', pin: '000000' },
    });
    expect(onAsignado).not.toHaveBeenCalled();
    expect(errores).toEqual([]);
  });

  test('bici sin vehículo registrado: la opción es explícita y se guarda con ese motivo', async () => {
    mockRevisar.mockResolvedValue(revision({ tipoPersona: 'bicycle', requiereVehiculo: false, sinVehiculo: 'bicycle', origen: 'tipo' }));
    mockAsignar.mockResolvedValue({ asignacion: { estado: 'asignado' } });
    const onAsignado = jest.fn();
    const errores = pintar(<HojaAsignarDomiciliario abierto onAbiertoChange={() => undefined} organizationId={7} envios={[envio({})]} onAsignado={onAsignado} />);
    fireEvent.click(await screen.findByRole('radio', { name: /Jhon Ramírez/ }));
    expect(await screen.findByText('Sin SOAT, tecnomecánica ni licencia')).toBeTruthy();
    expect(screen.getByText('Opcional en bicicleta')).toBeTruthy();
    const boton = screen.getByRole('button', { name: 'Asignar 1 envío' }) as HTMLButtonElement;
    await waitFor(() => expect(boton.disabled).toBe(false));
    fireEvent.click(boton);
    await waitFor(() => expect(onAsignado).toHaveBeenCalled());
    expect(mockAsignar).toHaveBeenCalledWith('e1', null, 'd2', undefined, { sinVehiculo: 'bicycle', excepcion: null });
    expect(errores).toEqual([]);
  });

  test.each(['en', 'fr', 'pt'] as Idioma[])('%s: bloqueo, revisión y aviso de capacidad sin claves sin traducir', async (idioma) => {
    mockRevisar.mockResolvedValue(
      revision({
        vehiculo: V2,
        bloqueos: [SOAT_VENCIDO],
        avisos: [{ causa: 'tecnomecanica', grupo: 'vehiculo', vence: '2026-12-06', dias: 12, excepcion: false, categoria: null, requeridas: [], valor: null, capacidad: null },
                 { causa: 'capacidad_kg', grupo: 'capacidad', vence: null, dias: null, excepcion: false, categoria: null, requeridas: [], valor: 168, capacidad: 150 }],
        bloqueoActivo: true, hayAutorizadorConPin: true, bloquea: true, admiteExcepcion: true,
      }),
    );
    const errores = pintar(<HojaAsignarDomiciliario abierto onAbiertoChange={() => undefined} organizationId={7} envios={[envio({})]} />, idioma);
    fireEvent.click(await screen.findByRole('radio', { name: /Andrés Pérez/ }));
    await waitFor(() => expect(mockRevisar).toHaveBeenCalled());
    await screen.findAllByText(/XYZ 34H/);
    expect(errores).toEqual([]);
  });
});
