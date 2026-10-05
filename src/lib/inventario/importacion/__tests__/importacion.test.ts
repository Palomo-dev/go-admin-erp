/// <reference types="jest" />
/**
 * Importación de productos (archivo y web): lector, mapeo, validación por
 * fila, payload de la RPC `fn_importar_productos_lote`, conversión de la web y
 * reporte. Todo puro: sin red ni base.
 */
import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { join } from 'path';
import { autoMapear, CAMPOS, camposObligatoriosFaltantes, encontrarFilaCabecera, reasignarColumna } from '../campos';
import { aplicarSaldos, decodificarCsv, detectarFormato, detectarTamano, detectarVariantesPorSku, extensionAdmitida, leerFilas, leerMatriz, leerSaldos, leerSegunFormato, numeroSistema, parsearFormatoSistema, parsearFormatoSpace } from '../lector';
import { estacionDesdeTexto, estadoDesdeTexto, parsearModificadores, parsearVariante, separarLista, separarUrls, unidadDesdeTexto } from '../normalizacion';
import { dividirEnLotes, filaARpc, filaParaRpc, filasAImportar, TAMANO_LOTE } from '../payload';
import { aCsv, CABECERAS_PLANTILLA, escaparCsv, EJEMPLOS_PLANTILLA, plantillaCsv, reporteCsv } from '../reporte';
import { normalizarCabecera, normalizarNombre, parseBooleano, parseNumero, slugificar } from '../texto';
import { OPCIONES_POR_DEFECTO, type FilaImport, type OpcionesImportacion } from '../tipos';
import { impuestoConocido, resumirValidacion, validarFilas, type ContextoValidacion } from '../validacion';
import { combinacionesVariantes, combinarDetalle, incompleto, nombresCorresponden, normalizarPrecios, productosWebAFilas } from '../web';
import { costoMaximoDetalles, CREDITOS_DETALLE_WEB, MAX_DETALLES_WEB } from '../costosWeb';
import { esExportAlegra } from '../alegra';

const ctx = (parcial: Partial<ContextoValidacion> = {}, opciones: Partial<OpcionesImportacion> = {}): ContextoValidacion => ({
  existentes: new Map(),
  opciones: { ...OPCIONES_POR_DEFECTO, ...opciones },
  ...parcial,
});

describe('texto', () => {
  it('normaliza cabeceras y nombres sin tildes ni signos', () => {
    expect(normalizarCabecera('Código de Barras')).toBe('codigodebarras');
    expect(normalizarNombre('  Café   Premium! ')).toBe('cafe premium');
    expect(slugificar('Ropa de Niños')).toBe('ropa-de-ninos');
  });
  it('lee números en formato colombiano e internacional', () => {
    expect(parseNumero('$ 12.000')).toBe(12000);
    expect(parseNumero('1.234,50')).toBe(1234.5);
    expect(parseNumero('1,234.50')).toBe(1234.5);
    expect(parseNumero('1.299.900')).toBe(1299900);
    expect(parseNumero('12,000')).toBe(12000);
    expect(parseNumero('12.5')).toBe(12.5);
    expect(parseNumero(350)).toBe(350);
    expect(parseNumero('abc')).toBeNull();
  });
  it('lee booleanos en los cuatro idiomas', () => {
    expect(parseBooleano('Sí')).toBe(true);
    expect(parseBooleano('verdadero')).toBe(true);
    expect(parseBooleano('0')).toBe(false);
    expect(parseBooleano('no')).toBe(false);
    expect(parseBooleano('')).toBeUndefined();
  });
});

