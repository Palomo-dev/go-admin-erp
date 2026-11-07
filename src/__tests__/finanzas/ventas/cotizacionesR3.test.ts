/**
 * Cotizaciones · ronda 3 de Finanzas (Frente D, subfrente cotizaciones).
 *
 * 1. Caracterización: las reglas de la pantalla anterior (qué se edita, qué se
 *    convierte, qué se elimina y qué cambios de estado había) se conservan en
 *    `accionesCotizacion`. Lo único que cambia a propósito: una vencida ya no
 *    ofrece «convertir» (la base lo rechaza con `cotizacion_vencida`) sino
 *    «Duplicar con vigencia desde hoy», como el Figma.
 * 2. Listado en el servidor: filtros, orden, página y KPI de `construirListado`.
 * 3. Formulario: validación y cuerpo de `POST/PUT /api/cotizaciones`.
 * 4. Las pantallas nuevas no usan `dark:`, `gray-*`, hex ni el día UTC.
 */
import fs from 'fs';
import path from 'path';
import {
  DIAS_POR_VENCER,
  accionRapidaFila,
  accionesCotizacion,
  aFila,
  construirListado,
  diasEntre,
  estadoBadgeCotizacion,
  filtrarCotizaciones,
  impuestosPorTarifa,
  kpisCotizaciones,
  ordenCotizacionesRuta,
  ordenarCotizaciones,
  parametrosListadoSchema,
  tasaConversion,
  vigenciaDe,
  type FilaCotizacionListado,
} from '@/lib/finanzas/ventas/listadoCotizaciones';
import { atajoVigencia, datosCotizacion, validarCotizacion, vigenciaPorDias } from '@/lib/finanzas/ventas/formularioCotizacion';
import { guardarCotizacionSchema, type CotizacionResumen } from '@/lib/finanzas/ventas/contratoCotizaciones';
import type { LineaVenta } from '@/lib/finanzas/ventas/lineasFacturaVenta';

const HOY = '2026-09-28';
const TODO = { escribir: true, convertir: true };

function fila(p: Partial<FilaCotizacionListado> & { id: string }): FilaCotizacionListado {
  return {
    numero: `COT-${p.id}`,
    estado: 'sent',
    estado_guardado: 'sent',
    cliente_id: 'c1',
    cliente: 'Cliente Ejemplo',
    cliente_doc: 'NIT 900',
    cliente_correo: null,
    emision: '2026-09-15',
    valida_hasta: '2026-09-30',
    dias_vigencia: 2,
    moneda: 'COP',
    total: 100,
    vendedor_id: null,
    vendedor: null,
    oportunidad_id: null,
    oportunidad: null,
    factura_id: null,
    sucursal_id: 1,
    ...p,
  };
}

const todas = (c: { estado: string; estado_guardado: string; factura_id?: string | null }, p = TODO) => {
  const a = accionesCotizacion({ factura_id: null, ...c }, p);
  return new Set([a.primaria, ...a.secundarias, ...a.menu].filter(Boolean));
};

