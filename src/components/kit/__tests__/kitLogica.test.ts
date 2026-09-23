/**
 * Kit de componentes: la lógica sin DOM (el repo corre jest en `node` y no
 * tiene testing-library). Cubre lo que decide qué ve la persona: el tono de
 * cada estado, la paginación, la selección, el estado del listado en la URL,
 * el menú de acciones, la virtualización, el debounce y las flechas.
 */
import { etiquetaEstado, normalizarEstado, resolverEstado, ESTADOS_CONOCIDOS } from '../estadoTono';
import {
  calcularRango,
  paginaDesdeTexto,
  paginasVisibles,
  resumenCompacto,
  resumenPaginacion,
} from '../paginacion';
import {
  contarFiltrosActivos,
  escribirEstadoListado,
  leerEstadoListado,
  rangoServidor,
  siguienteOrden,
  valoresFiltro,
  type ConfigListado,
} from '../listadoUrl';
import { alternarId, alternarPagina, estadoCasillaCabecera } from '../seleccion';
import { prepararMenu, type AccionFila } from '../acciones';
import { calcularVentana } from '../virtualizacion';
import { crearDebounce } from '../debounce';
import { indiceSiguiente } from '../navegacionTeclado';

describe('estadoTono: un estado = un tono (SISTEMA-BADGES §4)', () => {
  test('«Pagada» es éxito en cobrar y en pagar, se escriba como se escriba', () => {
    for (const e of ['Pagada', 'pagada', 'PAGADA', 'paid', 'Pagado', 'Cobrada']) {
      expect(resolverEstado(e)).toMatchObject({ tono: 'exito', apariencia: 'suave', conocido: true });
    }
  });

  test('Borrador es neutro (listado y detalle), Anulada es peligro con contorno', () => {
    expect(resolverEstado('Borrador')).toMatchObject({ tono: 'neutro', apariencia: 'suave' });
    expect(resolverEstado('draft')).toMatchObject({ tono: 'neutro', apariencia: 'suave' });
    expect(resolverEstado('Anulada')).toMatchObject({ tono: 'peligro', apariencia: 'contorno' });
    expect(resolverEstado('void')).toMatchObject({ tono: 'peligro', apariencia: 'contorno' });
  });

  test('los días vencidos van dentro de la etiqueta y no cambian el tono', () => {
    expect(normalizarEstado('Vencida 12 d')).toBe('vencida');
    expect(normalizarEstado('Vencida (12 d)')).toBe('vencida');
    expect(normalizarEstado('vencida 3 días')).toBe('vencida');
    expect(resolverEstado('Vencida 12 d')).toMatchObject({ tono: 'peligro', apariencia: 'suave' });
  });

  test('tildes, guiones y guiones bajos no importan', () => {
    expect(resolverEstado('Al día').tono).toBe('exito');
    expect(resolverEstado('al_dia').tono).toBe('exito');
    expect(resolverEstado('Crítico')).toMatchObject({ tono: 'peligro', apariencia: 'solido' });
    expect(resolverEstado('out_of_stock')).toMatchObject({ tono: 'peligro', apariencia: 'solido' });
    expect(resolverEstado('Sin conexión')).toMatchObject({ tono: 'neutro', apariencia: 'contorno', punto: true });
  });

  test('parcial es advertencia con contorno; pendiente, advertencia suave', () => {
    expect(resolverEstado('Pago parcial')).toMatchObject({ tono: 'advertencia', apariencia: 'contorno' });
    expect(resolverEstado('partial')).toMatchObject({ tono: 'advertencia', apariencia: 'contorno' });
    expect(resolverEstado('Pendiente')).toMatchObject({ tono: 'advertencia', apariencia: 'suave' });
  });

  test('la temperatura del CRM lleva punto', () => {
    expect(resolverEstado('Frío')).toMatchObject({ tono: 'informacion', punto: true });
    expect(resolverEstado('Tibio')).toMatchObject({ tono: 'advertencia', punto: true });
    expect(resolverEstado('Caliente')).toMatchObject({ tono: 'peligro', punto: true });
  });

  test('los métodos de pago son categorías: nunca sólidos', () => {
    for (const m of ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque']) {
      expect(resolverEstado(m).apariencia).toBe('contorno');
    }
  });

  test('un estado desconocido es neutro y se marca como desconocido', () => {
    expect(resolverEstado('algo raro')).toEqual({ tono: 'neutro', apariencia: 'suave', punto: false, conocido: false });
    expect(resolverEstado(null).conocido).toBe(false);
  });

  test('la tabla no contradice su propia regla: cada clave aparece una sola vez normalizada', () => {
    const normalizadas = ESTADOS_CONOCIDOS.map(normalizarEstado);
    expect(new Set(normalizadas).size).toBe(normalizadas.length);
    // Y cada clave ya está en su forma normalizada (si no, nunca se encontraría).
    expect(normalizadas).toEqual([...ESTADOS_CONOCIDOS]);
  });

  test('etiquetaEstado traduce lo que la BD guarda en inglés y conserva los días', () => {
    expect(etiquetaEstado('paid')).toBe('Pagada');
    expect(etiquetaEstado('overdue 12 d')).toBe('Vencida 12 d');
    expect(etiquetaEstado('vencida')).toBe('Vencida');
    expect(etiquetaEstado('')).toBe('—');
  });
});