describe('mapeo de columnas', () => {
  it('reconoce la plantilla completa (26 columnas)', () => {
    const mapa = autoMapear(CABECERAS_PLANTILLA);
    expect(mapa.filter(Boolean)).toHaveLength(26);
    expect(new Set(mapa).size).toBe(26);
  });
  it('reconoce cabeceras de Siigo e inglés', () => {
    expect(autoMapear(['Tipo', 'Código', 'Nombre', 'Unidad', 'Precios', 'Impuestos', 'Stock', 'Estado'])).toEqual(['type', 'sku', 'name', 'unit', 'price', 'tax', 'stock', 'status']);
    expect(autoMapear(['Product Code', 'Name', 'Price', 'Cost', 'Quantity'])).toEqual(['sku', 'name', 'price', 'cost', 'stock']);
  });
  it.each(['es', 'en', 'fr', 'pt'])('reconoce las cabeceras traducidas de la exportación (%s)', (idioma) => {
    // Exportación y plantilla salen con `productosImportar.cabeceras` del idioma
    // de la interfaz: el archivo tiene que volver a importarse igual.
    const ruta = join(process.cwd(), 'messages', `${idioma}.json`);
    const cabeceras = (JSON.parse(readFileSync(ruta, 'utf-8')) as { productosImportar: { cabeceras: Record<string, string> } })
      .productosImportar.cabeceras;
    expect(autoMapear(CAMPOS.map((c) => cabeceras[c.campo]))).toEqual(CAMPOS.map((c) => c.campo));
    if (idioma === 'es') expect(CAMPOS.map((c) => cabeceras[c.campo])).toEqual(CABECERAS_PLANTILLA);
  });
  it('un campo en una sola columna: la segunda repetida queda sin importar', () => {
    expect(autoMapear(['Nombre', 'Producto'])).toEqual(['name', null]);
  });
  it('encuentra la cabecera bajo títulos (Siigo la pone en la fila 5)', () => {
    const m = [['Empresa'], [], ['Reporte'], [], ['Código', 'Nombre', 'Precio'], ['A1', 'Uno', 10]];
    expect(encontrarFilaCabecera(m)).toBe(4);
  });
  it('reasignar quita el campo de la columna que lo tenía', () => {
    expect(reasignarColumna(['sku', 'name', null], 2, 'name')).toEqual(['sku', null, 'name']);
    expect(camposObligatoriosFaltantes(['sku', null])).toEqual(['name']);
  });
});

