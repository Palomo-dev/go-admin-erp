/**
 * «Íconos con más estilos» (Figma «16 Sitio web» 2852:70951, propuesta 8 aprobada el 2026-11-23).
 *
 * El contrato (glifosTienda.ts y catalogoIconos.ts, copias idénticas en la tienda), la lista
 * generada del selector y los cambios que escribe el editor. La regla de siempre: sin tocar nada,
 * nada se escribe y la tienda se ve como hoy.
 */
import {
  EQUIVALENTE_PHOSPHOR,
  dibujoGlifo,
  estiloGlifosAGuardar,
  estiloGlifosCabecera,
  glifosCabecera,
  leerEstiloGlifos,
  leerRefGlifo,
  pesoEfectivo,
} from '@/lib/website/v2/glifosTienda';
import { CATEGORIAS_ICONOS, NOMBRES_ES, SUGERIDOS_POR_ACCION, coincideBusqueda, leerSugerido } from '@/lib/website/v2/catalogoIconos';
import { CATALOGO_PHOSPHOR } from '@/lib/website/v2/catalogoPhosphor.generado';
import { ACCIONES_MENU, aGuardar, leerMenuInferior, menuInicial, type MenuInferior } from '@/lib/website/menuInferior';
import {
  botonConIcono,
  cambioEstiloGlifosCabecera,
  cambioGlifoCabecera,
  conEstiloGlifos,
  conPesoPropio,
  contarCategorias,
  estiloConCambio,
  filtrarCatalogo,
  pesoPropioBoton,
  sugeridosRef,
} from '../inspector/iconos/selectorIconosLogica';
import { botonConAccion } from '../inspector/menuInferiorLogica';

const NOMBRES = new Set(CATALOGO_PHOSPHOR.map((f) => f[0]));

describe('catálogo', () => {
  it('trae los 1.512 íconos de Phosphor, sin repetidos', () => {
    expect(CATALOGO_PHOSPHOR).toHaveLength(1512);
    expect(NOMBRES.size).toBe(1512);
  });

  it('todo nombre del contrato existe en la lista (sugeridos, equivalentes y nombres en español)', () => {
    const usados = [
      ...Object.values(EQUIVALENTE_PHOSPHOR),
      ...Object.keys(NOMBRES_ES),
      ...Object.values(SUGERIDOS_POR_ACCION).flat().map((s) => leerSugerido(s).name),
    ];
    expect(usados.filter((n) => !NOMBRES.has(n))).toEqual([]);
  });

  it('cada acción del menú inferior tiene sugeridos (6)', () => {
    for (const a of ACCIONES_MENU) expect(sugeridosRef(a)).toHaveLength(6);
    expect(sugeridosRef('currency').map((r) => r.name)).toContain('Globe');
    expect(sugeridosRef('favorites')[1]).toEqual({ set: 'phosphor', name: 'Heart', weight: 'fill' });
  });

  it('busca en español sin tildes y por inicio de palabra; también en inglés', () => {
    const carrito = filtrarCatalogo(CATALOGO_PHOSPHOR, 'carr', 'todos').map((f) => f[0]);
    expect(carrito[0]).toBe('ShoppingCart');
    expect(filtrarCatalogo(CATALOGO_PHOSPHOR, 'corazon', 'todos').map((f) => f[0])).toContain('Heart');
    expect(filtrarCatalogo(CATALOGO_PHOSPHOR, 'Canasta', 'comercio').map((f) => f[0])).toContain('Basket');
    expect(filtrarCatalogo(CATALOGO_PHOSPHOR, 'dog', 'mascotas').map((f) => f[0])).toContain('Dog');
    expect(filtrarCatalogo(CATALOGO_PHOSPHOR, 'zzzzqq', 'todos')).toEqual([]);
    expect(coincideBusqueda('bolsa compras', 'compras bol')).toBe(true);
  });

  it('cada categoría tiene íconos y los primeros son los de nombre en español', () => {
    const conteo = contarCategorias(CATALOGO_PHOSPHOR);
    for (const c of CATEGORIAS_ICONOS) expect(conteo[c]).toBeGreaterThan(0);
    expect(CATALOGO_PHOSPHOR[0][0]).toBe('ShoppingCart');
    expect(CATALOGO_PHOSPHOR[0][2]).toBe('Carrito');
  });
});