describe('caracterización: reglas de la pantalla anterior', () => {
  // DetalleCotizacion (antes): canEdit = stored_status draft|sent.
  test.each([
    ['draft', 'draft', true],
    ['sent', 'sent', true],
    ['expired', 'sent', true],
    ['accepted', 'accepted', false],
    ['converted', 'converted', false],
    ['rejected', 'rejected', false],
  ])('editar con estado vivo %s y guardado %s → %s', (estado, guardado, esperado) => {
    expect(todas({ estado, estado_guardado: guardado }).has('editar')).toBe(esperado);
  });

  // DetalleCotizacion (antes): canConvert = draft | sent | accepted (estado vivo).
  test.each([
    ['draft', true],
    ['sent', true],
    ['accepted', true],
    ['expired', false],
    ['converted', false],
    ['rejected', false],
  ])('convertir con estado %s → %s', (estado, esperado) => {
    expect(todas({ estado, estado_guardado: estado === 'expired' ? 'sent' : estado }).has('convertir')).toBe(esperado);
  });

  // CotizacionesTable (antes): eliminar solo borradores.
  test('eliminar solo en borrador', () => {
    for (const e of ['draft', 'sent', 'accepted', 'expired', 'converted', 'rejected']) {
      expect(todas({ estado: e, estado_guardado: e }).has('eliminar')).toBe(e === 'draft');
    }
  });

  // «Cambiar estado» (antes): borrador → enviada, aceptada o rechazada; enviada → aceptada o rechazada; vencida → rechazada.
  test('los cambios de estado de antes siguen disponibles', () => {
    const borrador = todas({ estado: 'draft', estado_guardado: 'draft' });
    expect([...['marcar_enviada', 'aceptar', 'rechazar']].every((a) => borrador.has(a as never))).toBe(true);
    const enviada = todas({ estado: 'sent', estado_guardado: 'sent' });
    expect(enviada.has('aceptar') && enviada.has('rechazar')).toBe(true);
    const vencida = todas({ estado: 'expired', estado_guardado: 'sent' });
    expect(vencida.has('rechazar')).toBe(true);
    expect(vencida.has('aceptar')).toBe(false);
  });

  test('imprimir y PDF en todos los estados; duplicar donde antes estaba (todos salvo rechazada, que lo tiene como primaria)', () => {
    for (const e of ['draft', 'sent', 'accepted', 'expired', 'converted', 'rejected']) {
      const a = todas({ estado: e, estado_guardado: e === 'expired' ? 'sent' : e, factura_id: e === 'converted' ? 'f1' : null });
      expect(a.has('imprimir') && a.has('pdf')).toBe(true);
      expect(a.has('duplicar') || a.has('renovar')).toBe(true);
    }
  });

  test('convertida: la primaria es ver la factura', () => {
    expect(accionesCotizacion({ estado: 'converted', estado_guardado: 'converted', factura_id: 'f1' }, TODO).primaria).toBe('ver_factura');
  });

  test('sin permiso de escritura solo queda consultar', () => {
    const a = accionesCotizacion({ estado: 'draft', estado_guardado: 'draft', factura_id: null }, { escribir: false, convertir: false });
    expect(a.primaria).toBeNull();
    expect(a.menu).toEqual(['pdf', 'imprimir']);
  });
});

describe('estado y vigencia', () => {
  test('la vencida se pinta «vencida» (el kit rotula expired «Expirada»)', () => {
    expect(estadoBadgeCotizacion('expired')).toBe('vencida');
    expect(estadoBadgeCotizacion('sent')).toBe('sent');
  });

  test('días planos sin zona', () => {
    expect(diasEntre('2026-09-28', '2026-09-30')).toBe(2);
    expect(diasEntre('2026-09-28', '2026-09-20')).toBe(-8);
    expect(diasEntre('2026-10-31', '2026-11-01')).toBe(1);
  });

  test('vigencia: vence pronto, hoy, venció o vigente', () => {
    expect(vigenciaDe({ estado: 'sent', dias_vigencia: 2 })).toEqual({ tipo: 'vence_pronto', dias: 2 });
    expect(vigenciaDe({ estado: 'draft', dias_vigencia: 0 })).toEqual({ tipo: 'vence_hoy', dias: 0 });
    expect(vigenciaDe({ estado: 'expired', dias_vigencia: -30 })).toEqual({ tipo: 'vencio', dias: 30 });
    expect(vigenciaDe({ estado: 'sent', dias_vigencia: DIAS_POR_VENCER + 1 }).tipo).toBe('vigente');
    expect(vigenciaDe({ estado: 'converted', dias_vigencia: -3 }).tipo).toBe('vigente');
    expect(vigenciaDe({ estado: 'sent', dias_vigencia: null }).tipo).toBe('sin');
  });

  test('acción rápida de la fila: convertir, enviar o duplicar (Figma)', () => {
    expect(accionRapidaFila({ estado: 'sent' }, TODO)).toBe('convertir');
    expect(accionRapidaFila({ estado: 'accepted' }, TODO)).toBe('convertir');
    expect(accionRapidaFila({ estado: 'draft' }, TODO)).toBe('enviar');
    expect(accionRapidaFila({ estado: 'expired' }, TODO)).toBe('renovar');
    expect(accionRapidaFila({ estado: 'converted' }, TODO)).toBeNull();
    expect(accionRapidaFila({ estado: 'sent' }, { escribir: true, convertir: false })).toBeNull();
  });
});