describe('lector', () => {
  it('admite solo CSV, XLS y XLSX', () => {
    expect(extensionAdmitida('a.CSV')).toBe(true);
    expect(extensionAdmitida('a.xlsx')).toBe(true);
    expect(extensionAdmitida('a.pdf')).toBe(false);
  });
  it('decodifica CSV en UTF-8 y, si no, en Windows-1252', () => {
    const utf8 = new TextEncoder().encode('\uFEFFCategoría');
    expect(decodificarCsv(utf8.buffer as ArrayBuffer)).toBe('Categoría');
    const latin = new Uint8Array([0x43, 0x61, 0x74, 0x65, 0x67, 0x6f, 0x72, 0xed, 0x61]); // «Categoría» en 1252
    expect(decodificarCsv(latin.buffer)).toBe('Categoría');
  });
  it('lee un CSV con punto y coma', () => {
    const csv = new TextEncoder().encode('SKU;Nombre;Precio\nA-1;Uno;12.000\n');
    const m = leerMatriz(csv.buffer as ArrayBuffer, 'lista.csv');
    expect(m[0]).toEqual(['SKU', 'Nombre', 'Precio']);
    expect(String(m[1][0])).toBe('A-1');
  });
  it('lee un XLSX', () => {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['SKU', 'Nombre', 'Costo'], ['X', 'Equis', 5]]), 'Hoja');
    const buf = XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    expect(leerMatriz(buf, 'x.xlsx')).toEqual([['SKU', 'Nombre', 'Costo'], ['X', 'Equis', 5]]);
  });
  it('aplica el mapeo con números y booleanos y salta filas vacías', () => {
    const m = [['SKU', 'Nombre', 'Precio', 'Rastrear Inventario'], ['A', 'Uno', '$ 1.500', 'si'], [null, '', null, null], ['B', 'Dos', 20, 'false']];
    const filas = leerFilas(m, 0, autoMapear(m[0]));
    expect(filas).toEqual([
      { fila: 2, sku: 'A', name: 'Uno', price: 1500, trackStock: true },
      { fila: 4, sku: 'B', name: 'Dos', price: 20, trackStock: false },
    ]);
  });
  it('vincula variantes por prefijo de SKU y marca al padre', () => {
    const filas: FilaImport[] = [{ fila: 2, sku: 'PROD-134-KMR', name: 'P' }, { fila: 3, sku: 'PROD-134-KMR-V1', name: 'V1' }, { fila: 4, sku: 'OTRO', name: 'O' }];
    expect(detectarVariantesPorSku(filas)).toBe(1);
    expect(filas[1].parentSku).toBe('PROD-134-KMR');
    expect(filas[0].isParent).toBe(true);
    expect(filas[2].isParent).toBeUndefined();
  });
  it('formato Space: SKU generados, tamaños como variantes y promo en notas', () => {
    const m = [
      ['Producto', 'Categoría', 'P. Venta', 'Descuento', 'Promoción 2x'],
      ['PEQUEÑO GRANI CON LICOR', 'Granizados', 8000, null, null],
      ['GRANDE GRANI CON LICOR', 'Granizados', 12000, 10000, 20000],
      ['LIMONADA', 'Bebidas', 5000, null, null],
    ];
    expect(detectarFormato(m).formato).toBe('space');
    const filas = parsearFormatoSpace(m, 0);
    const padre = filas.find((f) => f.isParent);
    expect(padre?.name).toBe('GRANI CON LICOR');
    expect(padre?.price).toBe(8000);
    const hijas = filas.filter((f) => f.parentSku === padre?.sku);
    expect(hijas).toHaveLength(2);
    expect(JSON.parse(hijas[1].variantData!)).toEqual({ Tamaño: 'Grande' });
    expect(hijas[1].notes).toContain('2 por 20000');
    expect(filas.every((f) => f.sku?.startsWith('SP-'))).toBe(true);
    expect(detectarTamano('MEDIA DE AGUARDIENTE')).toEqual({ tamano: 'Media', base: 'AGUARDIENTE' });
  });
  it('formato Sistema: secciones como categoría y costo/precio intercambiados', () => {
    const m = [['SUPLEMENTOS', 'VALOR COMPRA', 'VALOR VENTA'], ['Proteína', '1,191', '900'], ['VITAMINAS'], ['Vitamina C', 10, 20]];
    expect(detectarFormato(m).formato).toBe('sistema');
    const filas = parsearFormatoSistema(m, 0);
    expect(filas[0]).toMatchObject({ category: 'SUPLEMENTOS', cost: 900, price: 1191 });
    expect(filas[0].avisosLectura?.map((a) => a.codigo)).toContain('costoPrecioIntercambiados');
    expect(filas[1]).toMatchObject({ category: 'VITAMINAS', cost: 10, price: 20 });
    expect(numeroSistema('143.5')).toBe(143.5);
  });
  it('archivo de saldos de Siigo: manda sobre el stock y trae costo', () => {
    const saldos = leerSaldos([['Código producto', 'Nombre producto', 'Total', 'Valor unitario'], ['A', 'Uno', 7, 1200]]);
    const filas: FilaImport[] = [{ fila: 2, sku: 'A', name: 'Uno', stock: 1 }];
    expect(aplicarSaldos(filas, saldos)).toBe(1);
    expect(filas[0]).toMatchObject({ stock: 7, cost: 1200 });
    expect(leerSaldos([['otra cosa']])).toBeNull();
  });
  it('leerSegunFormato usa el mapeo automático en el genérico', () => {
    const r = leerSegunFormato([['SKU', 'Nombre'], ['A', 'Uno']]);
    expect(r.formato).toBe('generico');
    expect(r.filas).toEqual([{ fila: 2, sku: 'A', name: 'Uno' }]);
  });
});

