/**
 * Contrato de las migraciones de B6a (§5.0 del plan de inventario): cada
 * `.sql` tiene su rollback; toda función SECURITY DEFINER pública exige
 * permiso de inventario (que valida antes la pertenencia) y se le quita
 * EXECUTE a anon y public en la misma migración; las internas no se exponen.
 */
import fs from 'fs';
import path from 'path';

const RAIZ = path.resolve(__dirname, '../../../..');
const MIGRACIONES = path.join(RAIZ, 'supabase', 'migrations');
const ROLLBACKS = path.join(RAIZ, 'supabase', 'rollbacks');
const archivos = fs.readdirSync(MIGRACIONES).filter((f) => /_inv_b6a_/.test(f));

const sinComentarios = (sql: string) => sql.replace(/--.*$/gm, '');

interface Funcion {
  nombre: string;
  firma: string;
  cuerpo: string;
  definer: boolean;
}

function funciones(sql: string): Funcion[] {
  const out: Funcion[] = [];
  const re = /create\s+or\s+replace\s+function\s+public\.(\w+)\s*\(([\s\S]*?)\)\s*returns[\s\S]*?\$\$([\s\S]*?)\$\$/gi;
  for (const m of sinComentarios(sql).matchAll(re)) {
    const cabecera = m[0].slice(0, m[0].indexOf('$$'));
    out.push({ nombre: m[1], firma: m[2], cuerpo: m[3], definer: /security\s+definer/i.test(cabecera) });
  }
  return out;
}

describe('migraciones B6a', () => {
  it('existen y cada una tiene su rollback', () => {
    expect(archivos.length).toBeGreaterThanOrEqual(6);
    const sinRollback = archivos.filter((f) => !fs.existsSync(path.join(ROLLBACKS, f.replace(/\.sql$/, '_rollback.sql'))));
    expect(sinRollback).toEqual([]);
  });

  it('toda función DEFINER pública exige permiso de inventario y revoca anon/public', () => {
    const malas: string[] = [];
    for (const f of archivos) {
      const sql = sinComentarios(fs.readFileSync(path.join(MIGRACIONES, f), 'utf8'));
      for (const fn of funciones(sql)) {
        if (!fn.definer || fn.nombre.includes('_int_')) continue;
        const exige = /fn_inventario_exigir_permiso|fn_inventario_permisos/.test(fn.cuerpo);
        const comoActor = fn.nombre === 'fn_variantes_como_actor';
        if (!exige && !comoActor) malas.push(`${f}: ${fn.nombre} no exige permiso`);
        const revoca = new RegExp(`revoke all on function public\\.${fn.nombre}\\([^)]*\\) from public, anon`, 'i').test(sql);
        if (!revoca) malas.push(`${f}: ${fn.nombre} sin revoke a anon/public`);
      }
    }
    expect(malas).toEqual([]);
  });

  it('fn_variantes_como_actor solo la ejecuta service_role', () => {
    const sql = sinComentarios(fs.readFileSync(path.join(MIGRACIONES, archivos.find((f) => f.includes('desde_servidor'))!), 'utf8'));
    expect(sql).toMatch(/revoke all on function public\.fn_variantes_como_actor\([^)]*\) from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.fn_variantes_como_actor\([^)]*\) to service_role/i);
    expect(sql).not.toMatch(/grant execute on function public\.fn_variantes_como_actor\([^)]*\) to authenticated/i);
  });

  it('los ayudantes internos no quedan para authenticated', () => {
    const malas: string[] = [];
    for (const f of archivos) {
      const sql = sinComentarios(fs.readFileSync(path.join(MIGRACIONES, f), 'utf8'));
      for (const fn of funciones(sql).filter((x) => x.nombre.includes('_int_'))) {
        const revoca = new RegExp(`revoke all on function public\\.${fn.nombre}\\([^)]*\\) from public, anon, authenticated`, 'i').test(sql);
        if (!revoca) malas.push(`${f}: ${fn.nombre}`);
        if (new RegExp(`grant execute on function public\\.${fn.nombre}\\(`, 'i').test(sql)) malas.push(`${f}: ${fn.nombre} con grant`);
      }
    }
    expect(malas).toEqual([]);
  });

  it('ninguna migración de B6a borra columnas o tablas con datos de clientes', () => {
    for (const f of archivos) {
      const sql = sinComentarios(fs.readFileSync(path.join(MIGRACIONES, f), 'utf8'));
      expect({ f, drop: /drop\s+(table|column)/i.test(sql) }).toEqual({ f, drop: false });
    }
  });
});