describe('listado en el servidor', () => {
  const filas = [
    fila({ id: '1', estado: 'sent', dias_vigencia: 2, total: 2488892, oportunidad_id: 'o1', emision: '2026-09-15' }),
    fila({ id: '2', estado: 'draft', estado_guardado: 'draft', dias_vigencia: 28, total: 650000, cliente: 'Laura Gómez', emision: '2026-09-26' }),
    fila({ id: '3', estado: 'accepted', estado_guardado: 'accepted', total: 1600000, emision: '2026-09-20' }),
    fila({ id: '4', estado: 'expired', estado_guardado: 'sent', dias_vigencia: -30, total: 2978000, emision: '2026-08-14' }),
    fila({ id: '5', estado: 'converted', estado_guardado: 'converted', total: 650000, emision: '2026-09-02', factura_id: 'f5' }),
    fila({ id: '6', estado: 'rejected', estado_guardado: 'rejected', total: 27000, emision: '2026-09-12' }),
    fila({ id: '7', estado: 'sent', dias_vigencia: 5, total: 100, moneda: 'USD', emision: '2026-09-10' }),
  ];

  test('KPI por moneda: abiertas, por vencer, vencidas y conversión del periodo', () => {
    const [cop] = kpisCotizaciones(filas, { desde: '2026-09-01', hasta: '2026-09-28' }).filter((k) => k.moneda === 'COP');
    expect(cop.abiertas).toBe(2);
    expect(cop.valor_abiertas).toBe(3138892);
    expect(cop.por_vencer).toBe(1);
    expect(cop.valor_por_vencer).toBe(2488892);
    expect(cop.vencidas).toBe(1);
    // Del periodo y no borradores: 1 (enviada), 3, 5, 6 → 4 enviadas, 1 convertida.
    expect(cop.enviadas_periodo).toBe(4);
    expect(cop.convertidas_periodo).toBe(1);
    expect(tasaConversion(cop)).toBe(25);
    expect(tasaConversion({ enviadas_periodo: 0, convertidas_periodo: 0 })).toBeNull();
  });

  test('filtros: búsqueda sin tildes, abiertas, vigencia, oportunidad y monto', () => {
    expect(filtrarCotizaciones(filas, { q: 'laura gomez' }).map((f) => f.id)).toEqual(['2']);
    expect(filtrarCotizaciones(filas, { q: 'cot-4' }).map((f) => f.id)).toEqual(['4']);
    expect(filtrarCotizaciones(filas, { estado: 'abiertas' }).map((f) => f.id)).toEqual(['1', '2', '7']);
    expect(filtrarCotizaciones(filas, { vigencia: 'por_vencer' }).map((f) => f.id)).toEqual(['1', '7']);
    expect(filtrarCotizaciones(filas, { vigencia: 'vencidas' }).map((f) => f.id)).toEqual(['4']);
    expect(filtrarCotizaciones(filas, { oportunidad: 'con' }).map((f) => f.id)).toEqual(['1']);
    expect(filtrarCotizaciones(filas, { monto_min: 1000000, monto_max: 2500000 }).map((f) => f.id)).toEqual(['1', '3']);
    expect(filtrarCotizaciones(filas, { desde: '2026-09-15', hasta: '2026-09-20' }).map((f) => f.id)).toEqual(['1', '3']);
  });

  test('orden y página', () => {
    expect(ordenarCotizaciones(filas, 'total.desc')[0].id).toBe('4');
    expect(ordenarCotizaciones(filas, 'emision.asc')[0].id).toBe('4');
    expect(ordenarCotizaciones(filas, 'estado.asc')[0].estado).toBe('expired');
    const r = construirListado(filas, { tamano: 2, pagina: 2, orden: 'emision.desc' }, HOY);
    expect(r.total).toBe(7);
    expect(r.filas.map((f) => f.id)).toEqual(['1', '6']);
    expect(r.hoy).toBe(HOY);
    expect(ordenCotizacionesRuta('nada', undefined)).toBe('emision.desc');
    expect(ordenCotizacionesRuta('total', 'asc')).toBe('total.asc');
  });

  test('los KPI no dependen de los filtros del listado', () => {
    const a = construirListado(filas, { estado: 'converted' }, HOY);
    const b = construirListado(filas, {}, HOY);
    expect(a.kpis).toEqual(b.kpis);
    expect(a.total).toBe(1);
  });

  test('parámetros: lista blanca, sin organización', () => {
    const p = parametrosListadoSchema.parse({ q: 'x', organization_id: '9', pagina: '2', tamano: '25', estado: 'abiertas', vista: 'listado' });
    expect(p).toEqual({ q: 'x', pagina: 2, tamano: 25, estado: 'abiertas' });
    expect(parametrosListadoSchema.safeParse({ orden: 'total; drop' }).success).toBe(false);
  });

  test('de la RPC a la fila: días de vigencia contra el hoy de la organización y nombres enriquecidos', () => {
    const c = {
      id: 'q1',
      number: 'COT-1',
      status: 'sent',
      stored_status: 'sent',
      customer_id: 'c1',
      branch_id: 2,
      issue_date: '2026-09-15',
      valid_until: '2026-10-01',
      currency: 'COP',
      subtotal: 0,
      tax_total: 0,
      discount_total: 0,
      total: 10,
      payment_terms: 30,
      payment_method: null,
      salesperson_id: 'u1',
      converted_invoice_id: null,
      opportunity_id: 'o1',
      created_at: '',
      updated_at: '',
      customers: { id: 'c1', full_name: 'Cliente', email: 'a@b.co' },
    } as CotizacionResumen;
    const f = aFila(c, HOY, { documentos: new Map([['c1', 'NIT 1']]), vendedores: new Map([['u1', 'Vendedora']]), oportunidades: new Map([['o1', 'Dotación']]) });
    expect(f).toMatchObject({ dias_vigencia: 3, cliente_doc: 'NIT 1', vendedor: 'Vendedora', oportunidad: 'Dotación', cliente_correo: 'a@b.co' });
  });
});