describe('export de ítems de Alegra', () => {
  // Cabecera real del export «Items» de Alegra (datos sintéticos).
  const CABECERA = ['Tipo', 'Ítem inventariable', 'Ítem con variantes', 'Venta en negativo', 'Nombre', 'Código del producto o servicio', 'Referencia', 'Unidad de medida', 'Categoría', 'Descripción', 'Costo inicial', 'Precio base', 'Impuesto', 'Impuesto', 'Impuesto', 'Precio total', 'Precio: General', 'Código cuenta contable', 'Cuenta contable'];
  const m = [
    CABECERA,
    ['Producto', 'Si', 'No', 'No', 'Gaseosa 400 ml x12', '', '', 'Paquete', '', '', '30000,000000', '33333,000000', '8', '', '', '36000', '33333,000000', '', 'Ventas'],
    ['Producto', 'No', 'No', 'Si', 'Combo de la casa', '', '', 'Unidad', '', '', '0,000000', '15000,000000', '8', '', '', '16200', '15000,000000', '', 'Ventas'],
    // Una fila de datos con «compra» y «Ventas» no debe pasar por cabecera del formato «Sistema».
    ['Servicio', 'No', 'No', 'No', 'Refrigerios: Orden de compra 123', '', 'REF', 'Servicio', '', '', '0,000000', '400000,000000', '', '', '', '400000', '400000,000000', '', 'Ventas'],
  ];

  test('se lee como genérico con la cabecera en la primera fila', () => {
    expect(detectarFormato(m)).toEqual({ formato: 'generico', filaCabecera: -1 });
    expect(encontrarFilaCabecera(m)).toBe(0);
  });

  test('reconoce nombre, precio base, costo inicial, inventariable e impuesto', () => {
    const mapeo = autoMapear(CABECERA);
    expect(camposObligatoriosFaltantes(mapeo)).toEqual([]);
    expect(mapeo[CABECERA.indexOf('Precio base')]).toBe('price');
    expect(mapeo[CABECERA.indexOf('Precio total')]).toBeNull();
    expect(mapeo[CABECERA.indexOf('Costo inicial')]).toBe('cost');
    expect(mapeo[CABECERA.indexOf('Ítem inventariable')]).toBe('trackStock');
    expect(mapeo[CABECERA.indexOf('Código del producto o servicio')]).toBe('sku');
    expect(mapeo.filter((c) => c === 'tax')).toHaveLength(1);
    const filas = leerFilas(m, 0, mapeo);
    expect(filas[0]).toMatchObject({ name: 'Gaseosa 400 ml x12', price: 33333, cost: 30000, trackStock: true, tax: '8', unit: 'Paquete' });
    expect(filas[2]).toMatchObject({ type: 'Servicio', reference: 'REF' });
  });
});

describe('normalización a valores de la base', () => {
  it('unidades (FK a units.code)', () => {
    expect(unidadDesdeTexto('Kilogramo').codigo).toBe('KG');
    expect(unidadDesdeTexto('UND').codigo).toBe('UN');
    expect(unidadDesdeTexto('m2').codigo).toBe('M2');
    expect(unidadDesdeTexto('bulto')).toEqual({ codigo: 'UN', reconocida: false });
  });
  it('estación: «kitchen» de la plantilla vieja es hot_kitchen (CHECK de la base)', () => {
    expect(estacionDesdeTexto('kitchen').estacion).toBe('hot_kitchen');
    expect(estacionDesdeTexto('none').estacion).toBeNull();
    expect(estacionDesdeTexto('Barra').estacion).toBe('bar');
    expect(estacionDesdeTexto('horno').desconocida).toBe(true);
  });
  it('estado', () => {
    expect(estadoDesdeTexto('Inactivo').estado).toBe('inactive');
    expect(estadoDesdeTexto('').estado).toBe('active');
    expect(estadoDesdeTexto('borrado').desconocido).toBe(true);
  });
  it('variantes en JSON o pares clave:valor', () => {
    expect(parsearVariante('{"color":"azul","talla":"M"}')).toEqual({ color: 'azul', talla: 'M' });
    expect(parsearVariante('color:rojo,talla:L')).toEqual({ color: 'rojo', talla: 'L' });
    expect(parsearVariante('')).toEqual({});
    expect(parsearVariante('{roto')).toBeNull();
    expect(parsearVariante('[1,2]')).toBeNull();
  });
  it('modificadores con el formato de la plantilla', () => {
    const g = parsearModificadores('Tamaños|single|1|1|true|Pequeño=0,Mediano=5000; Leche|multiple|0|2|false|Entera=0,Almendras=1000');
    expect(g).toHaveLength(2);
    expect(g[0]).toEqual({ nombre: 'Tamaños', modo: 'single', min: 1, max: 1, requerido: true, opciones: [{ nombre: 'Pequeño', precio: 0 }, { nombre: 'Mediano', precio: 5000 }] });
    expect(g[1].max).toBe(2);
    expect(parsearModificadores('mal formado')).toEqual([]);
  });
  it('listas y URLs', () => {
    expect(separarLista('nuevo; oferta;Nuevo;;')).toEqual(['nuevo', 'oferta']);
    expect(separarUrls('https://a.com/1.jpg;https://a.com/2.jpg ftp://x nada')).toEqual({ validas: ['https://a.com/1.jpg', 'https://a.com/2.jpg'], invalidas: ['ftp://x', 'nada'] });
  });
});

