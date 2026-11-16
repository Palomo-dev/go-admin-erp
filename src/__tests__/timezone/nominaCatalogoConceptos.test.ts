/**
 * Catálogo de conceptos de nómina: el motor (conceptos.ts) y la semilla vigente de la base
 * deben tener las mismas banderas y cuentas (ADR-003 §2), y las cuentas son las que fijó el
 * Contador el 2026-11-16 (docs/contador/RESPUESTAS-CONTADOR-NOMINA-2026-11-16.md, §4).
 */
import { CATALOGO_BASE, FILAS_CATALOGO_BASE } from '@/lib/hrm/nomina/conceptos';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'supabase', 'migrations');
const MARCADOR = 'catalogo-nomina: semilla vigente';

/** Migraciones en orden de aplicación (el nombre empieza por la versión). */
function migraciones(): string[] {
  return readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
}

/** La última migración que contiene `texto`. */
function ultimaCon(texto: string): { archivo: string; sql: string } {
  const archivo = migraciones().reverse().find((f) => readFileSync(join(DIR, f), 'utf8').includes(texto));
  if (!archivo) throw new Error(`ninguna migración contiene «${texto}»`);
  return { archivo, sql: readFileSync(join(DIR, archivo), 'utf8') };
}

/** Bloque de la semilla: del marcador al alias de columnas del VALUES. */
function bloqueSemilla(): string {
  const { sql } = ultimaCon(MARCADOR);
  const i = sql.indexOf(MARCADOR);
  const fin = sql.indexOf(') as v(code', i);
  expect(fin).toBeGreaterThan(i);
  return sql.slice(i, fin);
}

/** Cuerpo de la última definición de una función. */
function cuerpoFuncion(nombre: string): string {
  const firma = `create or replace function public.${nombre}(`;
  const { sql } = ultimaCon(firma);
  const i = sql.indexOf(firma);
  const fines = ['\n$$;', '\n$function$;'].map((t) => sql.indexOf(t, i)).filter((x) => x > 0);
  return sql.slice(i, fines.length ? Math.min(...fines) : undefined);
}

const b = (x: boolean) => (x ? 'true' : 'false');
const q = (x: string | null) => (x === null ? 'null' : `'${x}'`);

