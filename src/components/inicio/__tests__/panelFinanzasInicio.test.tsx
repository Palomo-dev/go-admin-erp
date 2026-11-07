/**
 * @jest-environment jsdom
 */
/**
 * Panel de Finanzas en «Módulos» del inicio (Figma 2360:42278 con
 * pendientes, 2360:43042 al día). Render real con next-intl en los cuatro
 * idiomas: una clave que falte saldría cruda. Cifras ficticias.
 */
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatTime: (v: string) => (v ? '8:05 a. m.' : '') }),
}));

import { fireEvent, waitFor, within } from '@testing-library/react';
import { ModulosInicio } from '../ModulosInicio';
import { PREFERENCIAS_VACIAS } from '@/lib/dashboard/preferenciasInicio';
import { resumirModulo } from '@/lib/dashboard/resumenModulos';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { PanelFinanzasInicio, nombreMes } from '../PanelFinanzasInicio';
import { armarFinanzas, type CrudoFinanzasInicio } from '@/lib/dashboard/finanzasInicio';
import type { CifraModulo } from '@/lib/dashboard/resumenModulos';

const IDIOMAS: IdiomaPrueba[] = ['es', 'en', 'fr', 'pt'];
const sinClavesCrudas = (texto: string | null) =>
  expect(texto ?? '').not.toMatch(/\b(inicioFinanzas|home|pendientes|kpis|fila)\.[a-zA-Z]/);
const cifra = (c: CifraModulo) => (c.tipo === 'moneda' ? `$ ${c.valor}` : c.tipo === 'numero' ? String(c.valor) : c.texto.clave);

const CON_PENDIENTES: CrudoFinanzasInicio = {
  dia: '2026-11-07',
  pendientesContables: { estado: 'ok', datos: { cantidad: 3, bloqueanCierre: 0 } },
  conciliaciones: { estado: 'ok', datos: { cantidad: 1, unica: { id: 'r1', mes: { anio: 2026, mes: 10 } } } },
  dian: { estado: 'ok', datos: { rechazados: 2, sinEnviar: 0 } },
  periodos: { estado: 'ok', datos: { cantidad: 1, ultimo: { anio: 2026, mes: 10 } } },
  resultado: { estado: 'ok', datos: { utilidad: 9050000, mes: { anio: 2026, mes: 10 }, desde: '2026-10-01', hasta: '2026-10-31' } },
};

const AL_DIA: CrudoFinanzasInicio = {
  ...CON_PENDIENTES,
  pendientesContables: { estado: 'ok', datos: { cantidad: 0, bloqueanCierre: 0 } },
  conciliaciones: { estado: 'ok', datos: { cantidad: 0, unica: null } },
  dian: { estado: 'ok', datos: { rechazados: 0, sinEnviar: 0 } },
  periodos: { estado: 'ok', datos: { cantidad: 0, ultimo: null } },
};

const datos = (crudo: CrudoFinanzasInicio) =>
  armarFinanzas({
    crudo,
    moneda: 'COP',
    vencidas: 14,
    kpis: [
      { etiqueta: 'carteraVencida', cifra: { tipo: 'moneda', valor: 3100000, moneda: 'COP' }, detalle: { clave: 'detalles.cuentasDias', params: { n: 14, dias: 42 } }, tono: 'peligro' },
      { etiqueta: 'porPagar7d', cifra: { tipo: 'moneda', valor: 4200000, moneda: 'COP' }, detalle: { clave: 'detalles.cuentas', params: { n: 6 } }, tono: 'advertencia' },
    ],
    href: (p) => p,
    hrefResultado: () => '/app/reportes/contabilidad/estado-resultados',
    hrefReportes: '/app/reportes/finanzas',
  });