describe('validación por fila', () => {
  const base: FilaImport[] = [
    { fila: 2, sku: 'A', name: 'Uno', price: 100, cost: 50, stock: 3 },
    { fila: 3, sku: 'A', name: 'Repetido' },
    { fila: 4, name: 'Sin SKU', price: 10 },
    { fila: 5, sku: 'C', name: 'Stock sin costo', stock: 2 },
    { fila: 6, sku: 'D', name: 'Existe', price: 20, stock: 5 },
    { fila: 7, sku: 'E', name: 'Hija', parentSku: 'NO-HAY' },
    { fila: 8, sku: 'F', name: '', price: -1 },
  ];
  it('marca errores, avisos y la acción de cada fila', () => {
    const v = validarFilas(base, ctx({ existentes: new Map([['D', 99]]), categorias: new Set(), impuestos: new Set() }));
    const por = (f: number) => v.find((x) => x.datos.fila === f)!;
    expect(por(2)).toMatchObject({ estado: 'listo', accion: 'crear' });
    expect(por(3).errores[0]).toEqual({ codigo: 'skuDuplicadoArchivo', params: { fila: 2 } });
    expect(por(4).datos.sku).toMatch(/^IMP-SIN-SKU/);
    expect(por(4).estado).toBe('listo'); // SKU generado es informativo
    expect(por(5).errores.map((e) => e.codigo)).toContain('stockSinCosto');
    expect(por(6)).toMatchObject({ accion: 'actualizar', productoId: 99 });
    expect(por(6).avisos.map((a) => a.codigo)).toContain('stockIgnoradoExistente');
    expect(por(7).errores.map((e) => e.codigo)).toContain('padreNoEncontrado');
    expect(por(8).errores.map((e) => e.codigo)).toEqual(expect.arrayContaining(['sinNombre', 'precioInvalido']));
  });
  it('sin generar SKU, la fila sin SKU es error', () => {
    const v = validarFilas([{ fila: 2, name: 'X' }], ctx({}, { generarSku: false }));
    expect(v[0].errores.map((e) => e.codigo)).toEqual(['sinSku']);
  });
  it('modos: solo crear / solo actualizar / duplicar', () => {
    const filas: FilaImport[] = [{ fila: 2, sku: 'D', name: 'Existe' }, { fila: 3, sku: 'N', name: 'Nuevo' }];
    const ex = new Map([['D', 1]]);
    expect(validarFilas(filas, ctx({ existentes: ex }, { modo: 'solo_crear' })).map((f) => f.accion)).toEqual(['omitir', 'crear']);
    expect(validarFilas(filas, ctx({ existentes: ex }, { modo: 'solo_actualizar' })).map((f) => f.accion)).toEqual(['actualizar', 'omitir']);
    const dup = validarFilas(filas, ctx({ existentes: ex }, { modo: 'duplicar' }));
    expect(dup[0]).toMatchObject({ accion: 'crear' });
    expect(dup[0].datos.sku).toBe('D-2');
  });
  it('sumar stock a un existente no exige costo en la fila (lo busca la RPC)', () => {
    const v = validarFilas([{ fila: 2, sku: 'D', name: 'X', stock: 4 }], ctx({ existentes: new Map([['D', 1]]) }, { stockExistentes: 'sumar' }));
    expect(v[0].errores).toEqual([]);
  });
  it('avisos de catálogo: categoría nueva, impuesto inexistente, unidad', () => {
    const v = validarFilas([{ fila: 2, sku: 'A', name: 'X', category: 'Nueva', tax: 'IVA 8%', unit: 'bulto' }], ctx({ categorias: new Set(['ropa']), impuestos: new Set(['iva 19', 'tasa:19']) }));
    expect(v[0].avisos.map((a) => a.codigo)).toEqual(expect.arrayContaining(['categoriaNueva', 'impuestoNoEncontrado', 'unidadDesconocida']));
    expect(impuestoConocido('19', new Set(['tasa:19']))).toBe(true);
    expect(impuestoConocido('IVA 19%', new Set(['iva 19']))).toBe(true);
  });
  it('web: coincide por nombre con un producto existente', () => {
    const v = validarFilas([{ fila: 1, name: 'Camiseta Polo' }], ctx({ existentes: new Map([['CP-1', 7]]), existentesPorNombre: new Map([['camiseta polo', { id: 7, sku: 'CP-1' }]]) }));
    expect(v[0]).toMatchObject({ accion: 'actualizar', productoId: 7 });
    expect(v[0].datos.sku).toBe('CP-1');
  });
  it('resumen cuenta lo que se importará sin errores ni excluidas', () => {
    const v = validarFilas(base, ctx({ existentes: new Map([['D', 99]]) }));
    const r = resumirValidacion(v, new Set(['2']));
    expect(r.errores).toBe(4);
    expect(r.aImportar).toBe(2); // fila 4 (crear) y fila 6 (actualizar); la 2 está excluida
  });
});

