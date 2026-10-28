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
import { finLocal, leerContador, partesFin, UBICACIONES_CONTADOR } from '../inspector/contadorLegacy';
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
    const vacio = leerContador({});
    expect(vacio.activo).toBe(false);
    expect(vacio.ubicaciones).toEqual({
      countdown_show_in_header: true, countdown_show_in_cart: true, checkout_show_countdown: false,
      countdown_show_in_product: true, countdown_show_in_hero: false,
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
    fireEvent.click(screen.getByRole('switch', { name: 'Pago (checkout)' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ checkout_show_countdown: false });
    fireEvent.click(screen.getByRole('switch', { name: 'Portada (hero)' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ countdown_show_in_hero: true });
    fireEvent.click(screen.getByRole('switch', { name: 'Encabezado' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ countdown_show_in_header: false });
    fireEvent.click(screen.getByRole('switch', { name: 'Carrito' }));
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
