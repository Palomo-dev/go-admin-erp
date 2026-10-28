import { botonesConValor, cajaIconos, cambioCaja, cambioForma, cambioTamano, formaCaja, menusConValor, tamanoIcono } from '../encabezadoCapacidades';
import { cambioBuscador } from '../anterioresLogica';

const ic134 = { icon: 22, scope: 'all', shape: 'none', stroke: 2, weight: 'contorno' };

describe('Constructor → Encabezado', () => {
  it('sin nada guardado no hay caja ni cambios', () => {
    expect(cajaIconos({})).toBeNull();
    expect(formaCaja({})).toBe('none');
    expect(tamanoIcono({})).toBeNull();
  });
  it('lee icon_container del Constructor (borrador org 134) sin escribir', () => {
    const a = { header_builder: { icon_container: ic134 } };
    expect(formaCaja(a)).toBe('none');
    expect(tamanoIcono(a)).toBe(22);
  });
  it('la primera edición copia icon_container a header_icons_box', () => {
    const a = { header_builder: { icon_container: ic134 } };
    expect(cambioForma(a, 'rounded')).toEqual({ header_icons_box: { ...ic134, shape: 'rounded', background: 'accent' } });
    expect(cambioTamano(a, null)).toEqual({ header_icons_box: { scope: 'all', shape: 'none', stroke: 2, weight: 'contorno' } });
  });
  it('círculo sin caja sigue siendo el Círculo acento', () => {
    expect(cambioForma({}, 'circle')).toHaveProperty('header_icons_circle', true);
    expect(formaCaja({ header_icons_circle: true })).toBe('circle');
  });
  it('desde el círculo, el tamaño pasa a la caja con sus colores y apaga el círculo', () => {
    const c = cambioTamano({ header_icons_circle: true, header_icons_circle_bg: '#111111' }, 28);
    expect(c.header_icons_box).toEqual({ shape: 'circle', scope: 'all', background: '#111111', icon: 28 });
    expect(c.header_icons_circle).toBeFalsy();
  });
  it('quitar sombra borra la clave', () => {
    expect(cambioCaja({ header_icons_box: { shape: 'square', shadow: 'md' } }, { shadow: null })).toEqual({ header_icons_box: { shape: 'square' } });
  });
  it('botones y menús adicionales con valor', () => {
    expect(botonesConValor({ header_cta4_text: 'Hola' })).toEqual([4]);
    expect(menusConValor({ header_menu3_links: [{ label: 'a', href: '/a' }] })).toEqual([3]);
  });
  it('buscadores cromo: el celular queda en ícono o barra', () => {
    const a = { mobile_header: { search: 'bar' } };
    expect(cambioBuscador(a, 'icon_overlay')).toMatchObject({ search_style: 'icon_overlay' });
    expect(cambioBuscador(a, 'pill_floating')).toMatchObject({ search_style: 'pill_floating' });
  });
  it('H3: semi y squircle como en la tienda; «Sin caja» limpia fondo, degradado y sombra', () => {
    expect(cambioForma({}, 'squircle')).toEqual({ header_icons_box: { shape: 'squircle', scope: 'all', background: 'accent' } });
    const a = { header_icons_box: { shape: 'semi', scope: 'all', background: '#ff0000', gradient_1: '#111111', gradient_2: '#222222', shadow: 'md', icon: 22 } };
    expect(cambioForma(a, 'none')).toEqual({ header_icons_box: { shape: 'none', scope: 'all', icon: 22 } });
  });
  it('«Sin caja» limpia también hover, color de sombra, opacidad y borde', () => {
    const a = { header_icons_box: { shape: 'rounded', scope: 'all', icon: 20, hover_background: '#333333', hover_scale: 110, shadow_color: '#000000', opacity: 80, border_width: 2, border_color: '#444444', border_style: 'dotted' } };
    expect(cambioForma(a, 'none')).toEqual({ header_icons_box: { shape: 'none', scope: 'all', icon: 20 } });
  });
});
