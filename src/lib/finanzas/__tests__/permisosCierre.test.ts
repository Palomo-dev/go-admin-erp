import fs from 'fs';
import path from 'path';
import {
  PERMISO_CERRAR_EJERCICIO,
  PERMISO_CERRAR_PERIODO,
  PERMISO_REABRIR_EJERCICIO,
  PERMISO_REABRIR_PERIODO,
  avisoPeriodo,
  botonesDePeriodo,
} from '@/lib/finanzas/permisosCierre';

const puede = (codigos: string[]) => (codigo: string) => codigos.includes(codigo);

describe('botones de cierre según el permiso', () => {
  const abierto = { status: 'open', period_type: 'monthly' };
  const cerrado = { status: 'closed', period_type: 'monthly' };
  const anualCerrado = { status: 'closed', period_type: 'yearly' };
  const anualAbierto = { status: 'open', period_type: 'yearly' };

  it('sin el permiso no se ve ningún botón', () => {
    expect(botonesDePeriodo(abierto, puede([]), false)).toEqual({ cerrar: false, reabrir: false });
    expect(botonesDePeriodo(cerrado, puede([]), false)).toEqual({ cerrar: false, reabrir: false });
    expect(botonesDePeriodo(anualCerrado, puede([]), false)).toEqual({ cerrar: false, reabrir: false });
  });

  it('mientras cargan los permisos tampoco se ve', () => {
    const todo = puede([
      PERMISO_CERRAR_PERIODO,
      PERMISO_REABRIR_PERIODO,
      PERMISO_CERRAR_EJERCICIO,
      PERMISO_REABRIR_EJERCICIO,
    ]);
    expect(botonesDePeriodo(abierto, todo, true)).toEqual({ cerrar: false, reabrir: false });
    expect(botonesDePeriodo(cerrado, todo, true)).toEqual({ cerrar: false, reabrir: false });
  });

  it('quien solo puede reabrir el período reabre el mes y no cierra ni reabre el ejercicio', () => {
    const solo = puede([PERMISO_REABRIR_PERIODO]);
    expect(botonesDePeriodo(cerrado, solo, false)).toEqual({ cerrar: false, reabrir: true });
    expect(botonesDePeriodo(abierto, solo, false)).toEqual({ cerrar: false, reabrir: false });
    expect(botonesDePeriodo(anualCerrado, solo, false)).toEqual({ cerrar: false, reabrir: false });
    expect(botonesDePeriodo(anualAbierto, solo, false).cerrar).toBe(false);
  });

  it('reabrir el período anual pide el permiso del ejercicio', () => {
    const soloEjercicio = puede([PERMISO_REABRIR_EJERCICIO]);
    expect(botonesDePeriodo(anualCerrado, soloEjercicio, false)).toEqual({ cerrar: false, reabrir: true });
    expect(botonesDePeriodo(cerrado, soloEjercicio, false).reabrir).toBe(false);
  });

  it('con los cuatro permisos cada botón sigue el estado', () => {
    const todo = puede([
      PERMISO_CERRAR_PERIODO,
      PERMISO_REABRIR_PERIODO,
      PERMISO_CERRAR_EJERCICIO,
      PERMISO_REABRIR_EJERCICIO,
    ]);
    expect(botonesDePeriodo(abierto, todo, false)).toEqual({ cerrar: true, reabrir: false });
    expect(botonesDePeriodo(cerrado, todo, false)).toEqual({ cerrar: false, reabrir: true });
    expect(botonesDePeriodo(anualAbierto, todo, false)).toEqual({ cerrar: true, reabrir: false });
    expect(botonesDePeriodo(anualCerrado, todo, false)).toEqual({ cerrar: false, reabrir: true });
  });

  it('un error sin_permiso se explica y no se disfraza de periodo cerrado', () => {
    expect(avisoPeriodo({ message: 'sin_permiso' }, 'Error al cerrar período')).toBe(
      'No tiene permiso para esta acción.',
    );
    expect(avisoPeriodo({ message: 'periodo_no_abierto' }, 'Error')).toBe('Ese periodo no está abierto.');
  });
});

