/**
 * Consignación en dos sentidos y entre organizaciones: lógica sin React, cuerpos
 * de las rutas y lo que las migraciones (sin aplicar) no pueden perder.
 * Criterio del Contador: docs/design/CONSIGNACION-RECIBIDA-Y-ENTRE-ORGANIZACIONES.md.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CONDICIONES_VACIAS,
  ERRORES_DE_CONFIGURACION,
  aceptarVinculoSchema,
  codigoErrorRecibida,
  esPendienteRecibida,
  estadoHttpErrorRecibida,
  filtrarRecibidas,
  invitarSchema,
  kpisRecibidas,
  recibirSchema,
  terminosDeCondiciones,
  terminosSchema,
  validarCondiciones,
  vistaLiquidacion,
  type CondicionesContrato,
  type NotaRecibida,
} from '@/lib/inventario/consignaciones/recibidas';
import { CATALOGO_NAV } from '@/lib/navigation/catalog';
import { RUTA_CONSIGNACIONES } from '@/lib/finanzas/consignaciones/consignaciones';

const RAIZ = process.cwd();
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8');
const sinComentarios = (sql: string) => sql.replace(/--.*$/gm, '');

const INTERMEDIACION: CondicionesContrato = {
  contrato: 'intermediacion',
  precioModo: 'fijo',
  remuneracionModo: 'porcentaje',
  baseComision: 'precio_pactado',
  obligacionDueno: 'venta',
  riesgos: { devoluciones: 'dueno', perdidas: 'consignatario', gastos: 'consignatario' },
  factura: null,
};

describe('condiciones del contrato (Contador 2, punto 1: clasificación obligatoria y sin default)', () => {
  test('sin clasificación no se opera, y no hay valor por defecto', () => {
    expect(CONDICIONES_VACIAS.contrato).toBeNull();
    expect(validarCondiciones(CONDICIONES_VACIAS)).toEqual(['contrato']);
    expect(terminosSchema.safeParse({ ...terminosDeCondiciones(INTERMEDIACION), contrato: undefined }).success).toBe(false);
  });

  test('la compra real no es consignación', () => {
    expect(validarCondiciones({ ...INTERMEDIACION, contrato: 'compra' })).toEqual(['compra_real']);
  });

  test('cada clasificación exige lo suyo', () => {
    expect(validarCondiciones(INTERMEDIACION)).toEqual([]);
    expect(validarCondiciones({ ...INTERMEDIACION, obligacionDueno: null })).toEqual(['obligacion']);
    expect(validarCondiciones({ ...INTERMEDIACION, contrato: 'estimatorio', obligacionDueno: null })).toEqual([]);
    expect(validarCondiciones({ ...INTERMEDIACION, baseComision: null })).toEqual(['base']);
    expect(validarCondiciones({ ...INTERMEDIACION, remuneracionModo: 'precio_liquidacion', baseComision: null })).toEqual([]);
    expect(validarCondiciones({ ...INTERMEDIACION, riesgos: { ...INTERMEDIACION.riesgos, gastos: null } })).toEqual(['riesgos']);
  });

  test('en intermediación factura el mandatario; IVA y retenciones no viajan como elección', () => {
    const t = terminosDeCondiciones({ ...INTERMEDIACION, factura: 'consignante' }, { cuentaRecaudo: '28151001' });
    expect(t.factura).toBe('consignatario');
    expect(t.cuenta_recaudo).toBe('28151001');
    expect(terminosSchema.safeParse(t).success).toBe(true);
    expect(terminosSchema.safeParse({ ...t, iva_responsable: 'mandante' }).success).toBe(false);
    expect(terminosSchema.safeParse({ ...t, cuenta_recaudo: '2815' }).success).toBe(false);
  });
});

describe('cuerpos de las rutas', () => {
  const linea = { product_id: 9, qty: 10, precio: 60000 };
  const base = { proveedor_id: 3, sucursal_id: 7, comision: 15, terminos: terminosDeCondiciones(INTERMEDIACION), lineas: [linea], clave_idempotencia: 'consignacion:1' };

  test('recibir es estricto: ni organización ni cuentas desde el navegador', () => {
    expect(recibirSchema.safeParse(base).success).toBe(true);
    expect(recibirSchema.safeParse({ ...base, organization_id: 9 }).success).toBe(false);
    expect(recibirSchema.safeParse({ ...base, lineas: [{ ...linea, precio: 0 }] }).success).toBe(false);
    expect(recibirSchema.safeParse({ ...base, cuenta: '911520' }).success).toBe(false);
  });

  test('invitar y aceptar un vínculo piden un solo tercero y un token de 64 hex', () => {
    expect(invitarSchema.safeParse({ proveedor_id: 1, correo: 'gerencia@ejemplo.co' }).success).toBe(true);
    expect(invitarSchema.safeParse({ proveedor_id: 1, cliente_id: '11111111-2222-4333-8444-555555555555', correo: 'a@b.co' }).success).toBe(false);
    expect(invitarSchema.safeParse({ correo: 'a@b.co' }).success).toBe(false);
    const token = 'a'.repeat(64);
    expect(aceptarVinculoSchema.safeParse({ token, organizacion_id: 1, proveedor_id: 2 }).success).toBe(true);
    expect(aceptarVinculoSchema.safeParse({ token: 'corto', organizacion_id: 1, proveedor_id: 2 }).success).toBe(false);
  });
});

describe('errores', () => {
  test('códigos estables y estado HTTP', () => {
    expect(codigoErrorRecibida('clasificacion_obligatoria')).toBe('clasificacion_obligatoria');
    expect(codigoErrorRecibida('STOCK_INSUFICIENTE: x')).toBe('stock_insuficiente');
    expect(codigoErrorRecibida('Acceso denegado a la organización 9')).toBe('sin_permiso');
    expect(codigoErrorRecibida('otra cosa')).toBe('error_desconocido');
    expect(estadoHttpErrorRecibida('sin_permiso')).toBe(403);
    expect(estadoHttpErrorRecibida('pendiente_de_activar')).toBe(501);
    expect(estadoHttpErrorRecibida('liquidacion_no_es_la_ultima')).toBe(409);
    expect(estadoHttpErrorRecibida('compra_real_usa_factura')).toBe(422);
  });

  test('los bloqueos por configuración dejan pendiente contable', () => {
    expect(ERRORES_DE_CONFIGURACION).toEqual(
      expect.arrayContaining(['sin_cuenta_orden_consignacion', 'sin_cuenta_contra_orden', 'sin_cuenta_recaudo_propietario', 'sin_cuenta_remuneracion', 'sin_cuenta_costo']),
    );
  });

  test('migración sin aplicar = pendiente de activar', () => {
    expect(esPendienteRecibida({ code: '42P01' })).toBe(true);
    expect(esPendienteRecibida({ message: 'relation "organization_links" does not exist' })).toBe(true);
    expect(esPendienteRecibida({ message: 'otra cosa' })).toBe(false);
  });
});

describe('liquidación al consignante: la MISMA fórmula que la base (prueba en seco 2026-11-07)', () => {
  test('intermediación, 15 % sobre el pactado: 2 und × 60.000 → dueño 102.000, remuneración 18.000', () => {
    const v = vistaLiquidacion([{ cantidad: 2, venta: 120000, pactado: 120000, precioLiquidacion: null }], { remuneracionModo: 'porcentaje', baseComision: 'precio_pactado', comisionPct: 15 });
    expect(v).toEqual({ venta: 120000, pactado: 120000, dueno: 102000, remuneracion: 18000, bajoPrecio: false });
  });

  test('estimatorio, 10 % sobre la venta: 2 × 25.000 → dueño 45.000', () => {
    const v = vistaLiquidacion([{ cantidad: 2, venta: 50000, pactado: 50000, precioLiquidacion: null }], { remuneracionModo: 'porcentaje', baseComision: 'precio_venta', comisionPct: 10 });
    expect(v.dueno).toBe(45000);
    expect(v.remuneracion).toBe(5000);
  });

  test('precio de liquidación: lo que gane por encima es la remuneración; por debajo, se marca', () => {
    expect(vistaLiquidacion([{ cantidad: 3, venta: 90000, pactado: 75000, precioLiquidacion: 20000 }], { remuneracionModo: 'precio_liquidacion', baseComision: 'precio_pactado', comisionPct: 0 }).remuneracion).toBe(30000);
    expect(vistaLiquidacion([{ cantidad: 1, venta: 10000, pactado: 25000, precioLiquidacion: 20000 }], { remuneracionModo: 'precio_liquidacion', baseComision: 'precio_pactado', comisionPct: 0 }).bajoPrecio).toBe(true);
  });

  test('una devolución posterior (cantidad negativa) resta de lo del dueño', () => {
    const v = vistaLiquidacion(
      [
        { cantidad: 2, venta: 120000, pactado: 120000, precioLiquidacion: null },
        { cantidad: -1, venta: -60000, pactado: -60000, precioLiquidacion: null },
      ],
      { remuneracionModo: 'porcentaje', baseComision: 'precio_pactado', comisionPct: 15 },
    );
    expect(v.dueno).toBe(51000);
  });
});

describe('KPIs y búsqueda de Recibidas', () => {
  const nota = (over: Partial<NotaRecibida>): NotaRecibida => ({
    id: 'n1',
    numero: 'NCR-0001',
    proveedorId: 1,
    consignante: 'Consignante uno',
    sucursalId: 1,
    contrato: 'intermediacion',
    precioModo: 'fijo',
    remuneracionModo: 'porcentaje',
    baseComision: 'precio_pactado',
    comisionPct: 15,
    obligacionDueno: 'venta',
    riesgos: { devoluciones: 'dueno', perdidas: 'consignatario', gastos: 'consignatario' },
    factura: 'consignatario',
    estado: 'en_consignacion',
    vinculada: false,
    numeroExterno: null,
    cuentas: { orden: '911520', contra: '9405', recaudo: '28151001', remuneracion: '41351201', costo: null },
    fecha: '2026-11-07T10:00:00Z',
    lineas: [{ id: 'l1', productoId: 1, producto: 'P', productoConsignante: null, recibido: 10, vendido: 2, devuelto: 2, precioPactado: 60000, precioLiquidacion: null, sinLiquidar: { cantidad: 2, venta: 120000, pactado: 120000 } }],
    liquidaciones: [],
    vendidoSinLiquidar: 120000,
    unidadesSinLiquidar: 2,
    ...over,
  });

  test('en tu poder a precio pactado, vendido sin liquidar y remuneración estimada', () => {
    const k = kpisRecibidas([nota({})]);
    expect(k.enTuPoder).toBe(360000);
    expect(k.vendidoSinLiquidar).toBe(120000);
    expect(k.remuneracion).toBe(18000);
    expect(k.notasConVentas).toBe(1);
  });

  test('busca por número o consignante', () => {
    const ns = [nota({}), nota({ id: 'n2', numero: 'NCR-0002', consignante: 'Otra tienda' })];
    expect(filtrarRecibidas(ns, '0002').map((n) => n.id)).toEqual(['n2']);
    expect(filtrarRecibidas(ns, 'uno').map((n) => n.id)).toEqual(['n1']);
  });
});

describe('navegación: Consignaciones vive en Inventario', () => {
  const hrefs = CATALOGO_NAV.flatMap((m) => m.paginas.map((p) => p.href));
  test('la página está en Inventario y ya no en Finanzas', () => {
    expect(hrefs).toContain('/app/inventario/consignaciones');
    expect(hrefs).not.toContain('/app/finanzas/consignaciones');
    expect(RUTA_CONSIGNACIONES).toBe('/app/inventario/consignaciones');
  });
  test('la ruta vieja redirige', () => {
    expect(leer('src/app/app/finanzas/consignaciones/page.tsx')).toMatch(/permanentRedirect\('\/app\/inventario\/consignaciones'\)/);
    expect(leer('src/app/app/finanzas/consignaciones/[id]/page.tsx')).toMatch(/permanentRedirect\(`\/app\/inventario\/consignaciones\//);
  });
});

describe('migraciones sin aplicar: lo que no se puede perder', () => {
  const vinculos = sinComentarios(leer('supabase/migrations/20261108120500_organization_links.sql'));
  const consignaciones = sinComentarios(leer('supabase/migrations/20261108121000_consignaciones.sql'));

  test('las dos tienen su reversión', () => {
    expect(leer('supabase/rollbacks/20261108120500_organization_links_rollback.sql')).toMatch(/drop table if exists public\.organization_links;/);
    expect(leer('supabase/rollbacks/20261108121000_consignaciones_rollback.sql')).toMatch(/drop trigger if exists trg_consignacion_venta/);
  });

  test('nada para anon y ninguna escritura directa desde authenticated', () => {
    for (const sql of [vinculos, consignaciones]) {
      expect(sql).not.toMatch(/grant\s+[^;]*\bto\s+[^;]*\banon\b/i);
      expect(sql).not.toMatch(/grant\s+(insert|update|delete)/i);
    }
  });

  test('el token del vínculo se guarda con hash y su columna no se puede leer', () => {
    expect(vinculos).toMatch(/token_hash text not null check \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
    expect(vinculos).toMatch(/revoke all on public\.organization_links from anon, authenticated/);
    const grant = /grant select \(([^)]*)\)\s+on public\.organization_links to authenticated/.exec(vinculos);
    expect(grant).not.toBeNull();
    expect(grant![1]).not.toMatch(/token_hash/);
  });

  test('la clasificación del contrato es obligatoria y sin default', () => {
    expect(consignaciones).toMatch(/contract_type text not null check \(contract_type in \('intermediacion', 'estimatorio', 'compra'\)\),/);
    expect(consignaciones).not.toMatch(/contract_type text not null default/);
    expect(consignaciones).toMatch(/raise exception 'clasificacion_obligatoria'/);
    expect(consignaciones).toMatch(/raise exception 'compra_real_usa_factura'/);
  });

  test('cuentas según el Contador: 911520 / grupo 94, auxiliar 281510 y 413512; nunca 4225 ni cuentas inventadas', () => {
    expect(consignaciones).toMatch(/'\^911520\(\[0-9\]\{2\}\)\?\$'/);
    expect(consignaciones).toMatch(/'\^94\[0-9\]\{2,6\}\$'/);
    expect(consignaciones).toMatch(/'\^281510\[0-9\]\{2\}\$'/);
    expect(consignaciones).toMatch(/'\^413512\[0-9\]\{2\}\$'/);
    expect(consignaciones).not.toMatch(/4225/);
    expect(consignaciones).not.toMatch(/fn_puc_asegurar_cuenta|fn_puc_cuenta_para_asiento|insert into public\.chart_of_accounts/);
  });

  test('la mercancía entregada se reclasifica DENTRO de inventarios (grupo 14)', () => {
    expect(consignaciones).toMatch(/where c ~ '\^14'/);
  });

  test('IVA y retenciones: hechos y pendiente contable, no elección libre', () => {
    expect(consignaciones).toMatch(/consignacion_impuestos_por_determinar/);
    expect(consignaciones).toMatch(/consignacion_base_iva_estimatorio/);
    expect(consignaciones).not.toMatch(/p_retenciones/);
  });

  test('kardex solo por la primitiva y asientos solo por fn_create_journal_entry', () => {
    expect(consignaciones).not.toMatch(/insert into public\.(stock_movements|stock_levels|journal_entries|journal_lines|accounts_payable)\b/i);
    expect(consignaciones).toMatch(/fn_inv_int_mover/);
  });

  test('toda función que escribe exige permiso de finanzas', () => {
    const publicas = ['fn_consignacion_entregar', 'fn_consignacion_recibir_interna', 'fn_consignacion_recibida_devolver', 'fn_consignacion_recibida_liquidar', 'fn_consignacion_recibida_anular_liquidacion', 'fn_consignacion_recibida_aceptar'];
    for (const fn of publicas) {
      const inicio = consignaciones.indexOf(`create or replace function public.${fn}(`);
      expect(inicio).toBeGreaterThan(-1);
      const cuerpo = consignaciones.slice(inicio, consignaciones.indexOf('$function$;', inicio));
      expect(cuerpo).toMatch(/fn_finanzas_exigir_permiso/);
    }
  });
});
