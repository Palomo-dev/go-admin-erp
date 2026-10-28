/**
 * @jest-environment jsdom
 *
 * «Contador regresivo» del editor nuevo: lee y escribe las MISMAS columnas `countdown_*` /
 * `checkout_show_countdown` del editor viejo, con sus defaults, y el lienzo las recibe en vivo.
 * Datos ficticios con la forma real de prod (daily_reset, hora 0, America/Bogota).
 */
import { DEFAULT_TIMEZONE } from '@/lib/utils/dateCore';
import { fireEvent, render, screen } from '@testing-library/react';
import { PanelContador } from '../inspector/PanelContador';
import { finLocal, leerContador, objetivoContador, partesFin, tiempoRestante, UBICACIONES_CONTADOR } from '../inspector/contadorLegacy';
import { ajustesParaLienzo, CLAVES_AJUSTES_VIVOS } from '@/lib/website/ajustesVivos';
import type { WebsiteSettings } from '@/lib/services/websiteSettingsService';

// El kit (CampoFecha/CampoHora) toma sus textos de next-intl; aquí basta con devolver la clave.
jest.mock('next-intl', () => ({
  useLocale: () => 'es',
  useTranslations: () => (key: string) => key,
}));

const FILA = {
  countdown_enabled: true,
  countdown_mode: 'daily_reset',
  countdown_end_date: '',
  countdown_timezone: DEFAULT_TIMEZONE,
  countdown_reset_hour: 0,
  countdown_title: '',
  countdown_show_in_header: true,
  countdown_show_in_cart: true,
  checkout_show_countdown: true,
  countdown_show_in_product: true,
  countdown_show_in_hero: false,
  primary_color: '#E11D48',
};

describe('contadorLegacy', () => {
  test('lee la fila como el editor viejo, con sus defaults', () => {
    const c = leerContador(FILA);
    expect(c).toMatchObject({ activo: true, modo: 'daily_reset', zona: DEFAULT_TIMEZONE, horaReinicio: 0 });
    expect(c.ubicaciones).toEqual({
      countdown_show_in_header: true, countdown_show_in_cart: true, checkout_show_countdown: true,
      countdown_show_in_product: true, countdown_show_in_hero: false,
    });
    // NULL = apagado, como en la tienda (que exige === true): el editor no marca lo que no se pinta.
    const vacio = leerContador({ countdown_show_in_header: null, countdown_show_in_cart: null });
    expect(vacio.activo).toBe(false);
    expect(vacio.ubicaciones).toEqual({
      countdown_show_in_header: false, countdown_show_in_cart: false, checkout_show_countdown: false,
      countdown_show_in_product: false, countdown_show_in_hero: false,
    });
  });

  test('la fecha fin se guarda como el datetime-local del editor viejo (sin desfase)', () => {
    expect(finLocal('2026-12-24', '20:30')).toBe('2026-12-24T20:30');
    expect(finLocal('2026-12-24', '')).toBe('2026-12-24T23:59');
    expect(finLocal('', '10:00')).toBe('');
    expect(partesFin('2026-12-24T20:30', DEFAULT_TIMEZONE)).toEqual({ dia: '2026-12-24', hora: '20:30' });
    // Un valor viejo en UTC se muestra en la zona elegida.
    expect(partesFin('2026-12-25T01:30:00Z', DEFAULT_TIMEZONE)).toEqual({ dia: '2026-12-24', hora: '20:30' });
  });

  test('cada ubicación es una columna real del editor viejo', () => {
    expect(UBICACIONES_CONTADOR.map((u) => u.columna)).toEqual([
      'countdown_show_in_header', 'countdown_show_in_cart', 'checkout_show_countdown',
      'countdown_show_in_product', 'countdown_show_in_hero',
    ]);
  });
});

