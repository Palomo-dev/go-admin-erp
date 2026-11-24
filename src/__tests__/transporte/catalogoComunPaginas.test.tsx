/** @jest-environment jsdom */
/**
 * Catálogo común: las pantallas Vehículos y Conductores y domiciliarios se pintan con datos y
 * vacías, en los cuatro idiomas y sin claves faltantes, y la ruta (Logística o Transporte) decide
 * las migas.
 */
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import es from '../../../messages/es.json';
import en from '../../../messages/en.json';
import fr from '../../../messages/fr.json';
import pt from '../../../messages/pt.json';

let ruta = '/app/logistica/vehiculos';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => ruta,
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ ...jest.requireActual('@/components/shell/header/cabeceraMovil'), useCabeceraMovil: () => undefined }));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120 }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ getToday: () => '2026-11-24', timezone: 'America/Bogota', formatPlain: (v: string) => v, formatDate: (v: string) => v, formatTime: () => '10:00' }),
}));
jest.mock('@/lib/context/BranchContext', () => ({
  useBranch: () => ({ branches: [{ id: 3, name: 'Sede Centro' }], branchFilter: null, selectedBranchId: null, isLoading: false }),
}));
jest.mock('@/components/ui/use-toast', () => ({ toastSuccess: jest.fn(), toastError: jest.fn(), useToast: () => ({ toast: jest.fn() }) }));

const vehiculos: unknown[] = [];
const personas: unknown[] = [];
jest.mock('@/lib/services/transportService', () => ({
  transportService: {
    getVehicles: jest.fn(async () => vehiculos),
    getCarriers: jest.fn(async () => []),
    getBranches: jest.fn(async () => [{ id: 3, name: 'Sede Centro' }]),
    getAvailableEmployeesForDriver: jest.fn(async () => []),
  },
}));
jest.mock('@/lib/services/transporte/catalogoComunService', () => ({
  ...jest.requireActual('@/lib/services/transporte/catalogoComunService'),
  listarPersonasCatalogo: jest.fn(async () => personas),
}));
jest.mock('@/lib/services/transporte/documentosService', () => ({
  DocumentoError: class extends Error {},
  guardarDocumento: jest.fn(),
  listarDocumentos: jest.fn(async () => []),
}));

import { aPersona } from '@/lib/services/transporte/catalogoComunService';
import { VehiculosPage } from '@/components/transporte/vehiculos/VehiculosPage';
import { ConductoresPage } from '@/components/transporte/conductores/ConductoresPage';

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

function conDatos() {
  vehiculos.splice(
    0,
    vehiculos.length,
    {
      id: 'v1', organization_id: 120, plate: 'ABC 12F', vehicle_type: 'motorcycle', brand: 'AKT', model: 'NKD 125', year: 2024, capacity_kg: 20,
      status: 'available', is_active: true, current_driver_id: 'u1', soat_expiry: '2026-11-20', created_at: '', updated_at: '',
    },
    { id: 'v2', organization_id: 120, plate: 'WNP 101', vehicle_type: 'bus', passenger_capacity: 40, status: 'maintenance', is_active: true, created_at: '', updated_at: '' },
  );
  personas.splice(
    0,
    personas.length,
    aPersona({
      id: 'd1', organization_id: 120, branch_id: null, user_id: 'u1', employment_id: 'e1', full_name: 'Andrés Pérez', phone: null, document_type: 'CC',
      document_number: '1024556871', is_external: false, vehicle_type: 'motorcycle', license_number: '1024556871', license_category: 'A2',
      license_expiry: '2027-05-01', license_restrictions: null, medical_certificate_expiry: null, hazmat_certified: false, passenger_certified: false,
      is_active: true, metadata: {}, created_at: '', updated_at: '', employment: { id: 'e1', position: { name: 'Domiciliario' } },
    }),
    aPersona({
      id: 'd2', organization_id: 120, branch_id: 3, user_id: null, employment_id: null, full_name: 'Karen Díaz', phone: null, document_type: null,
      document_number: null, is_external: true, vehicle_type: 'bicycle', license_number: null, license_category: null, license_expiry: null,
      license_restrictions: null, medical_certificate_expiry: null, hazmat_certified: false, passenger_certified: false, is_active: false,
      metadata: {}, created_at: '', updated_at: '',
    }),
  );
}

function vacio() {
  vehiculos.splice(0, vehiculos.length);
  personas.splice(0, personas.length);
}

describe('Vehículos', () => {
  test.each(Object.keys(IDIOMAS) as Idioma[])('%s: lista con datos sin claves faltantes', async (idioma) => {
    conDatos();
    ruta = '/app/logistica/vehiculos';
    const errores = pintar(<VehiculosPage />, idioma);
    expect((await screen.findAllByText('ABC 12F')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('WNP 101').length).toBeGreaterThan(0);
    expect(errores).toEqual([]);
  });

  test('es: conductor, documento vencido, estado y migas de Logística', async () => {
    conDatos();
    ruta = '/app/logistica/vehiculos';
    pintar(<VehiculosPage />);
    await screen.findAllByText('ABC 12F');
    expect(screen.getAllByText('Andrés Pérez').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Domiciliario').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Vencido').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Disponible').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mantenimiento').length).toBeGreaterThan(0);
    expect(screen.getAllByText('40 pasajeros').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Logística').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Catálogo común · 2 vehículos').length).toBeGreaterThan(0);
  });

  test('vacío: «Aún no hay vehículos» con «Nuevo vehículo» e «Importar desde Excel»', async () => {
    vacio();
    ruta = '/app/transporte/vehiculos';
    const errores = pintar(<VehiculosPage />);
    expect(await screen.findByText('Aún no hay vehículos')).toBeTruthy();
    expect(screen.getAllByText('Importar desde Excel').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Nuevo vehículo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Transporte').length).toBeGreaterThan(0);
    expect(errores).toEqual([]);
  });
});

describe('Conductores y domiciliarios', () => {
  test.each(Object.keys(IDIOMAS) as Idioma[])('%s: lista con datos sin claves faltantes', async (idioma) => {
    conDatos();
    ruta = '/app/transporte/conductores';
    const errores = pintar(<ConductoresPage />, idioma);
    expect((await screen.findAllByText('Andrés Pérez')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Karen Díaz').length).toBeGreaterThan(0);
    expect(errores).toEqual([]);
  });

  test('es: cargo, externo, vehículo asignado, licencia y estado', async () => {
    conDatos();
    ruta = '/app/logistica/conductores';
    pintar(<ConductoresPage />);
    await screen.findAllByText('Andrés Pérez');
    expect(screen.getAllByText('Domiciliario').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Externo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ABC 12F').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Vigente').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Inactivo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('motos de más de 125 cc').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Catálogo común · 2 personas').length).toBeGreaterThan(0);
  });

  test('vacío desde Logística: registrar domiciliario', async () => {
    vacio();
    ruta = '/app/logistica/conductores';
    const errores = pintar(<ConductoresPage />);
    expect(await screen.findByText('Aún no hay conductores ni domiciliarios')).toBeTruthy();
    expect(screen.getAllByText('Registrar domiciliario').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Nueva persona').length).toBeGreaterThan(0);
    expect(errores).toEqual([]);
  });
});