describe('catálogo de conceptos de nómina', () => {
  test('el catálogo base del motor es la semilla vigente de la base, fila por fila', () => {
    const bloque = bloqueSemilla();
    for (const [codigo, nombre, tipo, salarial, ss, c40, prest, ret, paraf, deb, cred, dian] of FILAS_CATALOGO_BASE) {
      const i = bloque.indexOf(`('${codigo}', `);
      expect({ codigo, encontrado: i >= 0 }).toEqual({ codigo, encontrado: true });
      const linea = bloque.slice(i, bloque.indexOf('\n', i));
      expect(linea).toContain(
        `'${nombre}', '${tipo}', ${b(salarial)}, ${b(ss)}, ${b(c40)}, ${b(prest)}, ${b(ret)}, ${b(paraf)}, ${q(deb)}, ${q(cred)}, ${q(dian)})`,
      );
    }
    // Ni más ni menos filas que el catálogo del motor.
    const filas = bloque.split('\n').filter((l) => /^\s+\('[A-Z][A-Z0-9_]+', /.test(l));
    expect(filas).toHaveLength(FILAS_CATALOGO_BASE.length);
    expect(Object.keys(CATALOGO_BASE)).toHaveLength(FILAS_CATALOGO_BASE.length);
  });

  test('la semilla vigente actualiza la fila de plataforma y no toca las de organización', () => {
    const { sql } = ultimaCon(MARCADOR);
    expect(sql).toMatch(/on conflict \(organization_id, code\) do update/);
    expect(sql).toMatch(/where public\.hr_payroll_concepts\.organization_id is null;/);
  });
});

describe('cuentas del Contador (C1)', () => {
  const cuenta = (codigo: string) => {
    const c = CATALOGO_BASE[codigo];
    return [c.cuenta_debito, c.cuenta_credito];
  };

  test.each([
    ['SALARIO', '510506', null],
    ['SALARIO_INTEGRAL', '510503', null],
    ['HORA_EXTRA_NOCTURNA', '510515', null],
    ['RECARGO_DOMINICAL', '510515', null],
    ['COMISIONES', '510518', null],
    ['BONIFICACION_SALARIAL', '510548', null],
    ['BONIFICACION_NO_SALARIAL', '510548', null],
    ['AUXILIO_TRANSPORTE', '510527', null],
    ['AUXILIO_NO_SALARIAL', '510545', null],
    ['INCAPACIDAD_COMUN', '510524', null],
    ['INCAPACIDAD_POR_COBRAR', '138095', null],
    ['SALUD_EMPLEADO', null, '237005'],
    ['PENSION_EMPLEADO', null, '238030'],
    ['FONDO_SOLIDARIDAD', null, '238030'],
    ['RETENCION_FUENTE', null, '236505'],
    ['EMBARGO_ALIMENTOS', null, '237025'],
    ['EMBARGO_COOPERATIVA', null, '237025'],
    ['EMBARGO_ORDINARIO', null, '237025'],
    ['LIBRANZA', null, '237030'],
    ['CUOTA_SINDICAL', null, '237035'],
    ['APORTE_COOPERATIVA', null, '237040'],
    ['FONDO_EMPLEADOS', null, '237045'],
    ['OTRO_DESCUENTO', null, '237095'],
    ['PRESTAMO', null, '136595'],
    ['SALUD_EMPLEADOR', '510569', '237005'],
    ['PENSION_EMPLEADOR', '510570', '238030'],
    ['ARL', '510568', '237006'],
    ['CAJA_COMPENSACION', '510572', '237010'],
    ['ICBF', '510575', '237010'],
    ['SENA', '510578', '237010'],
    ['PROVISION_CESANTIAS', '510530', '2510'],
    ['PROVISION_INTERESES', '510533', '2515'],
    ['PROVISION_PRIMA', '510536', '2520'],
    ['PROVISION_VACACIONES', '510539', '2525'],
    ['CESANTIAS_CONSIGNAR', '2510', '2510'],
  ])('%s → débito %s, crédito %s', (codigo, debito, credito) => {
    expect(cuenta(codigo)).toEqual([debito, credito]);
  });

  test('ningún concepto usa 2380 (acreedores varios) ni 2610: solo 238030 para pensión', () => {
    for (const c of Object.values(CATALOGO_BASE)) {
      for (const x of [c.cuenta_debito, c.cuenta_credito]) {
        if (x === null) continue;
        expect({ codigo: c.codigo, cuenta: x, prohibida: (x.startsWith('2380') && x !== '238030') || x.startsWith('2610') }).toEqual({
          codigo: c.codigo,
          cuenta: x,
          prohibida: false,
        });
      }
    }
  });

  test('todo gasto de personal está en el grupo 5105 (la contabilización lo lleva a 5205 o 7205 según el área)', () => {
    for (const c of Object.values(CATALOGO_BASE)) {
      if (c.cuenta_debito?.startsWith('5')) expect({ codigo: c.codigo, cuenta: c.cuenta_debito.slice(0, 4) }).toEqual({ codigo: c.codigo, cuenta: '5105' });
    }
  });
});

describe('contabilización de la nómina (migración vigente)', () => {
  const asentar = cuerpoFuncion('fn_hr_nomina_asentar');

  test('C1: lo que paga la EPS, la ARL o el fondo va a la cuenta por cobrar con la entidad, no al gasto', () => {
    expect(asentar).toContain("it.metadata->>'paga' in ('eps', 'arl', 'fondo_pensiones')");
    expect(asentar).toContain("v_conceptos->'INCAPACIDAD_POR_COBRAR'->>'cuenta_debito'");
  });

  test('C1: préstamos por tipo (vivienda, vehículo, educación, calamidad) y 136595 por defecto', () => {
    expect(asentar).toMatch(/when 'housing' then '136505'/);
    expect(asentar).toMatch(/when 'education' then '136515'/);
    expect(asentar).toMatch(/when 'calamity' then '136525' else '136595'/);
  });

  test('C1: el pago sin cuenta contable del banco va a rechazos; nunca a la 1110 genérica', () => {
    expect(asentar).toContain("'banco_sin_cuenta'");
    expect(asentar).not.toContain("'1110'");
    expect(asentar).not.toContain('fn_money_account_code');
  });

  test('C2: el gasto pasa por el área del empleado', () => {
    expect(asentar).toContain('fn_hr_nomina_cuenta_area');
    const area = cuerpoFuncion('fn_hr_nomina_cuenta_area');
    expect(area).toContain("'5205' || substr(p_cuenta, 5)");
    expect(area).toContain("'7205' || substr(p_cuenta, 5)");
  });

  test('C3: las líneas de 1365, 1380, 2365, 2370, 2380, 2505 y 2510–2525 exigen tercero con NIT', () => {
    expect(asentar).toContain("array['1365', '1380', '2365', '2370', '2380', '2505', '2510', '2515', '2520', '2525']");
    expect(asentar).toContain("'tercero_requerido'");
    expect(asentar).toMatch(/insert into public\.journal_lines \([^)]*tercero_nit, tercero_nombre\)/);
  });

  test('C5: el faltante de la provisión va al gasto en el mismo asiento', () => {
    expect(asentar).toContain("'Faltante de provisión'");
    expect(asentar).toMatch(/v_faltante := greatest\(v_consumo - greatest\(v_disponible, 0\), 0\)/);
  });

  test('una cuenta sin movimiento manda el asiento entero a rechazos (sin asiento parcial)', () => {
    expect(asentar).toContain("'cuenta_no_es_de_movimiento'");
    expect(asentar.indexOf('fn_log_journal_failure')).toBeLessThan(asentar.indexOf('insert into public.journal_entries'));
  });

  test('C6: pagar el período no deja el rechazo «criterio_contador»', () => {
    expect(cuerpoFuncion('fn_auto_journal_payroll_period')).not.toContain("'criterio_contador'");
  });

  test('ronda 3: las líneas de gasto llevan al empleado de tercero', () => {
    expect(asentar).toMatch(/if v_cuenta ~ '\^\[57\]' then\s+v_nit := v_emp_nit;\s+v_nom := v_emp_nombre;/);
  });

  test('ronda 3: la incapacidad laboral va a la cuenta por cobrar con la ARL, aunque el tramo diga empleador', () => {
    expect(asentar).toContain("or it.code = 'INCAPACIDAD_LABORAL' then");
    expect(asentar).toContain("when it.code = 'INCAPACIDAD_LABORAL' then 'arl'");
  });

  test('ronda 3: la línea del fondo de cesantías conserva la identificación del empleado', () => {
    expect(asentar).toMatch(/when it\.code = 'CESANTIAS_CONSIGNAR'\s+then it\.name \|\| ' · ' \|\| coalesce\(v_emp_nombre/);
  });

  test('ronda 3 (a)–(d): subcuentas PUC solo al encender, con vista previa aprobada, sin sobrescribir', () => {
    const plan = cuerpoFuncion('fn_hr_nomina_preparar_plan');
    expect(plan).toContain("'plan_solo_al_encender");
    expect(plan).toContain("'falta_cuenta_mayor'");
    expect(plan).toContain('fn_puc_asegurar_cuenta(p_org, r.cta, v_nombre, true)');
    expect(plan).toMatch(/Existe pero sin movimiento[\s\S]*v_estado := 'no_se_crea'/);
    const habilitar = cuerpoFuncion('fn_hr_nomina_habilitar');
    expect(habilitar).toContain("'vista_previa_sin_aprobar");
    expect(habilitar).toContain("'vista_previa_desactualizada");
    expect(habilitar).toContain("'terceros_incompletos");
    expect(habilitar.indexOf("'terceros_incompletos")).toBeLessThan(habilitar.indexOf('fn_hr_nomina_preparar_plan(p_org, true)'));
    expect(cuerpoFuncion('fn_hr_nomina_plan_aprobar')).toContain('aprobada_contador_por');
  });

  test('ronda 3 (C5): ajuste anual de provisiones y bloqueo del año siguiente', () => {
    const ajuste = cuerpoFuncion('fn_hr_nomina_ajuste_anual_provisiones');
    expect(ajuste).toContain("'falta_periodo_cesantias");
    expect(ajuste).toContain("'falta_valor_vacaciones");
    expect(ajuste).toContain("time '23:00'");
    expect(cuerpoFuncion('fn_hr_nomina_exigir_ajuste_anual')).toContain("'ajuste_anual_pendiente");
  });

  test('las migraciones de cuentas no usan CURRENT_DATE ni cablean la zona horaria', () => {
    for (const f of migraciones().filter((x) => /_hrm_f3_0\d_nomina_(cuentas_contador|embargo_fusion|preparar_plan_areas|ronda3_cuentas)\.sql$/.test(x))) {
      const sql = readFileSync(join(DIR, f), 'utf8');
      expect({ f, current_date: /current_date|now\(\)::date/i.test(sql), bogota: sql.includes('America/Bogota') }).toEqual({
        f,
        current_date: false,
        bogota: false,
      });
    }
  });
});