describe.each(IDIOMAS)('PanelFinanzasInicio (%s)', (idioma) => {
  test('con pendientes: filas en orden, cantidad y enlace a la pantalla que lo resuelve', () => {
    const { container } = renderConIdioma(<PanelFinanzasInicio datos={datos(CON_PENDIENTES)} cifra={cifra} onReintentar={() => {}} />, { idioma });
    const filas = Array.from(container.querySelectorAll('[data-pendiente]'));
    expect(filas.map((f) => f.getAttribute('data-pendiente'))).toEqual(['pendientesContables', 'conciliacion', 'dianRechazados', 'periodosSinCerrar']);
    expect(filas[1].querySelector('a')?.getAttribute('href')).toBe('/app/finanzas/tesoreria/conciliacion/r1');
    expect(filas[3].querySelector('a')?.getAttribute('href')).toBe('/app/finanzas/contabilidad/periodos-fiscales');
    // El mes se nombra en el idioma de la interfaz.
    expect(filas[3].textContent).toContain(nombreMes({ anio: 2026, mes: 10 }, idioma));
    expect(container.textContent).toContain('$ 9050000');
    expect(container.querySelector('a[href="/app/reportes/finanzas"]')).not.toBeNull();
    sinClavesCrudas(container.textContent);
  });

  test('al día: sin filas y con el texto del vacío', () => {
    const { container } = renderConIdioma(<PanelFinanzasInicio datos={datos(AL_DIA)} cifra={cifra} onReintentar={() => {}} />, { idioma });
    expect(container.querySelectorAll('[data-pendiente]')).toHaveLength(0);
    sinClavesCrudas(container.textContent);
  });

  test('error: «Reintentar» relee el inicio', () => {
    const onReintentar = jest.fn();
    const { container } = renderConIdioma(
      <PanelFinanzasInicio datos={datos({ ...AL_DIA, dian: { estado: 'error' } })} cifra={cifra} onReintentar={onReintentar} />,
      { idioma },
    );
    const botones = within(container).getAllByRole('button');
    fireEvent.click(botones[botones.length - 1]);
    expect(onReintentar).toHaveBeenCalled();
    sinClavesCrudas(container.textContent);
  });
});

test('es: textos del diseño', () => {
  const { container } = renderConIdioma(<PanelFinanzasInicio datos={datos(CON_PENDIENTES)} cifra={cifra} onReintentar={() => {}} />, { idioma: 'es' });
  const texto = container.textContent ?? '';
  expect(texto).toContain('Pendientes contables por resolver');
  expect(texto).toContain('Conciliación de octubre sin cerrar');
  expect(texto).toContain('Documentos rechazados por la DIAN');
  expect(texto).toContain('Solo lo que puedes resolver con tus permisos');
  expect(texto).toContain('Resultado de octubre');
  expect(texto).toContain('Dinero disponible');
  expect(texto).toContain('No disponible');
  const alDia = renderConIdioma(<PanelFinanzasInicio datos={datos(AL_DIA)} cifra={cifra} onReintentar={() => {}} />, { idioma: 'es' });
  expect(alDia.container.textContent).toContain('No hay pendientes de Finanzas.');
});

describe('ModulosInicio con el bloque de Finanzas', () => {
  const resumen = resumirModulo(
    { codigo: 'finance', cartera_vencida: 3100000, cuentas_vencidas: 14, por_cobrar: 9000000, monedas_cartera: ['COP'], dias_mas_vieja: 42, por_pagar_7d: { total: 4200000, cuentas: 6, monedas: ['COP'] } },
    'COP',
  )!;
  const respuesta = (crudo: CrudoFinanzasInicio) => {
    const finanzas = datos(crudo);
    return {
      modulos: [
        { codigo: 'finance', idNav: 'finanzas', etiqueta: 'finanzas', href: '/app/finanzas', oculto: false, resumen: { ...resumen, tono: finanzas.fila.tono, badge: finanzas.fila.badge }, finanzas },
      ],
      badgeSolido: 'finance',
      moneda: 'COP',
      zona: 'America/Bogota',
      calculadoEn: '2026-11-07T13:05:00Z',
    };
  };

  beforeEach(() => {
    (globalThis as unknown as { fetch: unknown }).fetch = undefined;
  });

  const montar = async (crudo: CrudoFinanzasInicio) => {
    const json = respuesta(crudo);
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => json }) as Response);
    const r = renderConIdioma(<ModulosInicio organizationId={120} periodo="hoy" sucursal={null} prefs={PREFERENCIAS_VACIAS} onGuardar={async () => true} />);
    await waitFor(() => expect(r.container.querySelector('li[data-modulo="finance"]')).not.toBeNull());
    return r;
  };

  test('fila plegada: «N pendientes» y la línea de cartera y por pagar; desplegada: el panel de Finanzas sin otra consulta', async () => {
    const { container } = await montar(CON_PENDIENTES);
    const fila = container.querySelector('li[data-modulo="finance"]')!;
    expect(fila.textContent).toContain('7 pendientes');
    expect(fila.querySelector('[data-resumen]')?.textContent).toMatch(/Cartera vencida \$\s?3\.100\.000 · Por pagar \$\s?4\.200\.000/);
    fireEvent.click(fila.querySelector('button')!);
    expect(container.querySelector('[data-finanzas-inicio]')).not.toBeNull();
    expect(container.querySelectorAll('[data-pendiente]')).toHaveLength(4);
    expect((globalThis.fetch as jest.Mock).mock.calls).toHaveLength(1);
  });

  test('sin pendientes pero con cartera vencida: manda el badge de vencidas', async () => {
    const { container } = await montar(AL_DIA);
    // 14 cuentas vencidas en el resumen: manda el badge de vencidas.
    expect(container.querySelector('li[data-modulo="finance"]')!.textContent).toContain('14 vencidas');
  });
});
