/**
 * Paginación y carrusel: cada estilo, el override de la sección, móvil contra
 * escritorio, y el caso sin ajustes (se ve como hoy).
 */
import { esquemaAjusteCarrusel, esquemaAjustePaginacion, esquemaTema } from '@/lib/website/contrato/documentoSitio';
import {
  clasesFlecha,
  clasesPaginacion,
  numerosDePagina,
  resolverCarrusel,
  resolverPaginacion,
  BASE_CARRUSEL_HERO,
  BASE_CARRUSEL_PRODUCTO,
} from '@/lib/website/v2/paginacionCarrusel';

const ESTILOS = ['numerada', 'compacta', 'cargar_mas', 'infinito', 'anterior_siguiente'] as const;
const FLECHAS = ['chevron', 'circulo', 'cuadrado', 'larga', 'hover'] as const;
const INDICADORES = ['ninguno', 'puntos', 'barra', 'numeros', 'progreso', 'miniaturas'] as const;

describe('sin ajustes, la paginación y el carrusel siguen como hoy', () => {
  it('la rejilla no activa el componente nuevo y conserva las clases de 1 2 … 17', () => {
    const r = resolverPaginacion({ legado: 'grilla', porPagina: 12 }, null, null, false);
    expect(r.activo).toBe(false);
    expect(r.porPagina).toBe(12);
    expect(r.porPaginaExplicito).toBe(false);
    expect(clasesPaginacion(r).contenedor).toBe('flex items-center justify-center gap-1 mt-8');
    expect(clasesPaginacion(r).numero).toContain('min-w-[36px] h-9 rounded-lg');
    expect(numerosDePagina(2, 17, true)).toEqual([1, 2, 3, '…', 17]);
  });

  it('la categoría conserva su bloque centrado', () => {
    const r = resolverPaginacion({ legado: 'categoria', porPagina: 12 }, null, undefined, true);
    expect(r.activo).toBe(false);
    expect(clasesPaginacion(r).contenedor).toBe('flex items-center justify-center gap-2 mt-10');
    expect(clasesPaginacion(r).numero).toContain('min-w-[40px] h-10');
  });

  it('el carrusel de productos no se activa y el hero sigue sin flechas', () => {
    const producto = resolverCarrusel(BASE_CARRUSEL_PRODUCTO, null, null, false);
    const hero = resolverCarrusel(BASE_CARRUSEL_HERO, null, null, false);
    expect(producto.activo).toBe(false);
    expect(producto.indicador).toBe('puntos');
    expect(producto.estiloFlechas).toBe('hover');
    expect(hero.flechas).toBe(false);
    expect(hero.autoplay).toBe(true);
  });
});

describe('estilos de paginación y de carrusel', () => {
  it.each(ESTILOS)('paginación %s', (estilo) => {
    const r = resolverPaginacion({ legado: 'grilla', porPagina: 12 }, { estilo }, null, false);
    expect(r.activo).toBe(true);
    expect(r.estilo).toBe(estilo);
    expect(clasesPaginacion(r).contenedor).toContain('justify-center');
  });

  it.each(FLECHAS)('flecha %s', (estiloFlechas) => {
    const r = resolverCarrusel(BASE_CARRUSEL_PRODUCTO, { estiloFlechas }, null, false);
    expect(r.estiloFlechas).toBe(estiloFlechas);
    const clase = clasesFlecha(estiloFlechas, 'md', true);
    if (estiloFlechas === 'hover') expect(clase).toContain('group-hover/carousel:opacity-100');
    if (estiloFlechas === 'circulo' || estiloFlechas === 'hover') expect(clase).toContain('rounded-full');
    if (estiloFlechas === 'cuadrado') expect(clase).toContain('rounded-lg');
    if (estiloFlechas === 'chevron') expect(clase).toContain('bg-transparent');
    if (estiloFlechas === 'larga') expect(clase).toContain('w-14');
  });

  it.each(INDICADORES)('indicador %s', (indicador) => {
    const r = resolverCarrusel(BASE_CARRUSEL_PRODUCTO, { indicador }, null, false);
    expect(r.indicador).toBe(indicador);
  });
});

describe('override de sección y móvil contra escritorio', () => {
  it('la sección pisa al global solo en lo que ella define', () => {
    const r = resolverPaginacion(
      { legado: 'grilla', porPagina: 12 },
      { estilo: 'compacta', porPaginaEscritorio: 24, porPaginaMovil: 8 },
      { usar_global: false, estilo: 'cargar_mas' },
      false,
    );
    expect(r.estilo).toBe('cargar_mas');
    expect(r.porPagina).toBe(24);
  });

  it('con usar el global, la sección no pisa', () => {
    const r = resolverPaginacion(
      { legado: 'grilla', porPagina: 12 },
      { estilo: 'compacta' },
      { usar_global: true, estilo: 'infinito' },
      false,
    );
    expect(r.estilo).toBe('compacta');
  });

  it('el móvil usa su cantidad y el escritorio la suya', () => {
    const global = { porPaginaEscritorio: 24, porPaginaMovil: 8, flechasEscritorio: true, flechasMovil: false, visiblesEscritorio: 4, visiblesMovil: 1 };
    const escritorio = resolverPaginacion({ legado: 'grilla', porPagina: 12 }, global, null, false);
    const movil = resolverPaginacion({ legado: 'grilla', porPagina: 12 }, global, null, true);
    expect(escritorio.porPagina).toBe(24);
    expect(movil.porPagina).toBe(8);
    const cEsc = resolverCarrusel(BASE_CARRUSEL_PRODUCTO, global, null, false);
    const cMov = resolverCarrusel(BASE_CARRUSEL_PRODUCTO, global, null, true);
    expect(cEsc.flechas).toBe(true);
    expect(cEsc.visibles).toBe(4);
    expect(cMov.flechas).toBe(false);
    expect(cMov.visibles).toBe(1);
  });
});

describe('el contrato acepta los ajustes y sigue aceptando un tema sin ellos', () => {
  it('un tema viejo sigue siendo válido', () => {
    expect(esquemaTema.safeParse({ colores: {}, tipografia: {} }).success).toBe(true);
  });

  it('paginación y carrusel opcionales entran en el tema', () => {
    const tema = esquemaTema.safeParse({
      colores: {},
      tipografia: {},
      paginacion: { mode: 'value', value: { estilo: 'compacta', porPaginaEscritorio: 24, porPaginaMovil: 8 } },
      carrusel: { mode: 'value', value: { indicador: 'barra', estiloFlechas: 'circulo', flechasMovil: false } },
    });
    expect(tema.success).toBe(true);
    expect(esquemaAjustePaginacion.safeParse({ estilo: 'no-existe' }).success).toBe(false);
    expect(esquemaAjusteCarrusel.safeParse({ indicador: 'puntos' }).success).toBe(true);
  });
});