describe('contrato del estilo', () => {
  it('sin nada (o con valores de hoy o inválidos) no hay estilo', () => {
    expect(leerEstiloGlifos(undefined)).toBeNull();
    expect(leerEstiloGlifos({ shadow: 'none', bg: { shape: 'none' }, scope: 'all', size: 99, weight: 'x' })).toBeNull();
    expect(estiloGlifosAGuardar(null)).toBeNull();
  });

  it('un texto es Lucide; el objeto de Phosphor se valida', () => {
    expect(leerRefGlifo('cart')).toBeNull();
    expect(leerRefGlifo({ set: 'phosphor', name: '../../x' })).toBeNull();
    expect(leerRefGlifo({ set: 'phosphor', name: 'Basket', weight: 'duotone' })).toEqual({ set: 'phosphor', name: 'Basket', weight: 'duotone' });
  });

  it('qué dibujo se pinta', () => {
    expect(dibujoGlifo(null, 'cart', null)).toEqual({ tipo: 'lucide', trazo: null });
    expect(dibujoGlifo(null, 'cart', { weight: 'duotone' })).toEqual({ tipo: 'phosphor', name: 'ShoppingCart', weight: 'duotone' });
    expect(dibujoGlifo(null, 'search-check', { weight: 'fill' })).toEqual({ tipo: 'lucide', trazo: { fill: 'currentColor', strokeWidth: 1.25 } });
    expect(dibujoGlifo({ set: 'phosphor', name: 'Tote', weight: 'bold' }, 'cart', null)).toEqual({ tipo: 'phosphor', name: 'Tote', weight: 'bold' });
    expect(pesoEfectivo({ set: 'phosphor', name: 'Tote', weight: 'bold' }, { weight: 'fill' })).toBe('fill');
    expect(pesoEfectivo({ set: 'phosphor', name: 'Tote', weight: 'bold' }, { weight: 'fill', scope: 'item' })).toBe('bold');
  });
});

describe('cabecera: header_iconos.glifos e iconStyle', () => {
  it('elegir un dibujo del catálogo y quitarlo', () => {
    const a = { header_iconos: { estilo: 'texto' } };
    const c = cambioGlifoCabecera(a, 'carrito', { set: 'phosphor', name: 'Basket' });
    expect(c).toEqual({ header_iconos: { estilo: 'texto', glifos: { carrito: { set: 'phosphor', name: 'Basket' } } } });
    expect(glifosCabecera(c)).toEqual({ carrito: { set: 'phosphor', name: 'Basket' } });
    expect(cambioGlifoCabecera(c, 'carrito', null)).toEqual({ header_iconos: { estilo: 'texto' } });
    expect(cambioGlifoCabecera({}, 'cuenta', null)).toEqual({ header_iconos: null });
  });

  it('estilo de los íconos: se guarda limpio y «Volver a hoy» borra la clave', () => {
    const c = cambioEstiloGlifosCabecera({}, { weight: 'fill', shadow: 'none', bg: { shape: 'circle', color: '#2563EB' } });
    expect(c).toEqual({ header_iconos: { iconStyle: { weight: 'fill', bg: { shape: 'circle', color: '#2563EB' } } } });
    expect(estiloGlifosCabecera(c)).toEqual({ weight: 'fill', bg: { shape: 'circle', color: '#2563EB' } });
    expect(cambioEstiloGlifosCabecera(c, null)).toEqual({ header_iconos: null });
  });

  it('estiloConCambio quita lo que vuelve a hoy', () => {
    expect(estiloConCambio({ weight: 'fill' }, { weight: undefined })).toBeNull();
    expect(estiloConCambio(null, { size: 20 })).toEqual({ size: 20 });
  });
});

