/**
 * @jest-environment jsdom
 *
 * Buscador y filtros de «Mis canales», restaurados el 2026-11-14 con los
 * mismos criterios de la lista anterior: nombre, tipo y estado.
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { FiltrosCanales } from '../FiltrosCanales';
import { FILTROS_CANALES_VACIOS, filtrarCanales, filtrosActivos } from '../canalesLogica';

const canales = [
  { name: 'WhatsApp · Ventas', type: 'whatsapp' as const, status: 'active' as const },
  { name: 'Chat del sitio web', type: 'website' as const, status: 'inactive' as const },
  { name: 'Página de Facebook', type: 'facebook' as const, status: 'suspended' as const },
];

describe('filtrarCanales', () => {
  test('busca por nombre sin importar tildes ni mayúsculas', () => {
    expect(filtrarCanales(canales, { ...FILTROS_CANALES_VACIOS, busqueda: 'pagina' }).map((c) => c.type)).toEqual(['facebook']);
    expect(filtrarCanales(canales, { ...FILTROS_CANALES_VACIOS, busqueda: '  VENTAS ' })).toHaveLength(1);
  });
  test('filtra por tipo y por estado (inactivo incluye suspendido)', () => {
    expect(filtrarCanales(canales, { ...FILTROS_CANALES_VACIOS, tipo: 'website' })).toHaveLength(1);
    expect(filtrarCanales(canales, { ...FILTROS_CANALES_VACIOS, estado: 'active' }).map((c) => c.type)).toEqual(['whatsapp']);
    expect(filtrarCanales(canales, { ...FILTROS_CANALES_VACIOS, estado: 'inactive' }).map((c) => c.type)).toEqual(['website', 'facebook']);
    expect(filtrarCanales(canales, FILTROS_CANALES_VACIOS)).toHaveLength(3);
  });
  test('cuenta los filtros activos (la búsqueda no cuenta)', () => {
    expect(filtrosActivos({ busqueda: 'x', tipo: 'email', estado: 'active' })).toBe(2);
  });
});

describe('FiltrosCanales', () => {
  test('escribir en el buscador y quitar un chip', () => {
    const onCambio = jest.fn();
    renderConIdioma(<FiltrosCanales filtros={{ busqueda: '', tipo: 'whatsapp', estado: null }} onCambio={onCambio} resultados={1} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar canales' }), { target: { value: 'ventas' } });
    expect(onCambio).toHaveBeenCalledWith({ busqueda: 'ventas', tipo: 'whatsapp', estado: null });
    expect(screen.getByText('Tipo: WhatsApp')).toBeTruthy();
  });
});
