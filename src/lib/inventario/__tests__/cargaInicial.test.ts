/**
 * Carga inicial: 1.000 × 3.800 = 3.800.000 en 1435 contra 3105.
 * El sobrante acredita 4295. La compra sin orden no arma asiento.
 */
import fs from 'fs';
import path from 'path';
import {
  CUENTA_DIVERSOS,
  CUENTA_INVENTARIO_COMERCIO,
  CUENTA_RECUPERACIONES,
  CUENTA_SALDO_INICIAL,
  RUTA_FACTURA_COMPRA,
  asientoCargaInicial,
  asientoPorTotal,
  asientoSobrante,
  costoParecePrecio,
  creditoDelAjuste,
  cuentaInventarioPorTipo,
  cuentaInventarioCargaInicial,
  debeAvisarSaldoInicial,
  debeConfirmarAjuste,
  sugerirCompraPorNegativo,
  sugerirCorregirConteo,
} from '../cargaInicial';

describe('asiento de la carga inicial', () => {
  test('1.000 unidades a 3.800: débito 1435 y crédito 3105 por 3.800.000, sin 4250', () => {
    const asiento = asientoCargaInicial({ unidades: 1000, costo: 3800 });
    expect(asiento.total).toBe(3_800_000);
    expect(asiento.lineas).toEqual([
      { cuenta: CUENTA_INVENTARIO_COMERCIO, debito: 3_800_000, credito: 0 },
      { cuenta: CUENTA_SALDO_INICIAL, debito: 0, credito: 3_800_000 },
    ]);
    expect(asiento.lineas.map((l) => l.cuenta)).not.toContain(CUENTA_RECUPERACIONES);
    expect(asiento.lineas.reduce((s, l) => s + l.debito, 0)).toBe(asiento.lineas.reduce((s, l) => s + l.credito, 0));
  });

  test('el débito queda bajo 1435, también en restaurante; 1405 no se usa', () => {
    expect(cuentaInventarioPorTipo(1)).toBe(CUENTA_INVENTARIO_COMERCIO);
    expect(cuentaInventarioPorTipo(3)).toBe(CUENTA_INVENTARIO_COMERCIO);
    expect(cuentaInventarioPorTipo(1, '1405')).toBe('1435');
    expect(cuentaInventarioPorTipo(1, '1405-01')).toBe('1435');
    expect(cuentaInventarioPorTipo(null, '14350501')).toBe('14350501');
    const asiento = asientoCargaInicial({
      unidades: 2,
      costo: 1500.4,
      cuentaInventario: cuentaInventarioPorTipo(1, '14350501'),
      cuentaSaldo: '310505',
    });
    expect(asiento.total).toBe(3001);
    expect(asiento.lineas[0]).toMatchObject({ cuenta: '14350501', debito: 3001 });
    expect(asiento.lineas[1]).toMatchObject({ cuenta: '310505', credito: 3001 });
    expect(asiento.lineas.map((l) => l.cuenta).some((c) => c.startsWith('1405'))).toBe(false);
  });

  test('insumo de restaurante: 14050501 solo con la separación activa (orgs nuevas o aprobadas)', () => {
    const insumo = { esIngrediente: true };
    expect(cuentaInventarioCargaInicial({ typeId: 1, producto: insumo, separarInsumos: true })).toBe('14050501');
    expect(cuentaInventarioCargaInicial({ typeId: 2, producto: insumo, separarInsumos: true })).toBe('14050501');
    // Org existente (separación desactivada hasta el OK de Juan): sigue bajo 1435.
    expect(cuentaInventarioCargaInicial({ typeId: 1, producto: insumo })).toBe('1435');
    expect(cuentaInventarioCargaInicial({ typeId: 1, producto: insumo, configurada: '14350101' })).toBe('14350101');
    // Comercio y reventa: bajo 1435.
    expect(cuentaInventarioCargaInicial({ typeId: 3, producto: insumo, separarInsumos: true })).toBe('1435');
    expect(cuentaInventarioCargaInicial({ typeId: 1, producto: {}, separarInsumos: true, configurada: '14350101' })).toBe('14350101');
    const asiento = asientoPorTotal({ total: 1000, cuentaInventario: '14050501' });
    expect(asiento.lineas[0].cuenta).toBe('14050501');
    expect(asientoPorTotal({ total: 1000, cuentaInventario: '140505' }).lineas[0].cuenta).toBe('1435');
  });

  test('un total ya sumado no toca 4250', () => {
    const asiento = asientoPorTotal({ total: 3_800_000.4 });
    expect(asiento.total).toBe(3_800_000);
    expect(asiento.lineas.map((l) => l.cuenta)).toEqual(['1435', '3105']);
  });
});