describe('contrato de la migración de permisos de cierre', () => {
  const dir = path.join(process.cwd(), 'supabase/migrations');
  const archivos = fs.readdirSync(dir).filter((nombre) => nombre.includes('permisos_cierre')).sort();

  it('el archivo existe y cada función pide su código, no el rol ni accounting.reverse', () => {
    expect(archivos).toEqual([
      '20261022144327_permisos_cierre_contable.sql',
      '20261022144501_permisos_cierre_ejercicio.sql',
      '20261022144519_permisos_cierre_informe.sql',
    ]);
    const sql = archivos.map((nombre) => fs.readFileSync(path.join(dir, nombre), 'utf8')).join('\n');
    const trozo = (desde: string, hasta: string) => sql.slice(sql.indexOf(desde), sql.indexOf(hasta));

    const periodo = trozo('function public.fn_cierre_periodo', 'function public.fn_reabrir_periodo');
    expect(periodo).toContain("fn_exigir_permiso_contable(p_organization_id, 'accounting.period.close')");
    expect(periodo).not.toContain('accounting.reverse');
    expect(periodo).not.toContain('role_id');

    const reabrir = trozo('function public.fn_reabrir_periodo', 'function public.fn_cierre_ejercicio');
    expect(reabrir).toContain("'accounting.period.reopen'");
    expect(reabrir).toContain("'accounting.fiscal_year.reopen'");
    expect(reabrir).not.toContain('accounting.reverse');
    expect(reabrir).not.toContain('role_id');

    const ejercicio = trozo('function public.fn_cierre_ejercicio', 'function public.fn_cierre_firmar');
    expect(ejercicio).toContain("fn_exigir_permiso_contable(p_organization_id, 'accounting.fiscal_year.close')");
    expect(ejercicio).not.toContain('accounting.reverse');
    expect(ejercicio).not.toContain('role_id');

    const guarda = trozo('function public.fn_exigir_permiso_contable', 'function public.fn_auditar_cierre_contable');
    expect(guarda).toContain('check_user_permission');
    expect(guarda).not.toContain('role_id');
    expect(guarda).not.toContain('fn_finanzas_exigir_permiso');

    expect(sql).toContain("'Cerrar período contable'");
    expect(sql).toContain("'Reabrir período contable'");
    expect(sql).toContain("'Cerrar ejercicio contable'");
    expect(sql).toContain("'Reabrir ejercicio contable'");
    expect(sql).toContain('fn_auditar_cierre_contable');
    expect(sql).toContain('finance_audit_log');
  });
});

describe('las pantallas no cierran el período por un update directo', () => {
  const leer = (ruta: string) => fs.readFileSync(path.join(process.cwd(), ruta), 'utf8');

  it('los botones salen de botonesDePeriodo y el servicio usa las RPC', () => {
    for (const ruta of [
      'src/components/finanzas/contabilidad/periodos-fiscales/PeriodosFiscalesPage.tsx',
      'src/components/finanzas/periodos-contables/PeriodosContablesPage.tsx',
    ]) {
      const pagina = leer(ruta);
      expect(pagina).toContain('botonesDePeriodo');
      expect(pagina).toContain('acciones.cerrar');
      expect(pagina).toContain('acciones.reabrir');
      expect(pagina).toContain('formatPlainDate(periodo.start_date)');
      expect(pagina).toContain('formatPlainDate(periodo.end_date)');
    }
    const fiscal = leer('src/components/finanzas/contabilidad/periodos-fiscales/PeriodosFiscalesPage.tsx');
    expect(fiscal).toContain('PERMISO_CERRAR_EJERCICIO');
    const servicio = leer('src/components/finanzas/periodos-contables/PeriodosContablesService.ts');
    expect(servicio).toContain("rpc('fn_cierre_periodo'");
    expect(servicio).toContain("rpc('fn_reabrir_periodo'");
    expect(servicio).not.toContain("status: 'closed'");
  });
});