describe('impuestos por tarifa (detalle y conversión)', () => {
  test('agrupa por código y tarifa con los números de la base', () => {
    const r = impuestosPorTarifa([
      { qty: 12, unit_price: 45000, discount_amount: 32400, tax_code: 'IVA_19', tax_rate: 19, tax_included: false, total_line: 604044 },
      { qty: 8, unit_price: 89900, discount_amount: 0, tax_code: 'IVA_19', tax_rate: 19, tax_included: false, total_line: 855848 },
      { qty: 40, unit_price: 24500, discount_amount: 0, tax_code: 'IVA_5', tax_rate: 5, tax_included: false, total_line: 1029000 },
      { qty: 1, unit_price: 1000, discount_amount: 0, tax_code: null, tax_rate: 0, tax_included: false, total_line: 1000 },
    ]);
    expect(r).toEqual([
      { codigo: 'IVA_19', tarifa: 19, base: 1226800, importe: 233092 },
      { codigo: 'IVA_5', tarifa: 5, base: 980000, importe: 49000 },
    ]);
  });

  test('con impuesto incluido la base sale del total', () => {
    const [i] = impuestosPorTarifa([{ qty: 1, unit_price: 119, discount_amount: 0, tax_code: 'IVA_19', tax_rate: 19, tax_included: true, total_line: 119 }]);
    expect(i).toMatchObject({ base: 100, importe: 19 });
  });
});

