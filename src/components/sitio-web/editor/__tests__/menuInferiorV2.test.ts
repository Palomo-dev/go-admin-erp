import { leerMenuInferior, menuInicial, botonesVisibles } from '@/lib/website/menuInferior';
import { accionesDisponibles, accionesSinDestino, avisoBoton, botonConAccion, botonNuevo, cambioMenuV2, conVariante, menuDelEditor, mover } from '../inspector/menuInferiorLogica';

const D = { llamar: 'tel:+5760000000', whatsapp: 'https://wa.me/570000000000', comoLlegar: null, reservar: '/reservas', pedir: '/productos' };

describe('Menú inferior v2 (Encabezado › Celular)', () => {
  it('sin v2 el panel muestra lo de hoy y no escribe nada', () => {
    expect(menuDelEditor({ mobile_menu_style: 'tabs', mobile_bottom_bar: ['whatsapp', 'llamar', 'como_llegar'] }).menu.items.map((b) => b.action)).toEqual(['home', 'categories_modal', 'search', 'cart', 'account']);
    expect(menuDelEditor({ mobile_menu_style: 'fullscreen', mobile_bottom_bar: ['whatsapp', 'llamar', 'como_llegar'] }).menu.variant).toBe('actions');
    expect(menuDelEditor({}, 'restaurante').menu.items.map((b) => b.action)).toEqual(['booking', 'call', 'location', 'order']);
    expect(menuDelEditor({}).menu.enabled).toBe(false);
  });
  it('el primer cambio guarda el menú entero con v:2 y conserva el resto de mobile_header', () => {
    const a = { mobile_menu_style: 'tabs', mobile_header: { icons: { style: 'border' } } };
    const { menu } = menuDelEditor(a);
    const parche = cambioMenuV2(a, { ...menu, items: mover(menu.items, 4, -1) });
    const h = parche.mobile_header as Record<string, unknown>;
    expect(h.icons).toEqual({ style: 'border' });
    const leido = leerMenuInferior(parche)!;
    expect(leido.v).toBe(2);
    expect(leido.items.map((b) => b.action)).toEqual(['home', 'categories_modal', 'search', 'account', 'cart']);
  });
  it('ocultar, quitar, agregar: apagar no borra', () => {
    const { menu } = menuDelEditor({ mobile_menu_style: 'tabs' });
    const oculto = { ...menu, items: menu.items.map((b, i) => (i === 0 ? { ...b, visible: false } : b)) };
    expect(botonesVisibles(oculto, D)).toHaveLength(4);
    const apagado = leerMenuInferior(cambioMenuV2({}, { ...oculto, enabled: false }))!;
    expect(apagado.enabled).toBe(false);
    expect(apagado.items).toHaveLength(5);
    const sinCuenta = menu.items.slice(0, 4);
    const nuevo = botonNuevo(sinCuenta);
    expect(nuevo.action).toBe('account');
    expect(botonNuevo(menu.items).action).toBe('whatsapp');
  });
  it('WhatsApp dentro de las pestañas con número y mensaje propios', () => {
    const { menu } = menuDelEditor({ mobile_menu_style: 'tabs' });
    const w = { ...botonConAccion(menu.items[4], 'whatsapp'), target: '300 000 0000', message: 'Hola' };
    expect(w.label).toBe('WhatsApp');
    expect(w.icon).toBe('whatsapp');
    const m = leerMenuInferior(cambioMenuV2({}, { ...menu, items: [...menu.items.slice(0, 4), w] }))!;
    expect(botonesVisibles(m, D)[4].destino).toEqual({ tipo: 'externo', href: 'https://wa.me/573000000000?text=Hola' });
  });
  it('texto propio se conserva al cambiar de acción; página sin / avisa', () => {
    const b = { id: 'x', action: 'home' as const, label: 'Portada', icon: 'star' as const, visible: true };
    expect(botonConAccion(b, 'search')).toMatchObject({ label: 'Portada', icon: 'star', action: 'search' });
    expect(avisoBoton({ ...b, action: 'page', target: 'nosotros' })).toBe('destinoPagina');
    expect(avisoBoton({ ...b, action: 'page', target: '/nosotros' })).toBeNull();
  });
  it('máximos: 5 pestañas, 4 acciones; «Abrir el menú» solo con botón de menú', () => {
    const { menu } = menuDelEditor({ mobile_menu_style: 'tabs' });
    expect(conVariante(menu, 'actions').items).toHaveLength(4);
    expect(accionesDisponibles({ mobile_menu_style: 'tabs' })).not.toContain('menu');
    expect(accionesDisponibles({ mobile_menu_style: 'none' })).not.toContain('menu');
    expect(accionesDisponibles({})).toContain('menu');
  });
  it('sin Favoritos (la tienda no tiene esa página)', () => {
    expect(accionesDisponibles({})).not.toContain('favorites' as never);
    expect(menuInicial({}).menu.items.every((b) => b.action !== ('favorites' as never))).toBe(true);
  });
  it('barras de texto de antes («reservar», «whatsapp,llamar») dan la misma barra que hoy', () => {
    expect(menuDelEditor({ mobile_menu_style: 'fullscreen', mobile_bottom_bar: 'whatsapp,llamar' }).menu.items.map((b) => b.action)).toEqual(['whatsapp', 'call']);
    expect(menuDelEditor({ mobile_menu_style: 'fullscreen', mobile_bottom_bar: 'reservar' }).menu.items.map((b) => b.action)).toEqual(['booking']);
    expect(menuDelEditor({ mobile_bottom_bar: 'xx,yy' }, 'restaurante').menu.items.map((b) => b.action)).toEqual(['booking', 'call', 'location', 'order']);
  });
  it('al guardar la v2 se limpia la lista de antes; sin lista no se toca', () => {
    const a = { mobile_menu_style: 'tabs', mobile_bottom_bar: ['whatsapp', 'llamar'] };
    expect(cambioMenuV2(a, menuDelEditor(a).menu).mobile_bottom_bar).toBe('auto');
    expect(cambioMenuV2({ mobile_bottom_bar: 'whatsapp,llamar' }, menuDelEditor({}).menu).mobile_bottom_bar).toBe('auto');
    expect('mobile_bottom_bar' in cambioMenuV2({ mobile_bottom_bar: 'ninguna' }, menuDelEditor({}).menu)).toBe(false);
  });
  it('sin destino de la tienda: aviso solo si no hay destino escrito', () => {
    const s = accionesSinDestino({ telefono: false, whatsapp: true, direccion: true, pedir: false, reservar: true }, true);
    expect([...s].sort()).toEqual(['call', 'order']);
    expect(avisoBoton({ id: 'a', action: 'call', label: 'Llamar', icon: 'phone', visible: true } as never, s)).toBe('sinDestino');
    expect(avisoBoton({ id: 'a', action: 'call', label: 'Llamar', icon: 'phone', visible: true, target: '6000000' } as never, s)).toBe(null);
    expect(accionesSinDestino(null, true).size).toBe(0);
    expect(accionesSinDestino({ telefono: true, whatsapp: true, direccion: true, pedir: false, reservar: false }, false).size).toBe(0);
  });
});