describe('PanelContador', () => {
  const montar = (fila: Record<string, unknown> = FILA) => {
    const onCambiar = jest.fn();
    render(<PanelContador settings={fila as unknown as WebsiteSettings} onCambiarAjustes={onCambiar} colorPrimario="#E11D48" />);
    return onCambiar;
  };

  test('activar, texto, hora de reinicio y ubicaciones escriben las columnas del editor viejo', () => {
    const onCambiar = montar({ ...FILA, countdown_enabled: false });
    fireEvent.click(screen.getByRole('switch', { name: 'Mostrar contador' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ countdown_enabled: true });
    fireEvent.change(screen.getByPlaceholderText('¡Oferta por tiempo limitado!'), { target: { value: 'Solo hoy' } });
    expect(onCambiar).toHaveBeenLastCalledWith({ countdown_title: 'Solo hoy' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pago (checkout)' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ checkout_show_countdown: false });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Portada (hero)' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ countdown_show_in_hero: true });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Encabezado' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ countdown_show_in_header: false });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Carrito' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ countdown_show_in_cart: false });
  });

  test('modo y zona horaria: todas las opciones del editor viejo, visibles', () => {
    const onCambiar = montar();
    fireEvent.click(screen.getByRole('radio', { name: 'Hasta una fecha' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ countdown_mode: 'custom' });
    fireEvent.click(screen.getByRole('radio', { name: 'México (GMT-6)' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ countdown_timezone: 'America/Mexico_City' });
    expect(screen.getByText('Hora de reinicio (0–23)')).toBeTruthy();
  });

  test('vista previa: texto sobre primario (negro sobre claro, blanco sobre oscuro)', () => {
    const { rerender } = render(<PanelContador settings={FILA as unknown as WebsiteSettings} onCambiarAjustes={jest.fn()} colorPrimario="#A0D241" />);
    expect(screen.getByTestId('vista-contador').style.color).toBe('rgb(17, 17, 17)');
    rerender(<PanelContador settings={FILA as unknown as WebsiteSettings} onCambiarAjustes={jest.fn()} colorPrimario="#1E3A8A" />);
    expect(screen.getByTestId('vista-contador').style.color).toBe('rgb(255, 255, 255)');
  });

  test('modo fecha muestra el fin y avisa si falta', () => {
    montar({ ...FILA, countdown_mode: 'custom', countdown_end_date: '' });
    expect(screen.getByRole('group', { name: 'Termina' })).toBeTruthy();
    expect(screen.getByText('Sin fecha de fin el contador no se muestra.')).toBeTruthy();
  });
});

describe('lienzo en vivo', () => {
  test('el contador viaja en goadmin:settings y no se pisa con null si falta', () => {
    for (const c of ['countdown_enabled', 'countdown_title', 'countdown_show_in_header', 'countdown_show_in_cart', 'checkout_show_countdown']) {
      expect(CLAVES_AJUSTES_VIVOS).toContain(c);
    }
    const vivos = ajustesParaLienzo(FILA);
    expect(vivos.countdown_enabled).toBe(true);
    expect(vivos.checkout_show_countdown).toBe(true);
    expect('countdown_title' in ajustesParaLienzo({})).toBe(false);
  });
});

describe('tiempoRestante (vista previa, misma regla que la tienda)', () => {
  const diario = (extra: Record<string, unknown> = {}) => leerContador({ ...FILA, ...extra });
  test('medianoche en Bogotá (00:30): faltan 23:30:00, no se oculta', () => {
    expect(tiempoRestante(diario(), new Date('2026-10-29T05:30:00Z'))).toBe('23:30:00');
    expect(tiempoRestante(diario(), new Date('2026-10-29T05:00:00Z'))).toBe('24:00:00');
  });
  test('reinicio a las 18 y a la tarde', () => {
    expect(tiempoRestante(diario({ countdown_reset_hour: 18 }), new Date('2026-10-28T20:00:00Z'))).toBe('03:00:00');
  });
  test('leerContador valida la zona: inválida → zona por defecto', () => {
    expect(diario({ countdown_timezone: 'Marte/Olympus' }).zona).toBe(DEFAULT_TIMEZONE);
    expect(diario({ countdown_timezone: 'Europe/Madrid' }).zona).toBe('Europe/Madrid');
  });
  test('zona inválida cae en la zona por defecto, no en la del visitante', () => {
    expect(tiempoRestante(diario({ countdown_timezone: 'Marte/Olympus' }), new Date('2026-10-29T05:30:00Z'))).toBe('23:30:00');
  });
  test('hasta una fecha: lo que falta, y null si ya pasó o no hay fecha', () => {
    const c = diario({ countdown_mode: 'custom', countdown_end_date: '2026-10-29T10:00' });
    expect(tiempoRestante(c, new Date('2026-10-29T14:00:00Z'))).toBe('01:00:00');
    expect(tiempoRestante(c, new Date('2026-10-29T16:00:00Z'))).toBeNull();
    expect(tiempoRestante(diario({ countdown_mode: 'custom', countdown_end_date: '' }), new Date())).toBeNull();
  });
});

describe('objetivoContador = tienda (relojContador.ts), con cambio de horario', () => {
  const obj = (extra: Record<string, unknown>, ahora: string) =>
    objetivoContador(leerContador({ countdown_enabled: true, ...extra }), new Date(ahora))?.toISOString() ?? null;
  const fin = (f: string, zona: string) => obj({ countdown_mode: 'custom', countdown_end_date: f, countdown_timezone: zona }, '2026-01-01T00:00:00Z');
  test('hueco de primavera: la siguiente hora válida, nunca una antes', () => {
    expect(fin('2026-09-06T00:00', 'America/Santiago')).toBe('2026-09-06T04:00:00.000Z');
    expect(fin('2026-03-29T02:00', 'Europe/Madrid')).toBe('2026-03-29T01:00:00.000Z');
    expect(fin('2026-03-29T02:30', 'Europe/Madrid')).toBe('2026-03-29T01:30:00.000Z');
    expect(fin('2026-03-29T01:00', 'Europe/Madrid')).toBe('2026-03-29T00:00:00.000Z');
    expect(fin('2026-03-29T04:00', 'Europe/Madrid')).toBe('2026-03-29T02:00:00.000Z');
  });
  test('hora repetida de otoño: la segunda ocurrencia (como la tienda)', () => {
    expect(fin('2026-10-25T02:30', 'Europe/Madrid')).toBe('2026-10-25T01:30:00.000Z');
  });
  test('hora repetida: SIEMPRE la segunda ocurrencia (Nueva York, Madrid)', () => {
    expect(fin('2026-11-01T01:00', 'America/New_York')).toBe('2026-11-01T06:00:00.000Z');
    expect(fin('2026-11-01T01:30', 'America/New_York')).toBe('2026-11-01T06:30:00.000Z');
    expect(fin('2026-11-01T00:30', 'America/New_York')).toBe('2026-11-01T04:30:00.000Z');
    expect(fin('2026-11-01T02:00', 'America/New_York')).toBe('2026-11-01T07:00:00.000Z');
    expect(fin('2026-10-25T02:00', 'Europe/Madrid')).toBe('2026-10-25T01:00:00.000Z');
    const ny = (ahora: string) =>
      obj({ countdown_mode: 'daily_reset', countdown_timezone: 'America/New_York', countdown_reset_hour: 1 }, ahora);
    expect(ny('2026-11-01T04:00:00Z')).toBe('2026-11-01T06:00:00.000Z');
    expect(ny('2026-11-01T05:30:00Z')).toBe('2026-11-01T06:00:00.000Z');
  });
  test('reinicio diario en el día del cambio', () => {
    const diario = (zona: string, hora: number, ahora: string) =>
      obj({ countdown_mode: 'daily_reset', countdown_timezone: zona, countdown_reset_hour: hora }, ahora);
    expect(diario('Europe/Madrid', 2, '2026-03-28T23:30:00Z')).toBe('2026-03-29T01:00:00.000Z');
    expect(diario('America/Santiago', 0, '2026-09-06T03:59:58Z')).toBe('2026-09-06T04:00:00.000Z');
    expect(diario('America/Santiago', 0, '2026-09-06T04:00:00Z')).toBe('2026-09-07T03:00:00.000Z');
    expect(diario('Europe/Madrid', 2, '2026-10-25T00:00:00Z')).toBe('2026-10-25T01:00:00.000Z');
  });
});

