/**
 * Kit · lógica de presentación de las piezas de venta del POS (POS-PLAN §3.3):
 * `CartTag`, `CartLine`, `ProductCard` y `CategoryBar`. Nada de esto calcula
 * negocio: se prueba qué texto, qué insignia, qué color y qué control.
 */
import { clasesTonoCartTag, vistaCartTag } from '../cartTagLogica';
import {
  ATAJOS_LINEA,
  cantidadDesdeTexto,
  controlesDeshabilitados,
  hayRenglonEtiquetas,
  mostrarAgregarDescuento,
  textoImpuestoLinea,
} from '../cartLineLogica';
import {
  clasesStock,
  eleccion,
  inicialProducto,
  insigniasTarjeta,
  nivelStock,
  parteStock,
  partesMeta,
  porcentajeDescuento,
  UMBRAL_STOCK_BAJO,
  type ProductoTarjeta,
} from '../productCardLogica';
import {
  chevronesVisibles,
  claveValor,
  indiceElegido,
  moverIndice,
  opcionesBarra,
  pasoDesplazamiento,
  type CategoriaBarra,
} from '../categoryBarLogica';
import { ariaAtajo } from '../teclas';

describe('CartTag: tono, icono y tooltip por origen del descuento', () => {
  test('manual: rojo con etiqueta; general: rojo con % y sufijo; promoción: violeta', () => {
    expect(vistaCartTag({ origen: 'manual' })).toEqual({ tono: 'peligro', icono: 'etiqueta', sufijo: null, claveTitulo: 'descuentoManualTitulo' });
    expect(vistaCartTag({ origen: 'general' })).toEqual({ tono: 'peligro', icono: 'porcentaje', sufijo: 'general', claveTitulo: 'descuentoGeneralTitulo' });
    expect(vistaCartTag({ origen: 'promocion' }).tono).toBe('promocion');
  });

  test('el origen manda sobre el tono; sin nada, neutro y sin icono', () => {
    expect(vistaCartTag({ tono: 'exito', origen: 'manual' }).tono).toBe('peligro');
    expect(vistaCartTag({ tono: 'informacion' })).toEqual({ tono: 'informacion', icono: null, sufijo: null, claveTitulo: null });
    expect(vistaCartTag({})).toMatchObject({ tono: 'neutro' });
  });

  test('solo tokens semánticos: sin dark:, hex ni gray-*', () => {
    for (const tono of ['neutro', 'marca', 'advertencia', 'peligro', 'exito', 'informacion', 'promocion'] as const) {
      const { caja, icono } = clasesTonoCartTag(tono);
      expect(`${caja} ${icono}`).not.toMatch(/dark:|#[0-9a-f]{3,6}|gray-/i);
    }
    expect(clasesTonoCartTag('peligro').caja).toBe('bg-danger-subtle text-danger-text');
  });
});

describe('CartLine: texto del impuesto según el modo', () => {
  test('encima → «+$X impuestos»; incluido → «inc. $X impuestos» (en verde)', () => {
    expect(textoImpuestoLinea({ modo: 'encima', importe: 72162 })).toEqual({ clave: 'impuestoEncima', importe: 72162, tono: 'exito' });
    expect(textoImpuestoLinea({ modo: 'incluido', importe: 7185 })).toEqual({ clave: 'impuestoIncluido', importe: 7185, tono: 'exito' });
  });

  test('sin importe no dice nada (como hoy: solo con tax_amount > 0)', () => {
    expect(textoImpuestoLinea({ modo: 'encima', importe: 0 })).toBeNull();
    expect(textoImpuestoLinea({ modo: 'incluido', importe: null })).toBeNull();
    expect(textoImpuestoLinea(null)).toBeNull();
  });

  test('excluido → «Sin impuesto» en ámbar aunque traiga importe; sin asignar → neutro', () => {
    expect(textoImpuestoLinea({ modo: 'excluido', importe: 500 })).toEqual({ clave: 'sinImpuesto', tono: 'advertencia' });
    expect(textoImpuestoLinea({ modo: 'sinAsignar' })).toEqual({ clave: 'sinImpuestoAsignado', tono: 'neutro' });
  });
});

describe('CartLine: controles, descuento y cantidad', () => {
  test('bloqueada (espera o deuda) apaga todo', () => {
    expect(controlesDeshabilitados({ bloqueada: true, modoImpuesto: 'encima' })).toEqual({ cantidad: true, incluido: true, acciones: true });
  });

  test('con el impuesto excluido solo se apaga «Incluido» (como hoy)', () => {
    expect(controlesDeshabilitados({ modoImpuesto: 'excluido' })).toEqual({ cantidad: false, incluido: true, acciones: false });
    expect(controlesDeshabilitados({ modoImpuesto: 'encima', incluidoDeshabilitado: true }).incluido).toBe(true);
    expect(controlesDeshabilitados({ modoImpuesto: 'incluido' })).toEqual({ cantidad: false, incluido: false, acciones: false });
  });

  test('«+ Agregar descuento» solo sin descuento, con acción, sin bloquear y sin editor abierto', () => {
    expect(mostrarAgregarDescuento({ hayAccion: true })).toBe(true);
    expect(mostrarAgregarDescuento({ hayAccion: true, conDescuento: true })).toBe(false);
    expect(mostrarAgregarDescuento({ hayAccion: true, bloqueada: true })).toBe(false);
    expect(mostrarAgregarDescuento({ hayAccion: true, editandoDescuento: true })).toBe(false);
    expect(mostrarAgregarDescuento({ hayAccion: false })).toBe(false);
  });

  test('el campo de cantidad no acepta ≤ 0 ni vacío (parseInt, como hoy)', () => {
    expect(cantidadDesdeTexto('3')).toBe(3);
    expect(cantidadDesdeTexto(' 12 ')).toBe(12);
    expect(cantidadDesdeTexto('2.7')).toBe(2);
    expect(cantidadDesdeTexto('0')).toBeNull();
    expect(cantidadDesdeTexto('-1')).toBeNull();
    expect(cantidadDesdeTexto('')).toBeNull();
    expect(cantidadDesdeTexto('abc')).toBeNull();
  });

  test('móvil: tercer renglón solo si hay algo que poner', () => {
    expect(hayRenglonEtiquetas({ etiquetas: 0, agregarDescuento: false, excluido: false, editor: false })).toBe(false);
    expect(hayRenglonEtiquetas({ etiquetas: 1, agregarDescuento: false, excluido: false, editor: false })).toBe(true);
    expect(hayRenglonEtiquetas({ etiquetas: 0, agregarDescuento: true, excluido: false, editor: false })).toBe(true);
    expect(hayRenglonEtiquetas({ etiquetas: 0, agregarDescuento: false, excluido: true, editor: false })).toBe(true);
  });

  test('atajos de la línea con foco (POS-UX-V2 §3) y cómo se anuncian', () => {
    expect(ATAJOS_LINEA).toEqual({ menos: '-', mas: '+', descuento: 'D', nota: 'N', excluirImpuesto: 'T', quitar: 'Supr' });
    expect(ariaAtajo(ATAJOS_LINEA.quitar)).toBe('Delete');
    expect(ariaAtajo(ATAJOS_LINEA.mas)).toBe('+');
    expect(ariaAtajo(ATAJOS_LINEA.menos)).toBe('-');
    expect(ariaAtajo(ATAJOS_LINEA.nota)).toBe('N');
  });
});

const base: ProductoTarjeta = { id: 1, nombre: 'Zapatilla urbana Nova 42', precio: 189900 };

describe('ProductCard: stock y su color', () => {
  test('verde por encima de 5, ámbar ≤ 5, rojo en 0', () => {
    expect(UMBRAL_STOCK_BAJO).toBe(5);
    expect(nivelStock({ cantidad: 22 })).toBe('ok');
    expect(nivelStock({ cantidad: 5 })).toBe('bajo');
    expect(nivelStock({ cantidad: 1 })).toBe('bajo');
    expect(nivelStock({ cantidad: 0 })).toBe('agotado');
    expect(clasesStock('ok').punto).toBe('bg-success');
    expect(clasesStock('bajo').punto).toBe('bg-warning');
    expect(clasesStock('agotado').punto).toBe('bg-danger');
    expect(clasesStock('sinSeguimiento').punto).toBe('bg-success');
  });

  test('el nivel del servicio y el «agotado» de la RPC mandan sobre la cantidad', () => {
    expect(nivelStock({ cantidad: 40, nivel: 'bajo' })).toBe('bajo');
    expect(nivelStock({ cantidad: 40 }, true)).toBe('agotado');
    expect(nivelStock('sinSeguimiento')).toBe('sinSeguimiento');
    expect(nivelStock(undefined)).toBeNull();
    expect(nivelStock({ cantidad: null })).toBeNull();
  });
});

describe('ProductCard: cuándo se puede elegir', () => {
  test('con precio y stock, sí', () => {
    expect(eleccion({ ...base, stock: { cantidad: 3 } })).toEqual({ elegible: true, motivo: null });
    expect(eleccion({ ...base, stock: 'sinSeguimiento' })).toEqual({ elegible: true, motivo: null });
  });

  test('agotado no; sin precio (B-14) no; agotado se dice primero', () => {
    expect(eleccion({ ...base, agotado: true })).toEqual({ elegible: false, motivo: 'agotado' });
    expect(eleccion({ ...base, precio: null })).toEqual({ elegible: false, motivo: 'sinPrecio' });
    expect(eleccion({ ...base, precio: null, stock: { cantidad: 0 } })).toEqual({ elegible: false, motivo: 'agotado' });
  });

  test('precio 0 sí se puede elegir (es un precio, no la falta de uno)', () => {
    expect(eleccion({ ...base, precio: 0 }).elegible).toBe(true);
  });
});

describe('ProductCard: insignias y su orden', () => {
  const completo: ProductoTarjeta = { ...base, precioComparacion: 229900, top: 12, favorito: true, stock: { cantidad: 0 } };

  test('descuento, estrella, Top y Agotado, cada uno en su esquina', () => {
    expect(insigniasTarjeta(completo, { variante: 'pos', tamano: 'md', conFavorito: true })).toEqual([
      { id: 'descuento', posicion: 'arriba-izquierda' },
      { id: 'favorito', posicion: 'arriba-derecha' },
      { id: 'top', posicion: 'abajo-izquierda' },
      { id: 'agotado', posicion: 'centro' },
    ]);
  });

  test('en sm no hay «Top» (la miniatura no tiene alto)', () => {
    const ids = insigniasTarjeta(completo, { variante: 'pos', tamano: 'sm', conFavorito: true }).map((i) => i.id);
    expect(ids).not.toContain('top');
    expect(ids).toContain('favorito');
  });

  test('la tarjeta móvil sí lleva «Top»; la lista ni descuento ni «Agotado» sobre la imagen', () => {
    expect(insigniasTarjeta(completo, { variante: 'movil-tarjeta', conFavorito: true }).map((i) => i.id)).toEqual([
      'descuento',
      'favorito',
      'top',
      'agotado',
    ]);
    expect(insigniasTarjeta(completo, { variante: 'movil-lista', conFavorito: true })).toEqual([
      { id: 'favorito', posicion: 'fila' },
      { id: 'top', posicion: 'abajo-izquierda' },
    ]);
  });

  test('sin acción de favorito, la estrella solo si ya es favorito', () => {
    expect(insigniasTarjeta({ ...base }, { variante: 'pos', conFavorito: false })).toEqual([]);
    expect(insigniasTarjeta({ ...base, favorito: true }, { variante: 'pos', conFavorito: false }).map((i) => i.id)).toEqual(['favorito']);
  });

  test('porcentaje de la comparación como hoy (redondeado, solo si es mayor)', () => {
    expect(porcentajeDescuento(189900, 229900)).toBe(17);
    expect(porcentajeDescuento(100, 100)).toBeNull();
    expect(porcentajeDescuento(120, 100)).toBeNull();
    expect(porcentajeDescuento(null, 100)).toBeNull();
    expect(porcentajeDescuento(100, null)).toBeNull();
  });
});

describe('ProductCard: meta y stock en texto', () => {
  test('variantes, modificadores y «Personalizable» como hoy', () => {
    expect(partesMeta({ variantes: 3 })).toEqual([{ clave: 'variantes', n: 3 }]);
    expect(partesMeta({ variantes: 5, modificadores: 1 })).toEqual([
      { clave: 'variantes', n: 5 },
      { clave: 'modificadores', n: 1 },
    ]);
    expect(partesMeta({ modificadores: 2 })).toEqual([{ clave: 'personalizable' }]);
    expect(partesMeta({ personalizable: true, detalle: 'Servicio' })).toEqual([{ clave: 'personalizable' }, { clave: 'detalle', texto: 'Servicio' }]);
    expect(partesMeta({})).toEqual([]);
  });

  test('stock: unidades, sin seguimiento, «Sin stock» en tarjeta y «0 uds · Agotado» en lista', () => {
    expect(parteStock({ stock: { cantidad: 22 } }, 'pos')).toEqual({ clave: 'unidades', n: 22 });
    expect(parteStock({ stock: 'sinSeguimiento' }, 'pos')).toEqual({ clave: 'sinSeguimiento' });
    expect(parteStock({ stock: { cantidad: 0 } }, 'pos')).toEqual({ clave: 'sinStock' });
    expect(parteStock({ stock: { cantidad: 0 } }, 'movil-lista')).toEqual({ clave: 'agotado', n: 0 });
    expect(parteStock({}, 'pos')).toBeNull();
  });

  test('inicial del marcador sin foto', () => {
    expect(inicialProducto('zapatilla')).toBe('Z');
    expect(inicialProducto('  ñame')).toBe('Ñ');
    expect(inicialProducto('***')).toBe('?');
  });
});

describe('CategoryBar: opciones, teclado y chevrones', () => {
  const cats: CategoriaBarra[] = [
    { id: 7, nombre: 'Bebidas', conteo: 42, top: 30, favorita: true },
    { id: 3, nombre: 'Panadería' },
  ];

  test('«Todas» primero, «Favoritas» si procede, y las categorías en el orden recibido', () => {
    expect(opcionesBarra(cats).map((o) => o.clave)).toEqual(['todas', 'c:7', 'c:3']);
    expect(opcionesBarra(cats, { mostrarFavoritas: true }).map((o) => o.clave)).toEqual(['todas', 'favoritas', 'c:7', 'c:3']);
  });

  test('el valor elegido se encuentra aunque el id llegue como texto; si no existe, «Todas»', () => {
    const op = opcionesBarra(cats, { mostrarFavoritas: true });
    expect(indiceElegido(op, 3)).toBe(3);
    expect(indiceElegido(op, '3')).toBe(3);
    expect(indiceElegido(op, 'favoritas')).toBe(1);
    expect(indiceElegido(op, null)).toBe(0);
    expect(indiceElegido(op, 999)).toBe(0);
    expect(claveValor(undefined)).toBe('todas');
  });

  test('flechas con vuelta, Inicio y Fin; otras teclas no mueven', () => {
    expect(moverIndice(0, 'ArrowRight', 4)).toBe(1);
    expect(moverIndice(3, 'ArrowRight', 4)).toBe(0);
    expect(moverIndice(0, 'ArrowLeft', 4)).toBe(3);
    expect(moverIndice(2, 'Home', 4)).toBe(0);
    expect(moverIndice(0, 'End', 4)).toBe(3);
    expect(moverIndice(0, 'Enter', 4)).toBeNull();
    expect(moverIndice(0, 'ArrowRight', 0)).toBeNull();
  });

  test('chevrones según lo recortado', () => {
    expect(chevronesVisibles(0, 500, 500)).toEqual({ anterior: false, siguiente: false });
    expect(chevronesVisibles(0, 500, 900)).toEqual({ anterior: false, siguiente: true });
    expect(chevronesVisibles(200, 500, 900)).toEqual({ anterior: true, siguiente: true });
    expect(chevronesVisibles(400, 500, 900)).toEqual({ anterior: true, siguiente: false });
    expect(pasoDesplazamiento(500)).toBe(400);
    expect(pasoDesplazamiento(100)).toBe(120);
  });
});
