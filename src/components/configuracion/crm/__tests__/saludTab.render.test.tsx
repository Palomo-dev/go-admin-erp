/**
 * @jest-environment jsdom
 */
/**
 * Configuración › CRM › Salud de clientes (Figma pág. 10, sección 3080:36387):
 * el panel que reemplaza a la página «Factores de salud». Guarda con la barra
 * del diálogo («Guardar y recalcular»), cuenta cada peso y corte como un
 * cambio, bloquea Guardar si los pesos no suman 100, se queda en el diálogo al
 * guardar y dispara el recálculo sin esperarlo. Sin permiso, solo lectura.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { DEFAULT_HEALTH_CONFIG, type HealthConfigJson } from '@/lib/services/crm/healthBands';
import { CambiosContext, type CambiosPanel } from '../../dialogo/cambiosSinGuardar';
import { SaludTab } from '../SaludTab';

const mockGetConfig = jest.fn();
const mockGuardar = jest.fn();
const mockRefresh = jest.fn();
jest.mock('@/lib/services/crm/healthScoreService', () => {
  class ErrorConfigSaludApi extends Error {
    constructor(public readonly status: number, message: string, public readonly errores: string[]) {
      super(message);
    }
  }
  return {
    ErrorConfigSaludApi,
    healthScoreService: {
      getConfigSalud: () => mockGetConfig(),
      guardarConfigSalud: (c: unknown) => mockGuardar(c),
      refreshAllHealthScores: () => mockRefresh(),
      getPanelSalud: async () => [],
    },
  };
});
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120, name: 'Org de prueba' } }) }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${v}` }) }));
const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ toast: (x: unknown) => mockToast(x) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: mockPush }) }));
const mockPush = jest.fn();

const respuesta = (config: HealthConfigJson, extra: Partial<{ guardada: boolean; activa: boolean; puedeEditar: boolean }> = {}) => ({
  config,
  guardada: false,
  activa: true,
  puedeEditar: true,
  ...extra,
});

let registro: CambiosPanel | null;
function montar() {
  registro = null;
  return renderConIdioma(
    <CambiosContext.Provider value={(c) => (registro = c)}>
      <SaludTab />
    </CambiosContext.Provider>,
  );
}

const peso = (nombre: string) => screen.getByLabelText(`Peso de ${nombre}`) as HTMLInputElement;

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockGetConfig.mockReset();
  mockGuardar.mockReset();
  mockRefresh.mockReset();
  mockToast.mockReset();
  mockPush.mockReset();
});

test('propuesta inicial: aviso y la barra a la vista con «Propuesta inicial sin guardar» y «Guardar y recalcular»', async () => {
  mockGetConfig.mockResolvedValue(respuesta(DEFAULT_HEALTH_CONFIG));
  montar();
  expect(await screen.findByText('Tu organización aún no tiene factores guardados')).toBeTruthy();
  expect(screen.getByText('Suman 100 %')).toBeTruthy();
  // Las bandas van debajo de los indicadores (S2).
  const indicadores = screen.getByRole('heading', { name: 'Indicadores' });
  const bandas = screen.getByRole('heading', { name: 'Bandas' });
  expect(indicadores.compareDocumentPosition(bandas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(registro).toMatchObject({ cambios: 0, pendiente: true, etiquetaGuardar: 'Guardar y recalcular', aviso: { texto: 'Propuesta inicial sin guardar', tono: 'informacion' } });
  expect(registro?.bloqueado).toBeFalsy();
});

test('cada peso cuenta como un cambio; si no suman 100, Guardar se bloquea y no llama al servidor', async () => {
  mockGetConfig.mockResolvedValue(respuesta(DEFAULT_HEALTH_CONFIG, { guardada: true }));
  montar();
  await screen.findByText('Indicadores');
  expect(registro).toMatchObject({ cambios: 0 });
  expect(registro?.pendiente).toBeFalsy();

  fireEvent.change(peso('Días desde la última compra'), { target: { value: '35' } });
  expect(screen.getByText('Suman 105 %')).toBeTruthy();
  expect(screen.getByText('Revisa la configuración')).toBeTruthy();
  expect(registro).toMatchObject({ cambios: 1, bloqueado: true, aviso: { texto: 'Revisa los pesos antes de guardar', tono: 'peligro' } });
  await act(async () => {
    await registro?.guardar();
  });
  expect(mockGuardar).not.toHaveBeenCalled();

  fireEvent.change(peso('Días desde la última actividad'), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText('Saludable desde'), { target: { value: '75' } });
  expect(registro).toMatchObject({ cambios: 3 });
  expect(registro?.bloqueado).toBeFalsy();
  expect(registro?.aviso).toBeUndefined();

  act(() => registro?.descartar());
  expect(registro).toMatchObject({ cambios: 0 });
  expect(peso('Días desde la última compra').value).toBe('30');
});

test('guardar: se queda en el diálogo, avisa y dispara el recálculo sin esperarlo', async () => {
  mockGetConfig.mockResolvedValue(respuesta(DEFAULT_HEALTH_CONFIG));
  mockGuardar.mockImplementation(async (c: HealthConfigJson) => respuesta(c, { guardada: true }));
  mockRefresh.mockReturnValue(new Promise(() => undefined)); // nunca termina: guardar no lo espera
  montar();
  await screen.findByText('Indicadores');
  fireEvent.change(peso('Días desde la última compra'), { target: { value: '35' } });
  fireEvent.change(peso('Días desde la última actividad'), { target: { value: '10' } });

  await act(async () => {
    await registro?.guardar();
  });
  expect(mockGuardar).toHaveBeenCalledTimes(1);
  const enviado = mockGuardar.mock.calls[0][0] as HealthConfigJson;
  expect(enviado.indicators.find((i) => i.key === 'days_since_last_invoice')?.weight).toBe(35);
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Factores guardados' }));
  expect(mockPush).not.toHaveBeenCalled();
  await waitFor(() => expect(registro).toMatchObject({ cambios: 0 }));
  expect(registro?.pendiente).toBeFalsy();
  expect(screen.queryByText('Tu organización aún no tiene factores guardados')).toBeNull();
});

test('error al guardar: aviso «No se pudo guardar» y los cambios siguen ahí', async () => {
  mockGetConfig.mockResolvedValue(respuesta(DEFAULT_HEALTH_CONFIG, { guardada: true }));
  mockGuardar.mockRejectedValue(new Error('red'));
  montar();
  await screen.findByText('Indicadores');
  fireEvent.change(peso('Días desde la última compra'), { target: { value: '35' } });
  fireEvent.change(peso('Días desde la última actividad'), { target: { value: '10' } });
  await act(async () => {
    await registro?.guardar();
  });
  expect(screen.getByText('No se pudo guardar')).toBeTruthy();
  expect(registro).toMatchObject({ cambios: 2 });
  expect(mockRefresh).not.toHaveBeenCalled();
});

test('sin permiso: solo lectura, sin barra ni «Restaurar predeterminados»', async () => {
  mockGetConfig.mockResolvedValue(respuesta(DEFAULT_HEALTH_CONFIG, { guardada: true, activa: false, puedeEditar: false }));
  montar();
  expect(await screen.findByText('Solo un administrador puede cambiar los factores')).toBeTruthy();
  expect(screen.getByText('La medición de salud está desactivada para tu organización')).toBeTruthy();
  expect(peso('Días desde la última compra').disabled).toBe(true);
  expect(screen.queryByRole('button', { name: 'Restaurar predeterminados' })).toBeNull();
  expect(registro).toMatchObject({ cambios: 0 });
  expect(registro?.pendiente).toBeFalsy();
});

test('error al cargar: estado de error con «Reintentar»', async () => {
  mockGetConfig.mockRejectedValueOnce(new Error('caída')).mockResolvedValueOnce(respuesta(DEFAULT_HEALTH_CONFIG, { guardada: true }));
  montar();
  expect(await screen.findByText('No se pudo cargar la configuración')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
  expect(await screen.findByText('Indicadores')).toBeTruthy();
});