describe('paginación única (PATRONES §2)', () => {
  test('rango de la página y acotado a los extremos', () => {
    expect(calcularRango(1, 10, 273)).toEqual({ pagina: 1, totalPaginas: 28, desde: 1, hasta: 10, total: 273 });
    expect(calcularRango(28, 10, 273)).toMatchObject({ desde: 271, hasta: 273 });
    expect(calcularRango(99, 10, 273).pagina).toBe(28);
    expect(calcularRango(0, 10, 273).pagina).toBe(1);
    expect(calcularRango(3, 10, 0)).toEqual({ pagina: 1, totalPaginas: 1, desde: 0, hasta: 0, total: 0 });
  });

  test('números visibles como en Figma: 1 2 3 … 175', () => {
    expect(paginasVisibles(1, 175)).toEqual([1, 2, 3, 'elipsis-der', 175]);
    expect(paginasVisibles(5, 175)).toEqual([1, 'elipsis-izq', 4, 5, 6, 'elipsis-der', 175]);
    expect(paginasVisibles(175, 175)).toEqual([1, 'elipsis-izq', 173, 174, 175]);
    expect(paginasVisibles(3, 175)).toEqual([1, 2, 3, 4, 'elipsis-der', 175]);
  });

  test('un hueco de una sola página se rellena con el número, no con «…»', () => {
    expect(paginasVisibles(4, 10)).toEqual([1, 2, 3, 4, 5, 'elipsis-der', 10]);
    expect(paginasVisibles(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(paginasVisibles(1, 1)).toEqual([1]);
  });

  test('resúmenes con el sustantivo del dominio y separador de miles', () => {
    const s = { singular: 'sesión', plural: 'sesiones' };
    expect(resumenPaginacion(calcularRango(1, 6, 42), s)).toBe('Mostrando 1 a 6 de 42 sesiones');
    expect(resumenPaginacion(calcularRango(1, 50, 18000), { singular: 'cliente', plural: 'clientes' })).toBe(
      'Mostrando 1 a 50 de 18.000 clientes',
    );
    expect(resumenPaginacion(calcularRango(1, 10, 1), s)).toBe('Mostrando 1 a 1 de 1 sesión');
    expect(resumenCompacto(calcularRango(1, 10, 273))).toBe('1–10 de 273');
  });

  test('«Ir a» solo acepta páginas que existen', () => {
    expect(paginaDesdeTexto('3', 28)).toBe(3);
    expect(paginaDesdeTexto(' 28 ', 28)).toBe(28);
    expect(paginaDesdeTexto('29', 28)).toBeNull();
    expect(paginaDesdeTexto('0', 28)).toBeNull();
    expect(paginaDesdeTexto('2a', 28)).toBeNull();
    expect(paginaDesdeTexto('', 28)).toBeNull();
  });
});

describe('selección múltiple', () => {
  const pagina = ['a', 'b', 'c'];
  test('la casilla de cabecera: vacía, indeterminada o marcada', () => {
    expect(estadoCasillaCabecera(new Set(), pagina)).toBe(false);
    expect(estadoCasillaCabecera(new Set(['a']), pagina)).toBe('indeterminate');
    expect(estadoCasillaCabecera(new Set(['a', 'b', 'c', 'z']), pagina)).toBe(true);
    expect(estadoCasillaCabecera(new Set(['z']), [])).toBe(false);
  });

  test('alternar la página conserva lo seleccionado en otras páginas', () => {
    const conOtra = new Set(['z', 'a']);
    expect([...alternarPagina(conOtra, pagina)].sort()).toEqual(['a', 'b', 'c', 'z']);
    expect([...alternarPagina(new Set(['z', 'a', 'b', 'c']), pagina)]).toEqual(['z']);
  });

  test('alternar un id no muta el conjunto original', () => {
    const original = new Set(['a']);
    expect([...alternarId(original, 'b')].sort()).toEqual(['a', 'b']);
    expect([...alternarId(original, 'a')]).toEqual([]);
    expect([...original]).toEqual(['a']);
  });
});

describe('estado del listado en la URL (useListadoServidor)', () => {
  const config: ConfigListado = {
    filtros: ['estado', 'tipo'],
    camposOrden: ['nombre', 'saldo'],
    ordenPorDefecto: { campo: 'nombre', direccion: 'asc' },
    tamanoPorDefecto: 20,
  };
  const leer = (qs: string, c: ConfigListado = config) => leerEstadoListado(new URLSearchParams(qs), c);

  test('sin parámetros: los valores por defecto', () => {
    expect(leer('')).toEqual({
      busqueda: '',
      filtros: {},
      orden: { campo: 'nombre', direccion: 'asc' },
      pagina: 1,
      tamano: 20,
    });
    expect(leerEstadoListado(null, config).pagina).toBe(1);
  });

  test('lee búsqueda, filtros, orden, página y tamaño', () => {
    expect(leer('q=ferreteria&estado=activo&orden=saldo&dir=desc&pagina=3&tamano=50')).toEqual({
      busqueda: 'ferreteria',
      filtros: { estado: 'activo' },
      orden: { campo: 'saldo', direccion: 'desc' },
      pagina: 3,
      tamano: 50,
    });
  });

  test('descarta lo que no está en la lista blanca (termina en .order()/.eq() del servidor)', () => {
    const e = leer('orden=password&ciudad=bogota&tamano=100000&pagina=-2');
    expect(e.orden).toEqual({ campo: 'nombre', direccion: 'asc' });
    expect(e.filtros).toEqual({});
    expect(e.tamano).toBe(20);
    expect(e.pagina).toBe(1);
    expect(leer('pagina=2.5').pagina).toBe(1);
  });

  test('la búsqueda se recorta a 200 caracteres', () => {
    expect(leer(`q=${'x'.repeat(500)}`).busqueda).toHaveLength(200);
  });

  test('escribir omite los valores por defecto y conserva claves ajenas', () => {
    const estado = leer('');
    expect(escribirEstadoListado(estado, config, 'tab=resumen').toString()).toBe('tab=resumen');
    const cambiado = { ...estado, busqueda: 'norte', filtros: { tipo: 'empresa' }, pagina: 2, tamano: 50 };
    const qs = escribirEstadoListado(cambiado, config, 'tab=resumen&estado=viejo');
    expect(Object.fromEntries(qs)).toEqual({ tab: 'resumen', q: 'norte', tipo: 'empresa', pagina: '2', tamano: '50' });
  });

  test('ida y vuelta: lo que se escribe es lo que se lee', () => {
    const estado = {
      busqueda: 'ferretería centro',
      filtros: { estado: 'activo,inactivo' },
      orden: { campo: 'saldo', direccion: 'desc' as const },
      pagina: 4,
      tamano: 100,
    };
    expect(leer(escribirEstadoListado(estado, config).toString())).toEqual(estado);
  });

  test('prefijo para dos listados en la misma página', () => {
    const c = { ...config, prefijo: 'prov_' };
    const qs = escribirEstadoListado({ ...leer('', c), pagina: 2 }, c, 'pagina=7');
    expect(qs.get('prov_pagina')).toBe('2');
    expect(qs.get('pagina')).toBe('7');
    expect(leer(qs.toString(), c).pagina).toBe(2);
  });

  test('rango para .range() de Supabase, orden de cabecera, filtros activos y multivalor', () => {
    expect(rangoServidor({ pagina: 1, tamano: 20 })).toEqual({ desde: 0, hasta: 19 });
    expect(rangoServidor({ pagina: 3, tamano: 50 })).toEqual({ desde: 100, hasta: 149 });
    expect(siguienteOrden({ campo: 'nombre', direccion: 'asc' }, 'nombre')).toEqual({ campo: 'nombre', direccion: 'desc' });
    expect(siguienteOrden({ campo: 'nombre', direccion: 'desc' }, 'nombre')).toEqual({ campo: 'nombre', direccion: 'asc' });
    expect(siguienteOrden({ campo: 'nombre', direccion: 'desc' }, 'saldo')).toEqual({ campo: 'saldo', direccion: 'asc' });
    expect(contarFiltrosActivos(leer('estado=activo&tipo=empresa&q=x'))).toBe(2);
    expect(valoresFiltro('activo, inactivo,,')).toEqual(['activo', 'inactivo']);
    expect(valoresFiltro(undefined)).toEqual([]);
  });
});

describe('menú de acciones (PATRONES §6 y §11)', () => {
  const icono = (() => null) as unknown as AccionFila['icono'];
  const a = (id: string, extra: Partial<AccionFila> = {}): AccionFila => ({
    id,
    etiqueta: id,
    icono,
    onSelect: () => undefined,
    ...extra,
  });
  const forma = (acciones: AccionFila[]) =>
    prepararMenu(acciones).map((e) => (e.tipo === 'separador' ? '—' : e.accion.id));

  test('lo destructivo va al final, tras un divisor, aunque se declare antes', () => {
    expect(forma([a('eliminar', { destructiva: true }), a('ver'), a('editar')])).toEqual(['ver', 'editar', '—', 'eliminar']);
  });

  test('sin divisores al principio, dobles ni al final; las ocultas no cuentan', () => {
    expect(forma([a('ver', { separadorAntes: true }), a('pago', { separadorAntes: true }), a('x', { oculta: true })])).toEqual([
      'ver',
      '—',
      'pago',
    ]);
    expect(forma([a('eliminar', { destructiva: true })])).toEqual(['eliminar']);
    expect(forma([])).toEqual([]);
  });
});

describe('virtualización (> 500 filas)', () => {
  test('monta solo lo visible más un margen', () => {
    const v = calcularVentana({ scrollTop: 5200, altoVisible: 520, altoFila: 52, total: 18000, margen: 8 });
    expect(v.inicio).toBe(92);
    expect(v.fin).toBe(100 + 11 + 8);
    expect(v.espacioArriba).toBe(92 * 52);
    expect(v.espacioArriba + (v.fin - v.inicio) * 52 + v.espacioAbajo).toBe(18000 * 52);
  });

  test('en los extremos no se sale del arreglo', () => {
    expect(calcularVentana({ scrollTop: 0, altoVisible: 400, altoFila: 40, total: 5 })).toEqual({
      inicio: 0,
      fin: 5,
      espacioArriba: 0,
      espacioAbajo: 0,
    });
    expect(calcularVentana({ scrollTop: 0, altoVisible: 400, altoFila: 40, total: 0 }).fin).toBe(0);
  });
});

describe('debounce del buscador', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('solo emite el último valor tras la pausa', () => {
    const fn = jest.fn();
    const d = crearDebounce(fn, 400);
    d.llamar('f');
    d.llamar('fe');
    jest.advanceTimersByTime(399);
    d.llamar('fer');
    jest.advanceTimersByTime(399);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('fer');
  });

  test('Enter ejecuta ya y cancelar descarta', () => {
    const fn = jest.fn();
    const d = crearDebounce(fn, 400);
    d.llamar('norte');
    d.ejecutarYa();
    expect(fn).toHaveBeenCalledWith('norte');
    d.llamar('sur');
    d.cancelar();
    jest.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    d.ejecutarYa();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('flechas del SegmentedControl', () => {
  test('avanza, retrocede, da la vuelta y salta las deshabilitadas', () => {
    expect(indiceSiguiente(0, 3, 'ArrowRight')).toBe(1);
    expect(indiceSiguiente(2, 3, 'ArrowRight')).toBe(0);
    expect(indiceSiguiente(0, 3, 'ArrowLeft')).toBe(2);
    expect(indiceSiguiente(0, 3, 'ArrowRight', [false, true, false])).toBe(2);
    expect(indiceSiguiente(1, 3, 'Home', [true, false, false])).toBe(1);
    expect(indiceSiguiente(0, 3, 'End', [false, false, true])).toBe(1);
    expect(indiceSiguiente(0, 3, 'Enter')).toBeNull();
    expect(indiceSiguiente(0, 2, 'ArrowRight', [true, true])).toBeNull();
  });
});