describe('motivo del ajuste de ganancia', () => {
  test('saldo inicial acredita 3105 y el sobrante real acredita 4295, nunca 4250', () => {
    expect(creditoDelAjuste('saldo_inicial')).toEqual({ tipo: 'saldo_inicial', cuenta: '3105' });
    expect(creditoDelAjuste('initial_setup')).toEqual({ tipo: 'saldo_inicial', cuenta: '3105' });
    for (const motivo of ['physical_count', 'audit', 'production_input', 'produccion_propia', 'sobrante', 'otro']) {
      expect(creditoDelAjuste(motivo)).toEqual({ tipo: 'diversos', cuenta: CUENTA_DIVERSOS });
    }
    expect(creditoDelAjuste('correccion_conteo')).toEqual({ tipo: 'correccion', cuenta: null });
    const sobrante = asientoSobrante({ total: 3_800_000 });
    expect(sobrante.lineas).toEqual([
      { cuenta: '1435', debito: 3_800_000, credito: 0 },
      { cuenta: '42959501', debito: 0, credito: 3_800_000 },
    ]);
    expect(sobrante.lineas.map((l) => l.cuenta)).not.toContain(CUENTA_RECUPERACIONES);
  });

  test('un conteo o un faltante del mismo mes ofrece corregir el conteo', () => {
    expect(sugerirCorregirConteo({ direccion: 'in', motivo: 'sobrante', tuvoConteoOFaltante: true })).toBe(true);
    expect(sugerirCorregirConteo({ direccion: 'in', motivo: 'saldo_inicial', tuvoConteoOFaltante: true })).toBe(false);
    expect(sugerirCorregirConteo({ direccion: 'in', motivo: 'compra_sin_orden', tuvoConteoOFaltante: true })).toBe(false);
    expect(sugerirCorregirConteo({ direccion: 'in', motivo: 'sobrante', tuvoConteoOFaltante: false })).toBe(false);
    expect(sugerirCorregirConteo({ direccion: 'out', motivo: 'sobrante', tuvoConteoOFaltante: true })).toBe(false);
  });

  test('compra sin orden no genera asiento: va a la factura de compra', () => {
    expect(creditoDelAjuste('compra_sin_orden')).toEqual({ tipo: 'factura', cuenta: null });
    expect(creditoDelAjuste('compra sin orden').tipo).toBe('factura');
    expect(RUTA_FACTURA_COMPRA).toBe('/app/inventario/facturas-compra/nuevo');
  });

  test('un producto sin movimientos y una entrada positiva avisan y dejan cambiar el motivo', () => {
    expect(debeAvisarSaldoInicial({ movimientosPrevios: 0, direccion: 'in', cantidad: 1000 })).toBe(true);
    expect(debeAvisarSaldoInicial({ movimientosPrevios: 1, direccion: 'in', cantidad: 1000 })).toBe(false);
    expect(debeAvisarSaldoInicial({ movimientosPrevios: 0, direccion: 'out', cantidad: 1 })).toBe(false);
    expect(debeAvisarSaldoInicial({ movimientosPrevios: 0, direccion: 'in', cantidad: 0 })).toBe(false);
  });
});

describe('confirmación, costo y negativo', () => {
  const ahora = new Date('2026-10-23T15:00:00Z');

  test('organización de menos de 30 días o monto sobre el umbral', () => {
    expect(debeConfirmarAjuste({ creadaEn: '2026-10-01T00:00:00Z', ahora, monto: 1000, umbral: 5_000_000 })).toBe(true);
    expect(debeConfirmarAjuste({ creadaEn: '2026-01-01T00:00:00Z', ahora, monto: 5_000_000, umbral: 5_000_000 })).toBe(true);
    expect(debeConfirmarAjuste({ creadaEn: '2026-01-01T00:00:00Z', ahora, monto: 4_999_999, umbral: 5_000_000 })).toBe(false);
    expect(debeConfirmarAjuste({ creadaEn: null, ahora, monto: 9_000_000, umbral: 5_000_000 })).toBe(true);
    expect(debeConfirmarAjuste({ creadaEn: null, ahora, monto: 9_000_000, umbral: null })).toBe(false);
  });

  test('el costo unitario no puede confundirse con el precio de venta', () => {
    expect(costoParecePrecio(3800, 3800)).toBe(true);
    expect(costoParecePrecio(3900, 3800)).toBe(true);
    expect(costoParecePrecio(3700, 3800)).toBe(false);
    expect(costoParecePrecio(3800, 0)).toBe(false);
    expect(costoParecePrecio(null, 3800)).toBe(false);
  });

  test('desde negativo se sugiere la compra o la producción, antes que el sobrante', () => {
    expect(sugerirCompraPorNegativo(-2)).toBe(true);
    expect(sugerirCompraPorNegativo(0)).toBe(false);
    expect(sugerirCompraPorNegativo(null)).toBe(false);
  });
});