describe('formulario', () => {
  const linea = (p: Partial<LineaVenta> = {}): LineaVenta => ({
    clave: 'l1',
    product_id: 7,
    descripcion: 'Camiseta',
    sku: null,
    cantidad: 2,
    precio: 1000,
    descuento: 0,
    impuestos: [
      { id: 'iva', codigo: 'IVA_19', nombre: 'IVA 19 %', tarifa: 19 },
      { id: 'inc', codigo: 'INC_8', nombre: 'INC', tarifa: 8 },
    ],
    nota: null,
    manual: false,
    serial: false,
    controlaStock: false,
    stock: null,
    ...p,
  });

  test('vigencia por atajos de días planos', () => {
    expect(vigenciaPorDias('2026-09-15', 15)).toBe('2026-09-30');
    expect(atajoVigencia('2026-09-15', '2026-10-15')).toBe(30);
    expect(atajoVigencia('2026-09-15', '2026-10-16')).toBeNull();
    expect(atajoVigencia('2026-09-15', null)).toBeNull();
  });

  test('validación antes de enviar', () => {
    expect(validarCotizacion({ clienteId: null, sucursal: null, emision: '2026-09-15', validaHasta: '2026-09-01', lineas: [] })).toEqual({
      cliente: 'requerido',
      sucursal: 'requerido',
      vigencia: 'vigenciaAnterior',
      lineas: 'sinLineas',
    });
    expect(validarCotizacion({ clienteId: 'c', sucursal: 1, emision: '2026-09-15', validaHasta: null, lineas: [linea({ cantidad: 0 })] })).toEqual({ 'linea.l1': 'cantidad' });
    expect(validarCotizacion({ clienteId: 'c', sucursal: 1, emision: '2026-09-15', validaHasta: null, lineas: [linea({ descuento: 5000 })] })).toEqual({ 'linea.l1': 'descuento' });
    expect(validarCotizacion({ clienteId: 'c', sucursal: 1, emision: '2026-09-15', validaHasta: '2026-09-15', lineas: [linea()] })).toEqual({});
  });

  test('el cuerpo pasa el esquema de la ruta y lleva UN impuesto por línea', () => {
    const d = datosCotizacion(
      {
        clienteId: '7b7c1a3e-0f1e-4c8b-9a2d-1f2e3d4c5b6a',
        sucursal: 3,
        emision: '2026-09-15',
        validaHasta: '2026-10-15',
        moneda: 'COP',
        terminos: 30,
        formaPago: '',
        notas: '  ',
        terminosCondiciones: 'Anticipo 30 %',
        vendedor: null,
        oportunidad: null,
        incluido: false,
      },
      [linea()],
    );
    expect(guardarCotizacionSchema.safeParse(d).success).toBe(true);
    expect(d.items[0]).toMatchObject({ tax_code: 'IVA_19', tax_rate: 19, qty: 2, unit_price: 1000, tax_included: false });
    expect(d.notes).toBeNull();
    expect(d.payment_method).toBeNull();
    expect(d).not.toHaveProperty('organization_id');
    expect(d).not.toHaveProperty('number');
  });
});

describe('pantallas nuevas: tokens, fechas y servidor', () => {
  const RAIZ = path.join(process.cwd(), 'src');
  const archivos = [
    'components/finanzas/cotizaciones/listado/ListadoCotizaciones.tsx',
    'components/finanzas/cotizaciones/id/DetalleCotizacion.tsx',
    'components/finanzas/cotizaciones/formulario/FormularioCotizacion.tsx',
    'components/finanzas/cotizaciones/detalle/ConvertirCotizacionDialog.tsx',
    'components/finanzas/documento/EnviarDocumentoDialog.tsx',
  ];
  test.each(archivos)('%s: sin dark:, gray-*, hex ni día UTC', (rel) => {
    const codigo = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
    expect(codigo).not.toMatch(/\bdark:/);
    expect(codigo).not.toMatch(/\bgray-\d/);
    expect(codigo).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(codigo).not.toMatch(/toISOString\(\)\.split\('T'\)/);
    expect(codigo).not.toMatch(/\.split\('T'\)\[0\]/);
  });

  test('ninguna pantalla de cotizaciones escribe en la base desde el navegador', () => {
    for (const rel of archivos) {
      const codigo = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
      expect(codigo).not.toMatch(/from\('quotations'\)|from\('quotation_items'\)|\.insert\(|\.update\(|\.delete\(/);
    }
  });
});
