/**
 * @jest-environment jsdom
 */
/**
 * «Tu turno» según el método de la sede (Figma 20.30.7 y 20.31.4): el botón
 * dice el método y abre `/marcar?metodo=…`; sin método especial, igual que
 * antes. Render real con next-intl en los cuatro idiomas. Nombres ficticios.
 */
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatTime: (v: string) => (v ? '8:05 a. m.' : '') }),
}));

import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { BotonTurno, TurnoCard } from '../TurnoInicio';
import type { TurnoInicio } from '@/lib/dashboard/inicio.server';

const IDIOMAS: IdiomaPrueba[] = ['es', 'en', 'fr', 'pt'];
const sinClavesCrudas = (texto: string | null) => expect(texto ?? '').not.toMatch(/\b(home|nav|hrmMarcacion)\.[a-zA-Z]/);

const BASE: TurnoInicio = {
  visible: true,
  estado: 'sinMarcar',
  entradaProgramada: '2026-11-16T13:00:00Z',
  salidaProgramada: '2026-11-16T22:00:00Z',
  entradaMarcada: null,
  salidaMarcada: null,
  minutos: 12,
  sucursal: 'Sede Centro',
  hrefMarcar: '/marcar',
  hrefMarcaciones: '/app/inicio/mi-asistencia',
};
const CON_QR: TurnoInicio = {
  ...BASE,
  hrefMarcar: '/marcar?metodo=qr',
  metodo: { especial: 'qr', metodos: { ubicacion: false, qr: true, nfc: false, remoto: false } },
};

describe('Tu turno con el método de la sede', () => {
  test('sin método especial: textos y enlace de siempre, sin nota', () => {
    const { container } = renderConIdioma(<TurnoCard turno={{ ...BASE, metodo: null }} />);
    expect(container.textContent).toContain('Marcar entrada');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/marcar');
    expect(container.querySelector('[data-nota-metodo]')).toBeNull();
  });

  test('sede con QR: «Escanear el QR de la sede», abre la cámara directo y nota en móvil (20.30.7)', () => {
    const { container } = renderConIdioma(<TurnoCard turno={CON_QR} />);
    expect(container.querySelector('a')?.textContent).toBe('Escanear el QR de la sede');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/marcar?metodo=qr');
    expect(container.querySelector('[data-nota-metodo="qr"]')?.textContent).toContain('Sede Centro');
  });

  test('en turno: «Marcar salida con el QR» (20.31.4); cerrado: «Ver mis marcaciones»', () => {
    const enTurno = renderConIdioma(<TurnoCard turno={{ ...CON_QR, estado: 'enTurno', entradaMarcada: '2026-11-16T13:02:00Z', minutos: 192 }} compacta />);
    expect(enTurno.container.querySelector('a')?.textContent).toBe('Marcar salida con el QR');
    enTurno.unmount();
    const cerrado = renderConIdioma(<TurnoCard turno={{ ...CON_QR, estado: 'cerrado', entradaMarcada: 'a', salidaMarcada: 'b', minutos: 540 }} />);
    expect(cerrado.container.querySelector('a')?.textContent).toBe('Ver mis marcaciones');
    expect(cerrado.container.querySelector('[data-nota-metodo]')).toBeNull();
  });

  test('botón del encabezado: método de la sede; en descanso, el texto de siempre', () => {
    const r1 = renderConIdioma(<BotonTurno turno={CON_QR} />);
    expect(r1.container.textContent).toContain('Escanear el QR de la sede');
    expect(r1.container.textContent).toContain('12 min tarde');
    r1.unmount();
    const r2 = renderConIdioma(<BotonTurno turno={{ ...CON_QR, estado: 'enDescanso', minutos: 5 }} />);
    expect(r2.container.textContent).toBe('Terminar descanso');
    r2.unmount();
    const r3 = renderConIdioma(<BotonTurno turno={{ ...CON_QR, estado: 'antes', metodo: { especial: 'nfc', metodos: { ubicacion: false, qr: false, nfc: true, remoto: false } } }} />);
    expect(r3.container.textContent).toBe('Acercar a la etiqueta NFC');
  });

  test.each(IDIOMAS)('%s: QR y NFC en todos los estados sin claves crudas', (idioma) => {
    for (const especial of ['qr', 'nfc'] as const) {
      for (const estado of ['antes', 'sinMarcar', 'enTurno', 'enDescanso', 'cerrado', 'sinTurno'] as const) {
        const turno: TurnoInicio = { ...CON_QR, estado, metodo: { especial, metodos: { ubicacion: false, qr: especial === 'qr', nfc: especial === 'nfc', remoto: false } } };
        const tarjeta = renderConIdioma(<TurnoCard turno={turno} />, { idioma });
        sinClavesCrudas(tarjeta.container.textContent);
        tarjeta.unmount();
        const boton = renderConIdioma(<BotonTurno turno={turno} />, { idioma });
        sinClavesCrudas(boton.container.textContent);
        boton.unmount();
      }
    }
  });
});
