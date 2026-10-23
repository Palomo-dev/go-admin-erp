/**
 * Carga inicial: 1.000 × 3.800 = 3.800.000 en inventario contra saldos iniciales.
 * El sobrante acredita recuperaciones. La compra sin orden no arma asiento.
 */
import fs from 'fs';
import path from 'path';
import {
  CUENTA_INVENTARIO_COMERCIO,
  CUENTA_INVENTARIO_RESTAURANTE,
  CUENTA_RECUPERACIONES,
  CUENTA_SALDO_INICIAL,
  RUTA_FACTURA_COMPRA,
  asientoCargaInicial,
  asientoPorTotal,
  costoParecePrecio,
  creditoDelAjuste,
  cuentaInventarioPorTipo,
  debeAvisarSaldoInicial,
  debeConfirmarAjuste,
  sugerirCompraPorNegativo,
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

  test('restaurante usa 1405; una cuenta configurada gana, también en manufactura', () => {
    expect(cuentaInventarioPorTipo(1)).toBe(CUENTA_INVENTARIO_RESTAURANTE);
    expect(cuentaInventarioPorTipo(3)).toBe(CUENTA_INVENTARIO_COMERCIO);
    expect(cuentaInventarioPorTipo(null, '143505')).toBe('143505');
    const asiento = asientoCargaInicial({
      unidades: 2,
      costo: 1500.4,
      cuentaInventario: cuentaInventarioPorTipo(1, '140501'),
      cuentaSaldo: '310505',
    });
    expect(asiento.total).toBe(3001);
    expect(asiento.lineas[0]).toMatchObject({ cuenta: '140501', debito: 3001 });
    expect(asiento.lineas[1]).toMatchObject({ cuenta: '310505', credito: 3001 });
  });

  test('un total ya sumado no toca 4250', () => {
    const asiento = asientoPorTotal({ total: 3_800_000.4 });
    expect(asiento.total).toBe(3_800_000);
    expect(asiento.lineas.map((l) => l.cuenta)).toEqual(['1435', '3105']);
  });
});

describe('motivo del ajuste de ganancia', () => {
  test('saldo inicial acredita 3105 y el sobrante de conteo, auditoría o producción acredita 4250', () => {
    expect(creditoDelAjuste('saldo_inicial')).toEqual({ tipo: 'saldo_inicial', cuenta: '3105' });
    expect(creditoDelAjuste('initial_setup')).toEqual({ tipo: 'saldo_inicial', cuenta: '3105' });
    for (const motivo of ['physical_count', 'audit', 'production_input', 'produccion_propia', 'sobrante']) {
      expect(creditoDelAjuste(motivo)).toEqual({ tipo: 'recuperacion', cuenta: '4250' });
    }
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