describe('contrato de la migración', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '../../../../supabase/migrations/20261023180000_carga_inicial_inventario.sql'),
    'utf8',
  );
  const retro = fs.readFileSync(
    path.join(__dirname, '../../../../supabase/rollbacks/20261023180000_carga_inicial_inventario_rollback.sql'),
    'utf8',
  );

  test('la apertura no entra en la lista de compras y traslados, y sí se encola', () => {
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.fn_auto_journal_stock_movement\s*\(/i);
    const lista = sql.match(/if new\.source in \('purchase'[\s\S]*?\) then/);
    expect(lista).not.toBeNull();
    expect(lista![0]).toContain("'transfer_in'");
    expect(lista![0]).not.toContain("'initial'");
    expect(sql).toContain("if new.source = 'initial' then");
    expect(sql).toContain('carga_inicial_pendiente');
  });

  test('el asiento es inventario contra saldo inicial, agrupado, y el sobrante acredita 4250', () => {
    expect(sql).toContain("'1435'");
    expect(sql).toContain("'1405'");
    expect(sql).toContain("'3105'");
    expect(sql).toContain("clave = 'saldo_inicial'");
    expect(sql).toContain("clave = 'inventario'");
    expect(sql).toContain('group by sm.organization_id, sm.branch_id');
    expect(sql).toContain("'sobrante'");
    expect(sql).toContain("'production_input'");
    expect(sql).toContain('left(v_credito, 4) = \'4250\'');
  });

  test('el histórico queda en borrador, sin la org 149 ni las de prueba, y se puede revertir', () => {
    expect(sql).toContain("'carga_inicial_borrador:'");
    expect(sql).toContain('posted = false');
    expect(sql).toContain('o.id <> 149');
    expect(sql).toContain('carga_inicial_borrador_invalido');
    expect(sql).toContain("(test|prueba|e2e|sandbox|demo)");
    expect(retro).toContain('fn_revertir_asiento');
    expect(retro).toContain("fact_key like 'carga_inicial_borrador:%'");
    expect(retro).toContain('carga_inicial_funcion_respaldo');
  });
});

describe('contrato del sobrante en 4295', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '../../../../supabase/migrations/20261023190000_sobrante_diversos.sql'),
    'utf8',
  );
  const retro = fs.readFileSync(
    path.join(__dirname, '../../../../supabase/rollbacks/20261023190000_sobrante_diversos_rollback.sql'),
    'utf8',
  );
  const datos = fs.readFileSync(
    path.join(__dirname, '../../../../supabase/migrations/20261023190100_sobrante_borradores.sql'),
    'utf8',
  );

  test('no redefine el disparador de stock y el sobrante acredita 4295 bajo 1435', () => {
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.fn_auto_journal_stock_movement\s*\(/i);
    expect(sql).toContain('fn_inventario_auxiliar_1435');
    expect(sql).toContain("'143505'");
    expect(sql).toContain("'ingresos_diversos'");
    // 4295 pasa a título: el sobrante acredita el auxiliar 42959501 vía la clave (134030).
    const p1 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261025134030_p1_funciones_cuentas_titulo_a_auxiliar.sql'), 'utf8');
    const cuerpo = (fn: string) => {
      const resto = p1.slice(p1.search(new RegExp(String.raw`function\s+public\.${fn}\s*\(`, 'i')));
      return resto.slice(0, resto.search(/\n\$(function)?\$\s*;/));
    };
    // El resolver lleva 4295 a 42959501 y fn_cuenta_ingresos_diversos pasa por él con respaldo 4295.
    expect(cuerpo('fn_cuenta_auxiliar_de_titulo')).toMatch(/when\s+'4295'\s+then\s+'42959501'/);
    expect(cuerpo('fn_cuenta_ingresos_diversos')).toMatch(/fn_cuenta_auxiliar_de_titulo\([\s\S]*clave\s*=\s*'ingresos_diversos'[\s\S]*'4295'\)\)/);
    // B1: fn_sobrante_borradores lee y reemplaza también los auxiliares 42959501/42959502.
    const sob = cuerpo('fn_sobrante_borradores');
    expect(sob).toContain("account_code in ('4295', '42959501', '42959502')");
    expect(sob).toContain("account_code in ('4250', '3105', '4295', '42959501', '42959502')");
    expect(sql).toContain('correccion_conteo');
    expect(sql).toContain('left(coalesce(v_credit_account, \'\'), 4) = \'4250\'');
    expect(datos).toContain('fn_sobrante_borradores');
    expect(datos).toContain('organization_id <> 149');
    expect(datos).toContain('48');
    expect(datos).not.toContain('create or replace function public.fn_auto_journal_stock_movement');
  });

  test('el rollback conserva el respaldo y no publica', () => {
    expect(retro).toContain('sobrante_funcion_respaldo');
    expect(retro).toContain('sobrante_linea_respaldo');
    expect(retro).toContain('posted is true');
    expect(retro).not.toMatch(/drop table\s+public\.sobrante_funcion_respaldo/i);
  });
});
