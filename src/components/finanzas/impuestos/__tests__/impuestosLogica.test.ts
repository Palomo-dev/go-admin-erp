/// <reference types="jest" />
/**
 * Finanzas › Impuestos (Figma 1012:86383): tipo y código DIAN de cada impuesto,
 * búsqueda y filtros, estados del listado, cobertura de la tarifa por defecto,
 * plantillas pendientes y las claves de texto en los 4 idiomas.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  FILTROS_VACIOS,
  cobertura,
  codigoDian,
  coincideBusqueda,
  conteoFiltros,
  esExento,
  estadoListado,
  filtrarImpuestos,
  leerUsoProductos,
  nombreCopia,
  plantillasPendientes,
  tipoImpuesto,
  type FilaImpuesto,
} from '../impuestosLogica';

const fila = (p: Partial<FilaImpuesto> & { name: string }): FilaImpuesto => ({
  id: p.name,
  rate: 19,
  description: null,
  is_active: true,
  is_default: false,
  template_id: null,
  ...p,
});

describe('tipo y código DIAN', () => {
  it('el código de la plantilla manda sobre el nombre', () => {
    expect(tipoImpuesto('INC_8', 'Impuesto general')).toBe('inc');
    expect(tipoImpuesto('IVA_19', 'Cualquier nombre')).toBe('iva');
    expect(tipoImpuesto('ICA_0.966', null)).toBe('ica');
  });
  it('sin plantilla se deduce del nombre, sin tildes ni mayúsculas', () => {
    expect(tipoImpuesto(null, 'IVA 19 %')).toBe('iva');
    expect(tipoImpuesto(null, 'Impoconsumo 8%')).toBe('inc');
    expect(tipoImpuesto('', 'ICA Bogotá')).toBe('ica');
    expect(tipoImpuesto(null, 'Impuesto personalizado')).toBe('otro');
  });
  it('el código DIAN es el de la factura electrónica (mapTaxCode)', () => {
    expect(codigoDian('IVA_19', 'IVA 19 %')).toBe('01');
    expect(codigoDian('IVA_0', 'IVA 0 %')).toBe('01');
    expect(codigoDian('INC_8', 'Impoconsumo')).toBe('04');
    expect(codigoDian(null, 'Impoconsumo 8 %')).toBe('04');
    // ICA y los desconocidos no van como impuesto de la línea: sin código, nunca «IVA».
    expect(codigoDian('ICA_0.966', 'ICA')).toBeNull();
    expect(codigoDian(null, 'Impuesto personalizado')).toBeNull();
    expect(codigoDian('XYZ_1', 'IVA raro')).toBeNull();
  });
  it('exento: IVA de tarifa 0', () => {
    expect(esExento({ rate: 0 }, 'iva')).toBe(true);
    expect(esExento({ rate: 19 }, 'iva')).toBe(false);
    expect(esExento({ rate: 0 }, 'inc')).toBe(false);
  });
});

describe('búsqueda y filtros', () => {
  const filas = [
    fila({ name: 'IVA 19 %', description: 'IVA general' }),
    fila({ name: 'IVA 0 %', rate: 0, description: 'Exentos y excluidos' }),
    fila({ name: 'Impoconsumo 8 %', rate: 8, is_active: false }),
    fila({ name: 'ICA', rate: 0.966 }),
  ];
  const tipoDe = (f: FilaImpuesto) => tipoImpuesto(null, f.name);

  it('busca por nombre, descripción o tarifa', () => {
    expect(coincideBusqueda(filas[0], 'general')).toBe(true);
    expect(coincideBusqueda(filas[1], 'excluídos')).toBe(true);
    expect(coincideBusqueda(filas[3], '0,966')).toBe(true);
    expect(coincideBusqueda(filas[2], '8 %')).toBe(true);
    expect(coincideBusqueda(filas[0], 'renta')).toBe(false);
  });
  it('filtra por estado y por tipo', () => {
    expect(filtrarImpuestos(filas, '', { estado: 'inactivos', tipo: 'todos' }, tipoDe).map((f) => f.name)).toEqual(['Impoconsumo 8 %']);
    expect(filtrarImpuestos(filas, '', { estado: 'activos', tipo: 'iva' }, tipoDe)).toHaveLength(2);
    expect(filtrarImpuestos(filas, 'ica', FILTROS_VACIOS, tipoDe).map((f) => f.name)).toEqual(['ICA']);
    expect(conteoFiltros(FILTROS_VACIOS)).toBe(0);
    expect(conteoFiltros({ estado: 'activos', tipo: 'inc' })).toBe(2);
  });
});

describe('estados del listado (830:526193–830:529055)', () => {
  const base = { cargando: false, sinPermiso: false, error: false, total: 3, visibles: 3 };
  it('cada estado', () => {
    expect(estadoListado({ ...base, cargando: true, total: 0, visibles: 0 })).toBe('cargando');
    expect(estadoListado({ ...base, sinPermiso: true })).toBe('sinPermiso');
    expect(estadoListado({ ...base, error: true, total: 0, visibles: 0 })).toBe('error');
    expect(estadoListado({ ...base, total: 0, visibles: 0 })).toBe('vacio');
    expect(estadoListado({ ...base, visibles: 0 })).toBe('sinResultados');
    expect(estadoListado(base)).toBe('listo');
  });
  it('recargar con datos no vuelve al esqueleto, y un error con datos deja la lista', () => {
    expect(estadoListado({ ...base, cargando: true })).toBe('listo');
    expect(estadoListado({ ...base, error: true })).toBe('listo');
  });
});

describe('uso de productos y cobertura', () => {
  it('lee la respuesta de fn_impuestos_uso_productos', () => {
    expect(leerUsoProductos({ total: '62344', con_impuesto: 3548, exentos: 0, por_impuesto: { a: 3545, b: '2' } })).toEqual({
      total: 62344,
      conImpuesto: 3548,
      exentos: 0,
      porImpuesto: { a: 3545, b: 2 },
    });
    expect(leerUsoProductos(null)).toBeNull();
  });
  it('porcentajes con un decimal que suman 100 (Figma: 5,7 · 0,0 · 94,3)', () => {
    const c = cobertura({ total: 62344, conImpuesto: 3548, exentos: 0, porImpuesto: {} });
    expect(c.sinConfigurar).toBe(58796);
    expect(c.pctConImpuesto).toBe(5.7);
    expect(c.pctExentos).toBe(0);
    expect(c.pctSinConfigurar).toBe(94.3);
  });
  it('sin productos, todo en cero', () => {
    expect(cobertura({ total: 0, conImpuesto: 0, exentos: 0, porImpuesto: {} })).toEqual({ sinConfigurar: 0, pctConImpuesto: 0, pctExentos: 0, pctSinConfigurar: 0 });
  });
});

describe('duplicar y plantillas', () => {
  it('la copia no pasa de 100 caracteres', () => {
    expect(nombreCopia('IVA 19 %', 'copia')).toBe('IVA 19 % (copia)');
    expect(nombreCopia('x'.repeat(120), 'copia')).toHaveLength(100);
  });
  it('cuenta solo las plantillas de impuesto que la organización no tiene', () => {
    const plantillas = [{ id: 1, kind: 'tax' }, { id: 2, kind: 'tax' }, { id: 3, kind: 'withholding' }, { id: 4 }];
    expect(plantillasPendientes(plantillas, [{ template_id: 1 }, { template_id: null }])).toBe(2);
    expect(plantillasPendientes(plantillas, [{ template_id: 1 }, { template_id: 2 }, { template_id: 4 }])).toBe(0);
  });
});

describe('textos en 4 idiomas', () => {
  const RAIZ = path.resolve(__dirname, '../../../../..');
  const leer = (l: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, 'messages', `${l}.json`), 'utf8')).finanzasImpuestos;
  const claves = (o: Record<string, unknown>, pre = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? claves(v as Record<string, unknown>, `${pre}${k}.`) : [`${pre}${k}`]));

  it('es, en, fr y pt tienen exactamente las mismas claves', () => {
    const es = claves(leer('es')).sort();
    for (const l of ['en', 'fr', 'pt']) expect(claves(leer(l)).sort()).toEqual(es);
  });

  it('cada clave literal de las pantallas existe', () => {
    const es = new Set(claves(leer('es')));
    const dir = path.join(RAIZ, 'src/components/finanzas/impuestos');
    // Prefijo del namespace de cada traductor: t/ti = raíz; tf = formulario; en
    // TarifaPorDefectoCard y DeleteTaxDialog, `t` es tarifa/eliminar.
    const prefijos: Record<string, Record<string, string>> = {
      'TaxesTable.tsx': { t: '' },
      'TaxesIndexPage.tsx': { ti: '' },
      'TaxForm.tsx': { tf: 'formulario.' },
      'TarifaPorDefectoCard.tsx': { t: 'tarifa.' },
      'DeleteTaxDialog.tsx': { t: 'eliminar.' },
      'useImpuestosOrganizacion.ts': { t: '' },
    };
    const faltan: string[] = [];
    for (const [f, mapa] of Object.entries(prefijos)) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const [fn, pre] of Object.entries(mapa)) {
        for (const m of src.matchAll(new RegExp(`\\b${fn}(?:\\.rich)?\\('([a-zA-Z0-9_.]+)'`, 'g'))) if (!es.has(pre + m[1])) faltan.push(`${f}: ${pre}${m[1]}`);
      }
    }
    expect(faltan).toEqual([]);
  });

  it('las claves dinámicas también existen', () => {
    const es = new Set(claves(leer('es')));
    const tipos = ['iva', 'inc', 'ibua', 'ica', 'otro'];
    const dinamicas = [
      ...tipos.map((x) => `tipos.${x}`),
      ...tipos.map((x) => `formulario.tipos.${x}`),
      ...['cuenta_no_existe', 'cuenta_de_titulo', 'cuenta_no_es_pasivo', 'otro'].map((x) => `formulario.cuentaErrores.${x}`),
      ...['nuevo', 'editar', 'duplicar', 'guardar', 'guardarCambios', 'creado', 'actualizado'].map((x) => `formulario.${x}`),
      'acciones.activar',
      'acciones.desactivar',
      'acciones.activarNombre',
      'acciones.desactivarNombre',
      'estado.activo',
      'estado.inactivo',
      'toast.activado',
      'toast.desactivado',
    ];
    expect(dinamicas.filter((k) => !es.has(k))).toEqual([]);
  });

  it('ningún archivo de la pantalla usa clases dark: ni colores crudos', () => {
    const dir = path.join(RAIZ, 'src/components/finanzas/impuestos');
    for (const f of ['TaxesTable.tsx', 'TaxForm.tsx', 'TarifaPorDefectoCard.tsx', 'TaxesIndexPage.tsx', 'DeleteTaxDialog.tsx']) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      expect({ f, dark: /\bdark:/.test(src), crudo: /\b(?:bg|text|border)-(?:gray|blue|red|green|amber)-\d/.test(src) }).toEqual({ f, dark: false, crudo: false });
    }
  });
});