describe('payload de la RPC', () => {
  const validadas = validarFilas(
    [
      { fila: 2, sku: 'P', name: 'Padre', isParent: true, price: 100, comparePrice: 150, category: 'Ropa', supplier: 'A;B', tags: 'x;y', imageUrls: 'https://a.com/1.jpg', station: 'kitchen', modifiers: 'G|single|0|1|false|a=1', type: 'Producto', status: 'activo', unit: 'Unidad' },
      { fila: 3, sku: 'P-1', name: 'Hija', parentSku: 'P', variantData: 'color:azul', price: 90, comparePrice: 80 },
      { fila: 4, sku: 'S', name: 'Simple' },
      { fila: 5, sku: 'E', name: '' },
    ],
    ctx(),
  );
  it('solo lo presente viaja (lo ausente no se pisa al actualizar)', () => {
    const simple = filaARpc(validadas[2], { importarImagenes: true });
    expect(simple).toMatchObject({ sku: 'S', nombre: 'Simple', proveedores: [], etiquetas: [], modificadores: [], es_padre: false });
    const json = JSON.parse(JSON.stringify(simple));
    for (const k of ['tipo', 'estado', 'estacion', 'unidad', 'rastrear_stock', 'precio_comparacion']) expect(json).not.toHaveProperty(k);
  });
  it('normaliza todo lo que la base restringe', () => {
    const padre = filaARpc(validadas[0], { importarImagenes: true });
    expect(padre).toMatchObject({ tipo: 'product', unidad: 'UN', estacion: 'hot_kitchen', estado: 'active', proveedores: ['A', 'B'], etiquetas: ['x', 'y'], precio: 100, precio_comparacion: 150, es_padre: true, imagenes: ['https://a.com/1.jpg'] });
    expect(padre.modificadores[0].opciones).toEqual([{ nombre: 'a', precio: 1 }]);
    const hija = filaARpc(validadas[1], { importarImagenes: false });
    expect(hija).toMatchObject({ sku_padre: 'P', datos_variante: { color: 'azul' }, imagenes: [] });
    expect(hija.precio_comparacion).toBeUndefined(); // 80 < 90
  });
  it('ordena padres → simples → variantes y quita errores y excluidas', () => {
    const filas = filasAImportar(validadas, new Set(['4']), { importarImagenes: true });
    expect(filas.map((f) => f.sku)).toEqual(['P', 'P-1']);
    const todas = filasAImportar(validadas, new Set(), { importarImagenes: true });
    expect(todas.map((f) => f.sku)).toEqual(['P', 'S', 'P-1']);
  });
  it('lotes de 50 y sin URLs hacia la RPC', () => {
    expect(TAMANO_LOTE).toBe(50);
    expect(dividirEnLotes(Array.from({ length: 120 }, (_, i) => i)).map((l) => l.length)).toEqual([50, 50, 20]);
    const rpc = filaParaRpc(filaARpc(validadas[0], { importarImagenes: true }));
    expect(rpc).not.toHaveProperty('imagenes');
  });
});

