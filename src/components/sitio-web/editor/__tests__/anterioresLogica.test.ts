import {
  cambioBuscador,
  cambioCirculoAcento,
  cambioQuitarTodos,
  circuloAcentoActivo,
  entradasAnterioresEncabezado,
  entradasAnterioresPie,
  usaEncabezadoMovilNuevo,
} from '../inspector/anterioresLogica';
import { CLAVES_ANTERIORES_ENCABEZADO } from '../inspector/InspectorEncabezado';
import { resolverSiguenAComputador } from '../loteLegacy';

jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120, ORGANIZATION_CHANGED_EVENT: 'org-cambio' }));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
// Encabezado de Run Sneak (org 345) en el borrador, leído por SELECT el 27-oct.
const runSneak = {
  show_topbar: true,
  search_style: 'icon',
  mobile_header: { icons: { style: 'circle' } },
  show_header_auth: true,
  mobile_menu_style: 'tabs',
  header_icons_circle: true,
  header_mobile_icon_color: '#FFFFFF',
};

describe('Ajustes anteriores por clave y con dependencias', () => {
  it('Run Sneak: los íconos del celular no se pueden quitar (borraría círculo y cuenta)', () => {
    const e = entradasAnterioresEncabezado(runSneak, CLAVES_ANTERIORES_ENCABEZADO);
    const iconos = e.find((x) => x.id === 'mobile_header__icons');
    // El estilo círculo vive en «Círculo acento»: ya no se lista como anterior.
    expect(iconos).toBeUndefined();
    // El color de los íconos del celular vive en «Celular» (fuente única): ya no es anterior.
    expect(e.find((x) => x.id === 'header_mobile_icon_color')).toBeUndefined();
    const todos = cambioQuitarTodos(runSneak, e);
    expect(todos).not.toHaveProperty('mobile_header');
    expect(usaEncabezadoMovilNuevo({ ...runSneak, ...todos }.mobile_header, 'tabs')).toBe(true);
  });

  it('layout e íconos del celular viven en «Celular»: «anteriores» ya no los lista', () => {
    const a = { mobile_header: { icons: { color: '#111111' }, layout: { header_height: 60 } } };
    expect(entradasAnterioresEncabezado(a, ['mobile_header'])).toEqual([]);
  });

  it('Círculo acento: refleja los íconos viejos y al apagarlo el celular conserva su encabezado', () => {
    expect(circuloAcentoActivo({ mobile_header: { icons: { style: 'circle' } } })).toBe(true);
    const off = cambioCirculoAcento(runSneak, false);
    expect(off).toEqual({ header_icons_circle: false, mobile_header: { icons: { style: 'plain' } } });
    expect(usaEncabezadoMovilNuevo(off.mobile_header, 'tabs')).toBe(true);
    expect(cambioCirculoAcento({ ...runSneak, ...off }, true)).toEqual({ header_icons_circle: true, mobile_header: { icons: { style: 'circle' } } });
  });

  it('buscador del celular igual al de computador no se lista; distinto sí, y se quita con null', () => {
    expect(entradasAnterioresEncabezado({ search_style: 'icon', mobile_search_style: 'icon' }, ['mobile_search_style'])).toEqual([]);
    expect(entradasAnterioresEncabezado({ mobile_search_style: 'bar' }, ['mobile_search_style'])).toEqual([
      { id: 'mobile_search_style', quitar: { mobile_search_style: null } },
    ]);
  });

  it('pie: Horario y Redes del celular salen solo si difieren del computador', () => {
    expect(entradasAnterioresPie({ footer_show_hours: true, mobile_footer_show_hours: true })).toEqual([]);
    expect(entradasAnterioresPie({ footer_show_hours: false, footer_show_social: true, mobile_footer_show_social: false, mobile_footer_show_hours: true })).toEqual([
      { id: 'mobile_footer_show_hours', quitar: { mobile_footer_show_hours: false } },
      { id: 'mobile_footer_show_social', quitar: { mobile_footer_show_social: true } },
    ]);
  });
});

describe('Buscador único que conserva lo que se ve (341, 338, 137)', () => {
  const org341 = { mobile_search_style: 'bar', mobile_menu_style: 'fullscreen' };
  it('cambiar el de computador no le cambia la barra al celular', () => {
    expect(cambioBuscador(org341, 'icon')).toEqual({ search_style: 'icon' });
  });
  it('elegir «Barra visible» u «Oculto» une los dos', () => {
    expect(cambioBuscador(org341, 'bar')).toEqual({ search_style: 'bar', mobile_search_style: null });
    expect(cambioBuscador(org341, 'hidden')).toEqual({ search_style: 'hidden', mobile_search_style: null });
  });
  it('sin buscador propio del celular, el celular sigue al computador', () => {
    expect(cambioBuscador({ search_style: 'icon' }, 'bar')).toEqual({ search_style: 'bar', mobile_search_style: null });
  });
  it('el buscador viejo del celular no se quita si el celular perdería su encabezado', () => {
    const a = { mobile_header: { search: 'bar' } };
    expect(cambioBuscador(a, 'bar')).toEqual({ search_style: 'bar', mobile_search_style: null, mobile_header: { search: 'bar' } });
  });
});

describe('Legacy: el buscador único se puede guardar (columnas NOT NULL)', () => {
  it('null «sigue al computador» se guarda con el valor del computador del mismo lote', () => {
    const lote: Record<string, unknown> = { search_style: 'bar', mobile_search_style: null, show_topbar: false, mobile_show_topbar: null };
    resolverSiguenAComputador(lote);
    expect(lote).toEqual({ search_style: 'bar', mobile_search_style: 'bar', show_topbar: false, mobile_show_topbar: false });
  });
  it('sin el de computador en el lote, la columna no se toca', () => {
    const lote: Record<string, unknown> = { mobile_search_style: null };
    resolverSiguenAComputador(lote);
    expect(lote).toEqual({});
  });
});

describe('mobile_header editable (auditoría 27-oct, 6)', () => {
  it('org 134: layout.sticky se edita en «Celular» (Fijo al desplazar), no en «anteriores»', () => {
    const a = { mobile_header: { layout: { sticky: true, logo: 'inherit' }, panel: { show_logo: false } } };
    const e = entradasAnterioresEncabezado(a, CLAVES_ANTERIORES_ENCABEZADO);
    expect(e.find((x) => x.id === 'mobile_header__layout')).toBeUndefined();
  });
});
