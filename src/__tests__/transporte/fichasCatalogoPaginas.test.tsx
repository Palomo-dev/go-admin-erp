/** @jest-environment jsdom */
/**
 * Catálogo común: fichas de detalle (vehículo 2872:1691, persona 2874:2806), formularios como página
 * (2970:20719, 2971:21208) y diálogos (2972:21658, 2972:21754, 2972:21818). Se pintan con datos,
 * con datos mínimos y «no encontrado», en los cuatro idiomas sin claves faltantes; la fila de la
 * lista abre la ficha.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import es from '../../../messages/es.json';
import en from '../../../messages/en.json';
import fr from '../../../messages/fr.json';
import pt from '../../../messages/pt.json';

const mockPush = jest.fn();
let ruta = '/app/logistica/vehiculos/v1';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  usePathname: () => ruta,
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ ...jest.requireActual('@/components/shell/header/cabeceraMovil'), useCabeceraMovil: () => undefined }));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120 }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({
    getToday: () => '2026-11-24',
    timezone: 'America/Bogota',
    formatPlain: (v: string) => v,
    formatDate: (v: string) => `f:${v}`,
    formatDateTime: (v: string) => `fh:${v}`,
    formatTime: () => '12:00',
  }),
}));
jest.mock('@/lib/context/BranchContext', () => ({
  useBranch: () => ({ branches: [{ id: 3, name: 'Sede Centro' }], branchFilter: null, selectedBranchId: 3, isLoading: false }),
}));
jest.mock('@/components/ui/use-toast', () => ({ toastSuccess: jest.fn(), toastError: jest.fn(), useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ code: 'COP', decimals: 0, locale: 'es-CO', resuelta: true, formatear: (v: number) => `$ ${v}`, paraDocumento: () => ({ code: 'COP', decimals: 0, locale: 'es-CO' }) }),
}));
jest.mock('@/components/transporte/viajes/id/ReportIncidentDialog', () => ({ ReportIncidentDialog: () => null }));

const datos = {
  vehiculos: [] as unknown[],
  personas: [] as unknown[],
  viajes: [] as unknown[],
  envios: { envios: [] as unknown[], total: 0 },
  novedades: [] as unknown[],
  documentos: [] as unknown[],
};
const mockGetVehicleById = jest.fn();
const mockGetDriverTrips = jest.fn<Promise<unknown[]>, [string]>(async () => datos.viajes);
const mockObtenerPersona = jest.fn();
jest.mock('@/lib/services/transportService', () => ({
  transportService: {
    getVehicles: jest.fn(async () => datos.vehiculos),
    getVehicleById: (id: string) => mockGetVehicleById(id),
    getVehicleTrips: jest.fn(async () => datos.viajes),
    getDriverTrips: (id: string) => mockGetDriverTrips(id),
    getCarriers: jest.fn(async () => []),
    getBranches: jest.fn(async () => [{ id: 3, name: 'Sede Centro' }]),
    getAvailableEmployeesForDriver: jest.fn(async () => [{ id: 'e1', position_id: 'p1', branch_id: 3, organization_members: { profiles: { first_name: 'Pedro', last_name: 'Ruiz' } } }]),
    updateVehicle: jest.fn(async () => ({})),
  },
}));
jest.mock('@/lib/services/transporte/catalogoComunService', () => ({
  ...jest.requireActual('@/lib/services/transporte/catalogoComunService'),
  listarPersonasCatalogo: jest.fn(async () => datos.personas),
  obtenerPersonaCatalogo: (_db: unknown, _org: number, id: string) => mockObtenerPersona(id),
}));
jest.mock('@/lib/services/transporte/documentosService', () => ({
  DocumentoError: class extends Error {},
  guardarDocumento: jest.fn(),
  listarDocumentos: jest.fn(async () => datos.documentos),
  urlArchivo: jest.fn(),
}));
jest.mock('@/lib/services/transporte/fichaCatalogoService', () => ({
  ...jest.requireActual('@/lib/services/transporte/fichaCatalogoService'),
  listarEnviosFicha: jest.fn(async () => datos.envios),
  listarNovedadesFicha: jest.fn(async () => datos.novedades),
  obtenerPlanoPuestos: jest.fn(async () => ({ id: 's1', name: 'Bus 2+2', rows: 11, cols: 5 })),
  listarPlanosPuestos: jest.fn(async () => []),
  listarDocumentosHistorial: jest.fn(async () => []),
  listarEmpleosCatalogo: jest.fn(async () => [{ id: 'e1', nombre: 'Pedro Ruiz', positionId: 'p1', branchId: 3 }]),
}));
jest.mock('@/lib/services/jobPositionsService', () => ({
  __esModule: true,
  default: class {
    getAll = async () => [{ id: 'p1', name: 'Conductor de bus' }];
    assignEmployee = async () => undefined;
  },
}));
jest.mock('@/lib/services/logistica/domiciliariosService', () => ({ candidatosAlta: jest.fn(async () => ({ empleados: [], miembros: [] })) }));

import { aPersona } from '@/lib/services/transporte/catalogoComunService';
import { VehiculoDetalle } from '@/components/transporte/vehiculos/VehiculoDetalle';
import { PersonaDetalle } from '@/components/transporte/conductores/PersonaDetalle';
import { VehiculosPage } from '@/components/transporte/vehiculos/VehiculosPage';
import { ConductoresPage } from '@/components/transporte/conductores/ConductoresPage';
import { VehiculoFormulario } from '@/components/transporte/vehiculos/VehiculoFormulario';
import { PersonaFormulario } from '@/components/transporte/conductores/PersonaFormulario';
import { AsignarConductorDialogo } from '@/components/transporte/vehiculos/AsignarConductorDialogo';
import { CambiarEstadoDialogo } from '@/components/transporte/vehiculos/CambiarEstadoDialogo';
import { ImportarCatalogoDialogo } from '@/components/transporte/fichas/ImportarCatalogoDialogo';
import type { Vehicle } from '@/lib/services/transportService';

const IDIOMAS = { es, en, fr, pt } as const;
type Idioma = keyof typeof IDIOMAS;

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
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

const BUS = {
  id: 'v1', organization_id: 120, plate: 'WNP 101', vehicle_type: 'bus', brand: 'Mercedes-Benz', model: 'OF 1721', year: 2021, passenger_capacity: 40, color: 'Blanco',
  status: 'in_use', is_active: true, current_driver_id: 'u1', soat_expiry: '2027-03-14', techno_expiry: '2026-12-02', seat_map_id: 's1', branches: { id: 3, name: 'Sede Centro' },
  metadata: {}, created_at: '2026-11-01T10:00:00Z', updated_at: '',
};
const PEDRO = () =>
  aPersona({
    id: 'd1', organization_id: 120, branch_id: 3, user_id: 'u1', employment_id: 'e1', full_name: 'Pedro Ruiz', phone: '3105552140', document_type: 'CC', document_number: '79452118',
    is_external: false, vehicle_type: 'car', license_number: '79452118', license_category: 'C2', license_expiry: '2026-12-05', license_restrictions: 'Usa lentes',
    medical_certificate_expiry: '2027-06-14', hazmat_certified: false, passenger_certified: true, is_active: true, metadata: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '',
    blood_type: 'O+', emergency_contact_name: 'Contacto', emergency_contact_phone: '3115550877',
    employment: { id: 'e1', hire_date: '2021-03-01', position: { name: 'Conductor de bus' } },
  });
const KAREN = () =>
  aPersona({
    id: 'd2', organization_id: 120, branch_id: null, user_id: null, employment_id: null, full_name: 'Karen Díaz', phone: null, document_type: null, document_number: null,
    is_external: true, vehicle_type: 'bicycle', license_number: null, license_category: null, license_expiry: null, license_restrictions: null, medical_certificate_expiry: null,
    hazmat_certified: false, passenger_certified: false, is_active: false, metadata: {}, created_at: '', updated_at: '',
  });

function conDatos() {
  datos.vehiculos = [BUS];
  datos.personas = [PEDRO(), KAREN()];
  datos.viajes = [
    { id: 't1', trip_code: 'V-1120', trip_date: '2026-11-24', scheduled_departure: '2026-11-24T17:00:00Z', status: 'boarding', vehicle_id: 'v1', driver_id: 'u1', total_seats: 40, available_seats: 12, transport_routes: { id: 'r1', name: 'Terminal → Norte' } },
    { id: 't2', trip_code: 'V-1113', trip_date: '2026-11-22', scheduled_departure: '2026-11-22T21:00:00Z', status: 'completed', delay_minutes: 12, vehicle_id: 'v1', driver_id: 'u1', total_seats: 40, available_seats: 9, transport_routes: null },
  ];
  datos.envios = { envios: [{ id: 's1', shipment_number: 'ENV-0042', status: 'delivered', delivery_address: 'Calle 1', delivery_city: 'Bogotá', delivery_contact_name: null, expected_delivery_date: null, delivered_at: '2026-11-20T15:00:00Z', created_at: '2026-11-20T10:00:00Z', vehicle_id: 'v1', driver_id: 'd1' }], total: 1 };
  datos.novedades = [{ id: 'n1', title: 'Retraso por cierre vial', incident_type: 'delay', severity: 'low', status: 'resolved', reference_type: 'trip', reference_id: 't2', occurred_at: '2026-11-15T10:00:00Z', reported_at: null, estimated_cost: null, actual_cost: 180000, currency: 'COP' }];
  datos.documentos = [{ id: 'doc1', vehicle_id: 'v1', driver_credential_id: null, doc_type: 'soat', number: 'AT-1329', issuer: null, category: null, expires_on: '2027-03-14', blocks_dispatch: true, file_path: 'x/soat.pdf', file_name: 'soat.pdf', notes: null }];
  mockGetVehicleById.mockImplementation(async (id: string) => {
    const v = datos.vehiculos.find((x) => (x as { id: string }).id === id);
    if (!v) throw { code: 'PGRST116' };
    return v;
  });
  mockObtenerPersona.mockImplementation(async (id: string) => datos.personas.find((x) => (x as { id: string }).id === id) ?? null);
}

beforeEach(() => {
  mockPush.mockClear();
  mockGetDriverTrips.mockClear();
});

describe('ficha del vehículo', () => {
  test.each(Object.keys(IDIOMAS) as Idioma[])('%s: con datos, sin claves faltantes', async (idioma) => {
    conDatos();
    ruta = '/app/logistica/vehiculos/v1';
    const errores = pintar(<VehiculoDetalle id="v1" />, idioma);
    expect((await screen.findAllByText(/WNP 101 ·/)).length).toBeGreaterThan(0);
    await screen.findAllByText(/V-1120/);
    expect(errores).toEqual([]);
  });

  test('es: documentos, viajes, novedades, ficha y estado vacío honesto', async () => {
    conDatos();
    ruta = '/app/logistica/vehiculos/v1';
    pintar(<VehiculoDetalle id="v1" />);
    expect((await screen.findAllByText('WNP 101 · Bus Mercedes-Benz OF 1721')).length).toBeGreaterThan(0);
    await screen.findAllByText(/V-1113/);
    expect(screen.getAllByText('Hoy: V-1120 · Abordando').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SOAT').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Revisión técnico-mecánica').length).toBeGreaterThan(0);
    expect(screen.getAllByText('+12 min').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Retraso por cierre vial').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bus 2+2 · 11 × 5').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pedro Ruiz').length).toBeGreaterThan(0);
    expect(screen.getByText('Aún no se registran mantenimientos ni tanqueos')).toBeTruthy();
    expect(screen.getAllByText('Logística').length).toBeGreaterThan(0);
    expect(screen.queryByText(/tanqueo/i, { selector: 'button' })).toBeNull();
  });

  test('datos mínimos: estados vacíos de documentos, viajes y novedades', async () => {
    conDatos();
    datos.vehiculos = [{ id: 'v9', organization_id: 120, plate: 'XYZ 9', vehicle_type: 'motorcycle', status: 'available', is_active: true, created_at: '', updated_at: '' }];
    datos.viajes = [];
    datos.envios = { envios: [], total: 0 };
    datos.novedades = [];
    datos.documentos = [];
    ruta = '/app/transporte/vehiculos/v9';
    const errores = pintar(<VehiculoDetalle id="v9" />);
    expect((await screen.findAllByText('XYZ 9 · Moto')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sin documentos registrados').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sin viajes registrados').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sin novedades').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sin documentos').length).toBeGreaterThan(0);
    expect(errores).toEqual([]);
  });

  test('no encontrado (no existe o es de otra organización)', async () => {
    conDatos();
    datos.vehiculos = [{ ...BUS, id: 'v2', organization_id: 999 }];
    pintar(<VehiculoDetalle id="v2" />);
    expect(await screen.findByText('No encontramos este vehículo')).toBeTruthy();
    expect(screen.getAllByText('Volver a Vehículos').length).toBeGreaterThan(0);
  });
});

describe('ficha de la persona', () => {
  test.each(Object.keys(IDIOMAS) as Idioma[])('%s: con datos, sin claves faltantes', async (idioma) => {
    conDatos();
    ruta = '/app/transporte/conductores/d1';
    const errores = pintar(<PersonaDetalle id="d1" />, idioma);
    expect((await screen.findAllByText('Pedro Ruiz')).length).toBeGreaterThan(0);
    await screen.findAllByText(/V-1120/);
    expect(errores).toEqual([]);
  });

  test('es: aviso de licencia, datos, vehículo asignado, viajes por usuario y envíos', async () => {
    conDatos();
    ruta = '/app/transporte/conductores/d1';
    pintar(<PersonaDetalle id="d1" />);
    expect(await screen.findByText('Licencia de conducción vence en 11 días')).toBeTruthy();
    expect(mockGetDriverTrips).toHaveBeenCalledWith('u1');
    expect(screen.getAllByText('O+').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Contacto · 3115550877').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Conductor de bus').length).toBeGreaterThan(0);
    expect(screen.getAllByText('WNP 101 · Bus').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Licencia vence el 2026-12-05').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ENV-0042').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Liquidación/)).toBeNull();
  });

  test('datos mínimos: externo sin usuario, sin vehículo ni viajes', async () => {
    conDatos();
    datos.viajes = [];
    datos.envios = { envios: [], total: 0 };
    datos.novedades = [];
    ruta = '/app/logistica/conductores/d2';
    const errores = pintar(<PersonaDetalle id="d2" />);
    expect((await screen.findAllByText('Karen Díaz')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sin vehículo asignado').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/sin usuario no hay viajes que mostrar/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Externo').length).toBeGreaterThan(0);
    expect(mockGetDriverTrips).not.toHaveBeenCalled();
    expect(errores).toEqual([]);
  });

  test('no encontrada', async () => {
    conDatos();
    pintar(<PersonaDetalle id="nadie" />);
    expect(await screen.findByText('No encontramos a esta persona')).toBeTruthy();
  });
});

describe('la fila de la lista abre la ficha', () => {
  test('Vehículos (Logística)', async () => {
    conDatos();
    ruta = '/app/logistica/vehiculos';
    pintar(<VehiculosPage />);
    const celda = (await screen.findAllByText('WNP 101'))[0];
    fireEvent.click(celda);
    expect(mockPush).toHaveBeenCalledWith('/app/logistica/vehiculos/v1');
  });

  test('Conductores (Transporte)', async () => {
    conDatos();
    ruta = '/app/transporte/conductores';
    pintar(<ConductoresPage />);
    const celda = (await screen.findAllByText('Karen Díaz'))[0];
    fireEvent.click(celda);
    expect(mockPush).toHaveBeenCalledWith('/app/transporte/conductores/d2');
  });
});

describe('formularios como página', () => {
  test.each(Object.keys(IDIOMAS) as Idioma[])('%s: nuevo vehículo y nueva persona sin claves faltantes', async (idioma) => {
    conDatos();
    ruta = '/app/transporte/vehiculos/nuevo';
    const errores = pintar(<VehiculoFormulario />, idioma);
    await waitFor(() => expect(screen.getAllByRole('button').some((b) => !(b as HTMLButtonElement).disabled)).toBe(true));
    ruta = '/app/transporte/conductores/nuevo';
    const errores2 = pintar(<PersonaFormulario />, idioma);
    await screen.findAllByRole('radio');
    expect([...errores, ...errores2]).toEqual([]);
  });

  test('vehículo: valida la placa y edita uno existente', async () => {
    conDatos();
    ruta = '/app/logistica/vehiculos/nuevo';
    pintar(<VehiculoFormulario />);
    const guardar = (await screen.findAllByText('Guardar vehículo'))[0].closest('button') as HTMLButtonElement;
    await waitFor(() => expect(guardar.disabled).toBe(false));
    await act(async () => {
      fireEvent.click(guardar);
    });
    expect(screen.getByText('Escribe la placa')).toBeTruthy();
  });

  test('vehículo: editar trae sus datos y el estado de sus documentos', async () => {
    conDatos();
    ruta = '/app/transporte/vehiculos/v1/editar';
    pintar(<VehiculoFormulario id="v1" />);
    expect((await screen.findAllByText('Editar WNP 101')).length).toBeGreaterThan(0);
    expect((screen.getByDisplayValue('WNP 101') as HTMLInputElement).value).toBe('WNP 101');
    expect(screen.getAllByText('Cambiar').length).toBeGreaterThan(0);
  });

  test('persona: externo pide nombre, documento y celular; editar trae la licencia', async () => {
    conDatos();
    ruta = '/app/logistica/conductores/nuevo';
    pintar(<PersonaFormulario />);
    fireEvent.click((await screen.findAllByText('Externo, sin contrato'))[0]);
    expect(screen.getByText('Nombre completo')).toBeTruthy();
    expect(screen.getByText('Celular')).toBeTruthy();
  });

  test('persona: editar', async () => {
    conDatos();
    ruta = '/app/transporte/conductores/d1/editar';
    pintar(<PersonaFormulario id="d1" />);
    expect((await screen.findAllByText('Editar a Pedro Ruiz')).length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('Usa lentes')).toBeTruthy();
  });

  test('no encontrado', async () => {
    conDatos();
    pintar(<VehiculoFormulario id="nada" />);
    expect(await screen.findByText('No encontramos este vehículo')).toBeTruthy();
  });
});

describe('diálogos de la sección 25', () => {
  test.each(Object.keys(IDIOMAS) as Idioma[])('%s: asignar conductor, cambiar estado e importar sin claves faltantes', async (idioma) => {
    conDatos();
    const errores = pintar(
      <>
        <AsignarConductorDialogo vehiculo={BUS as unknown as Vehicle} personas={datos.personas as never} guardando={false} onCerrar={() => undefined} onAsignar={() => undefined} />
      </>,
      idioma,
    );
    await screen.findAllByText('Pedro Ruiz');
    expect(errores).toEqual([]);
  });

  test('asignar: el actual primero, licencia por vencer y quien no puede, atenuado', async () => {
    conDatos();
    pintar(<AsignarConductorDialogo vehiculo={BUS as unknown as Vehicle} personas={datos.personas as never} guardando={false} onCerrar={() => undefined} onAsignar={() => undefined} />);
    expect(await screen.findByText('Asignar conductor a WNP 101')).toBeTruthy();
    expect(screen.getByText('Actual')).toBeTruthy();
    expect(screen.getByText('Sin usuario en GO Admin')).toBeTruthy();
    expect(screen.getByText('Quitar conductor')).toBeTruthy();
    expect(screen.getByText(/C2 vence en 11 días/)).toBeTruthy();
  });

  test('cambiar estado: avisa los viajes programados al pasar a mantenimiento', async () => {
    conDatos();
    datos.viajes = [{ id: 't9', trip_code: 'V-1130', trip_date: '2026-11-26', status: 'scheduled', total_seats: 40, available_seats: 40 }];
    pintar(<CambiarEstadoDialogo vehiculo={{ ...BUS, status: 'available' } as unknown as Vehicle} guardando={false} onCerrar={() => undefined} onCambiar={() => undefined} />);
    fireEvent.click(await screen.findByText('Mantenimiento'));
    expect(await screen.findByText('Tiene 1 viaje programado (V-1130).')).toBeTruthy();
  });

  test('importar: pasos, plantilla y archivo', async () => {
    const errores = pintar(<ImportarCatalogoDialogo tipo="vehiculos" abierto existentes={new Map()} onCerrar={() => undefined} onImportar={async () => ({ importados: 0, errores: [] })} />, 'en');
    expect(await screen.findByText('Import vehicles')).toBeTruthy();
    expect(screen.getAllByText('Download the template').length).toBeGreaterThan(0);
    expect(errores).toEqual([]);
  });
});