describe('menú inferior: items[].icon objeto y style.iconStyle', () => {
  const base = (): MenuInferior => menuInicial({ mobile_menu_style: 'tabs' }).menu;

  it('sin tocar nada no se escribe nada nuevo', () => {
    const g = aGuardar(base());
    expect(JSON.stringify(g)).not.toContain('iconStyle');
    expect((g.items as { icon: unknown }[]).every((i) => typeof i.icon === 'string')).toBe(true);
  });

  it('elegir del catálogo guarda el objeto en icon; uno de siempre lo quita', () => {
    const m = base();
    const conGlifo = { ...m, items: m.items.map((b) => (b.action === 'cart' ? botonConIcono(b, { tipo: 'phosphor', ref: { set: 'phosphor', name: 'Basket' } }) : b)) };
    const g = aGuardar(conGlifo);
    const carrito = (g.items as { action: string; icon: unknown }[]).find((i) => i.action === 'cart');
    expect(carrito?.icon).toEqual({ set: 'phosphor', name: 'Basket' });
    const leido = leerMenuInferior({ mobile_header: { bottom_nav: g } })!;
    expect(leido.items.find((b) => b.action === 'cart')?.glyph).toEqual({ set: 'phosphor', name: 'Basket' });
    const vuelta = botonConIcono(leido.items.find((b) => b.action === 'cart')!, { tipo: 'clasico', nombre: 'cart' });
    expect(vuelta.glyph).toBeUndefined();
    expect(vuelta.icon).toBe('cart');
  });

  it('cambiar la acción conserva el dibujo elegido', () => {
    const b = { ...base().items[3], glyph: { set: 'phosphor' as const, name: 'Basket' } };
    expect(botonConAccion(b, 'order').glyph).toEqual({ set: 'phosphor', name: 'Basket' });
  });

  it('estilo general y peso propio por botón', () => {
    let m = base();
    const id = m.items[3].id;
    m = { ...m, items: m.items.map((b) => (b.id === id ? { ...b, glyph: { set: 'phosphor' as const, name: 'Basket' } } : b)) };
    m = conEstiloGlifos(m, { weight: 'duotone' });
    expect(m.style.iconStyle).toEqual({ weight: 'duotone' });
    m = conPesoPropio(m, id, 'fill');
    expect(m.style.iconStyle).toEqual({ weight: 'duotone', scope: 'item' });
    expect(pesoPropioBoton(m, m.items.find((b) => b.id === id)!)).toBe('fill');
    const g = aGuardar(m);
    expect(g.style).toMatchObject({ iconStyle: { weight: 'duotone', scope: 'item' } });
    m = conPesoPropio(m, id, null);
    expect(m.items.find((b) => b.id === id)!.glyph).toEqual({ set: 'phosphor', name: 'Basket' });
    expect(conEstiloGlifos(m, null).style.iconStyle).toBeUndefined();
  });
});

describe('textos del selector en 4 idiomas', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const leer = (l: string) => require(`../../../../../messages/${l}.json`).sitioWeb.editor.selectorIconos as Record<string, unknown>;
  const claves = (o: Record<string, unknown>, p = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? claves(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`])).sort();
  it('es, en, fr y pt tienen las mismas claves', () => {
    const es = claves(leer('es'));
    expect(es.length).toBeGreaterThan(60);
    for (const l of ['en', 'fr', 'pt']) expect(claves(leer(l))).toEqual(es);
  });
  it('«Fondo del ícono» de la cabecera avisa que no cambia la lupa dentro de la barra de búsqueda', () => {
    expect(leer('es').fondoAyudaCabecera).toMatch(/no cambia la lupa dentro de la barra de búsqueda/i);
    for (const l of ['en', 'fr', 'pt']) expect(String(leer(l).fondoAyudaCabecera).length).toBeGreaterThan(30);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fuente = require('fs').readFileSync(require('path').join(__dirname, '../inspector/iconos/EstiloIconosSeccion.tsx'), 'utf8') as string;
    expect(fuente).toMatch(/\{!esMenu && <p[^>]*>\{t\('fondoAyudaCabecera'\)\}<\/p>\}/);
  });
});