describe('web → filas', () => {
  it('precios: la comparación siempre es la mayor', () => {
    expect(normalizarPrecios({ price: 200, compare_price: 100 })).toEqual({ price: 100, compare_price: 200 });
    expect(normalizarPrecios({ price: 100, compare_price: 100 })).toEqual({ price: 100, compare_price: undefined });
  });
  it('variantes cartesianas como hijas con el precio del padre e imágenes heredadas', () => {
    const filas = productosWebAFilas([{ name: 'Camiseta', price: 50000, brand: 'Nike', tags: ['a', 'b'], images: ['https://x/1.jpg'], variants: [{ name: 'Color', values: ['Rojo', 'Azul'] }, { name: 'Talla', values: ['S', 'M'] }] }]);
    expect(filas).toHaveLength(5);
    const padre = filas[0];
    expect(padre).toMatchObject({ isParent: true, supplier: 'Nike', brand: 'Nike', tags: 'a;b', skuGenerado: true });
    expect(padre.sku).toMatch(/^WEB-CAMISETA/);
    expect(filas[1]).toMatchObject({ parentSku: padre.sku, sku: `${padre.sku}-V1`, price: 50000, imagenesDelPadre: true, name: 'Camiseta - Rojo / S' });
    expect(combinacionesVariantes([{ name: 'X', values: [] }])).toEqual([]);
  });
  it('el SKU de la tienda se conserva como SKU y referencia', () => {
    const [f] = productosWebAFilas([{ name: 'Uno', sku: 'T-1' }]);
    expect(f).toMatchObject({ sku: 'T-1', reference: 'T-1', skuGenerado: false });
  });
  it('el detalle solo se combina si corresponde al mismo producto', () => {
    const listado = { name: 'Televisor Samsung 55 pulgadas', price: 100 };
    expect(combinarDetalle(listado, { name: 'Nevera LG', price: 5 })).toBe(listado);
    expect(combinarDetalle(listado, { name: 'Televisor Samsung 55', price: 90, compare_price: 120, images: ['a'] })).toMatchObject({ price: 90, compare_price: 120, images: ['a'] });
    expect(nombresCorresponden('a b', 'c')).toBe(true);
    expect(incompleto({ name: 'x', price: 1 })).toBe(true);
  });
  it('costo máximo de completar fichas', () => {
    expect(costoMaximoDetalles(3)).toBe(3 * CREDITOS_DETALLE_WEB);
    expect(costoMaximoDetalles(1000)).toBe(MAX_DETALLES_WEB * CREDITOS_DETALLE_WEB);
  });
});

describe('reporte y plantilla', () => {
  it('escapa comas, comillas, saltos y punto y coma', () => {
    expect(escaparCsv('a,b')).toBe('"a,b"');
    expect(escaparCsv('di "hola"')).toBe('"di ""hola"""');
    expect(escaparCsv(null)).toBe('');
    expect(aCsv([[1, 'x;y']])).toBe('1,"x;y"');
  });
  it('la plantilla trae BOM, 26 columnas y la estación válida', () => {
    const csv = plantillaCsv();
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(EJEMPLOS_PLANTILLA.every((f) => f.length === CABECERAS_PLANTILLA.length)).toBe(true);
    expect(csv).not.toContain(',kitchen,');
    // la plantilla se relee con el mismo importador
    const m = leerMatriz(new TextEncoder().encode(csv).buffer as ArrayBuffer, 'plantilla.csv');
    const filas = leerFilas(m, 0, autoMapear(m[0]));
    expect(filas).toHaveLength(5);
    expect(filas[1]).toMatchObject({ sku: 'PROD-001-AZUL-M', parentSku: 'PROD-001', price: 120000, stock: 50 });
  });
  it('reporte con cabeceras traducidas', () => {
    const r = reporteCsv([{ fila: 3, sku: 'A', nombre: 'Uno', resultado: 'Error', mensajes: ['m1', 'm2'] }], ['Fila', 'SKU', 'Nombre', 'Resultado', 'Mensajes']);
    expect(r.split('\n')[1]).toBe('3,A,Uno,Error,m1 | m2');
  });
});

describe('ajustes del export de Alegra', () => {
  const CAB = ['Tipo', 'Ítem inventariable', 'Ítem con variantes', 'Venta en negativo', 'Nombre', 'Código del producto o servicio', 'Referencia', 'Unidad de medida', 'Categoría', 'Descripción', 'Costo inicial', 'Precio base', 'Impuesto', 'Precio total'];
  const m = [
    CAB,
    ['Producto', 'Si', 'No', 'No', 'Coca Cola 400 ml X12', '', '', 'Paquete', '', '', '36000', '33333', '8', '36000'],
    ['Producto', 'Si', 'No', 'No', 'Sandwich de pollo tipo cubano', '', '', 'Unidad', 'COMBOS', '', '21000', '21000', '8', '22680'],
    ['Combo', 'No', 'No', 'Si', 'Palitos de queso + jugo', '', '', 'Unidad', '', '', '0', '9259', '8', '10000'],
    ['Producto', 'Si', 'No', 'No', 'Servicio logistico', '', '', 'Servicio', '', '', '250000', '231481', '8', '250000'],
    ['Servicio', 'No', 'No', 'No', 'Datos iniciales DIAN', '', 'IMPORT-DTS-DIAN', '', '', '', '0', '1', '', '1'],
    ['Producto', 'Si', 'No', 'No', 'Barra de granola', '', '', 'Unidad', '', '', '1800', '2500', '8', '2700'],
  ];
  const leer = () => leerSegunFormato(m).filas as Array<FilaImport & { excluirPorDefecto?: boolean }>;
  const codigos = (f: FilaImport) => (f.avisosLectura ?? []).map((a) => a.codigo);

  test('reconoce el export', () => {
    expect(esExportAlegra(CAB)).toBe(true);
    expect(esExportAlegra(['Nombre', 'Precio'])).toBe(false);
  });

  test('un costo igual o mayor que el precio sin impuesto se descarta; uno real se conserva', () => {
    const [coca, , , , , granola] = leer();
    expect(coca.cost).toBeUndefined();
    expect(codigos(coca)).toContain('costoAlegraDescartado');
    expect(granola.cost).toBe(1800);
  });

  test('bebidas y snacks conservan inventario y reciben categoría sugerida', () => {
    const [coca, , , , , granola] = leer();
    expect(coca).toMatchObject({ category: 'Bebidas', trackStock: true, price: 33333 });
    expect(granola).toMatchObject({ category: 'Snacks', trackStock: true });
  });

  test('plato preparado: conserva su categoría de Alegra y sin inventario propio', () => {
    const plato = leer()[1];
    expect(plato).toMatchObject({ category: 'COMBOS', trackStock: false });
    expect(codigos(plato)).toContain('preparadoSinInventario');
  });

  test('combo: producto con etiqueta «Combo», sin inventario y aviso de componentes', () => {
    const combo = leer()[2];
    expect(combo).toMatchObject({ type: 'Producto', trackStock: false, tags: 'Combo' });
    expect(codigos(combo)).toContain('comboSinComponentes');
  });

  test('unidad «Servicio» lo vuelve servicio; la fila interna DIAN arranca excluida', () => {
    const [, , , servicio, dian] = leer();
    expect(servicio).toMatchObject({ type: 'Servicio', trackStock: false });
    expect(dian.excluirPorDefecto).toBe(true);
    expect(codigos(dian)).toContain('filaInternaAlegra');
  });
});
