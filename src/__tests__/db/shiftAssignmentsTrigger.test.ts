// ============================================================================
// Regresión: el trigger de turnos no vuelve a buscar la organización en
// `employments`
// ============================================================================
// Defecto que salió a producción: NADIE podía crear turnos. El trigger
// `trg_notify_shift_assigned` (AFTER INSERT sobre `shift_assignments`) ejecuta
// `public.fn_notify_shift_assigned()`, y esa función abortaba el INSERT con
//
//   ERROR: 42703: column e.organization_id does not exist
//   CONTEXT: PL/pgSQL function fn_notify_shift_assigned() line 7
//
// `employments` NO tiene `organization_id`: la organización vive en
// `organization_members.organization_id` y la unión correcta es
// `employments.organization_member_id = organization_members.id`.
//
// Había una SEGUNDA referencia rota en el mismo cuerpo: `NEW.date`, cuando la
// columna de `shift_assignments` se llama `work_date`. Sólo se habría visto
// después de arreglar la primera, así que el test la fija también.
//
// Por qué una red estática sobre el `.sql` y no un test contra la base: el
// fallo es de FORMA (qué columnas nombra el cuerpo), no de resultado. Un test
// de resultado exigiría una base con datos y no correría en CI.
//
// Se exige, sobre la migración del arreglo:
//   1. La unión es por `organization_member_id` contra `organization_members.id`.
//   2. No reaparece `e.organization_id` (ni en el SELECT ni en el JOIN).
//   3. La fecha sale de `NEW.work_date`; `NEW.date` no vuelve.
//   4. Se conserva el contrato de la función: `RETURNS trigger`, `LANGUAGE
//      plpgsql`, `SECURITY DEFINER`, `CREATE OR REPLACE` (sin `DROP FUNCTION`,
//      que se llevaría por delante el trigger y la ACL) y SIN `SET search_path`
//      — la función no lo tenía y la migración no debe inventárselo.
//   5. La reversión existe y es real: devuelve el cuerpo roto, no un archivo
//      vacío.
//
// Las mutaciones del final comprueban que cada validador rechaza de verdad su
// variante rota, para que el test no se quede verde por vacío. Cada mutación se
// escribe sobre el archivo REAL (con copia de seguridad previa) y se restaura
// en un `finally`, verificando el md5 contra el original.
// ============================================================================

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..', '..');
const MIGRACION = join(
  RAIZ,
  'supabase/migrations/20260923231500_fn_notify_shift_assigned_organizacion_por_membresia.sql',
);
const ROLLBACK = join(
  RAIZ,
  'supabase/rollbacks/20260923231500_fn_notify_shift_assigned_organizacion_por_membresia_rollback.sql',
);

const md5 = (v: string): string => createHash('md5').update(v, 'utf8').digest('hex');

const leer = (ruta: string): string => readFileSync(ruta, 'utf8');

/**
 * Quita los comentarios `--` antes de validar.
 *
 * La cabecera de la migración EXPLICA el defecto y por eso nombra a propósito
 * `e.organization_id` y `NEW.date`. Sin quitar comentarios, la propia
 * explicación haría fallar los validadores 2 y 3.
 *
 * (Ninguno de los dos archivos tiene `--` dentro de una cadena SQL; si alguna
 * vez lo tuviera, habría que pasar a un tokenizador de verdad.)
 */
function sinComentarios(sql: string): string {
  return sql
    .split('\n')
    .map((linea) => linea.replace(/--.*$/, ''))
    .join('\n');
}

// --- Validadores (funciones puras: se aplican igual al archivo y a sus mutantes)

/** 1. La unión va por `organization_member_id` contra `organization_members.id`. */
function unePorMembresia(sql: string): boolean {
  const cuerpo = sinComentarios(sql);
  return (
    /\bom\.id\s*=\s*e\.organization_member_id\b/i.test(cuerpo) ||
    /\be\.organization_member_id\s*=\s*om\.id\b/i.test(cuerpo)
  );
}

/** 2. `employments` no tiene `organization_id`: no puede reaparecer. */
function sinOrganizationIdEnEmployments(sql: string): boolean {
  return !/\be\.organization_id\b/i.test(sinComentarios(sql));
}

/** 3. La fecha del turno es `work_date`; `NEW.date` no existe. */
function usaWorkDate(sql: string): boolean {
  const cuerpo = sinComentarios(sql);
  return /\bNEW\.work_date\b/i.test(cuerpo) && !/\bNEW\.date\b/i.test(cuerpo);
}

/** 4. Firma, modo de seguridad y forma de despliegue intactos. */
function conservaElContrato(sql: string): boolean {
  const cuerpo = sinComentarios(sql);
  return (
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.fn_notify_shift_assigned\s*\(\s*\)/i.test(cuerpo) &&
    /RETURNS\s+trigger/i.test(cuerpo) &&
    /LANGUAGE\s+plpgsql/i.test(cuerpo) &&
    /SECURITY\s+DEFINER/i.test(cuerpo) &&
    !/DROP\s+FUNCTION/i.test(cuerpo) &&
    !/SET\s+search_path/i.test(cuerpo)
  );
}

// --- El archivo real cumple el contrato

describe('fn_notify_shift_assigned — la organización sale de la membresía', () => {
  it('la migración del arreglo existe', () => {
    expect(existsSync(MIGRACION)).toBe(true);
  });

  it('une employments con organization_members por organization_member_id', () => {
    expect(unePorMembresia(leer(MIGRACION))).toBe(true);
  });

  it('no vuelve a nombrar e.organization_id (la columna no existe)', () => {
    expect(sinOrganizationIdEnEmployments(leer(MIGRACION))).toBe(true);
  });

  it('usa NEW.work_date y no NEW.date', () => {
    expect(usaWorkDate(leer(MIGRACION))).toBe(true);
  });

  it('conserva firma, SECURITY DEFINER, CREATE OR REPLACE y la ausencia de search_path', () => {
    expect(conservaElContrato(leer(MIGRACION))).toBe(true);
  });

  it('la organización de la notificación sale del propio turno (NEW.organization_id)', () => {
    expect(/\bNEW\.organization_id\b/.test(sinComentarios(leer(MIGRACION)))).toBe(true);
  });

  it('la reversión existe y es real: devuelve el cuerpo roto', () => {
    expect(existsSync(ROLLBACK)).toBe(true);
    const rb = leer(ROLLBACK);
    // La reversión SÍ debe contener la forma rota — si no, no revierte nada.
    expect(/\be\.organization_id\b/i.test(sinComentarios(rb))).toBe(true);
    expect(/CREATE\s+OR\s+REPLACE\s+FUNCTION/i.test(sinComentarios(rb))).toBe(true);
  });
});

// --- Mutaciones: cada validador rechaza de verdad su variante rota

interface Mutacion {
  nombre: string;
  muta: (sql: string) => string;
  /** Validador que debe pasar de `true` a `false` con la mutación. */
  validador: (sql: string) => boolean;
}

const MUTACIONES: Mutacion[] = [
  {
    nombre: 'vuelve a unir por e.organization_id (el defecto original)',
    muta: (s) =>
      s.replace(
        /JOIN organization_members om ON om\.id = e\.organization_member_id/,
        'LEFT JOIN organization_members om ON om.organization_id = e.organization_id',
      ),
    validador: unePorMembresia,
  },
  {
    nombre: 'reintroduce e.organization_id en la lista del SELECT',
    muta: (s) => s.replace(/SELECT om\.organization_id, om\.user_id/, 'SELECT e.organization_id, om.user_id'),
    validador: sinOrganizationIdEnEmployments,
  },
  {
    nombre: 'vuelve a NEW.date, que no existe en shift_assignments',
    muta: (s) => s.replace(/NEW\.work_date/g, 'NEW.date'),
    validador: usaWorkDate,
  },
  {
    nombre: 'pierde SECURITY DEFINER',
    muta: (s) => s.replace(/\n\s*SECURITY DEFINER/, ''),
    validador: conservaElContrato,
  },
  {
    nombre: 'cambia CREATE OR REPLACE por DROP + CREATE (se llevaría trigger y ACL)',
    muta: (s) =>
      s.replace(
        /CREATE OR REPLACE FUNCTION public\.fn_notify_shift_assigned\(\)/,
        'DROP FUNCTION public.fn_notify_shift_assigned();\nCREATE FUNCTION public.fn_notify_shift_assigned()',
      ),
    validador: conservaElContrato,
  },
  {
    nombre: 'le inventa un SET search_path que la función no tenía',
    muta: (s) => s.replace(/\n SECURITY DEFINER/, "\n SECURITY DEFINER\n SET search_path TO 'public'"),
    validador: conservaElContrato,
  },
];

describe('mutaciones sobre el .sql real (con copia y restauración verificada)', () => {
  const ORIGINAL = leer(MIGRACION);
  const MD5_ORIGINAL = md5(ORIGINAL);
  const COPIA = join(tmpdir(), `fn_notify_shift_assigned.${process.pid}.bak.sql`);

  beforeAll(() => {
    copyFileSync(MIGRACION, COPIA);
    expect(md5(leer(COPIA))).toBe(MD5_ORIGINAL);
  });

  afterAll(() => {
    // Red de seguridad: pase lo que pase, el archivo del repo queda como estaba.
    writeFileSync(MIGRACION, leer(COPIA), 'utf8');
    expect(md5(leer(MIGRACION))).toBe(MD5_ORIGINAL);
    rmSync(COPIA, { force: true });
  });

  it.each(MUTACIONES.map((m) => [m.nombre, m] as const))('rechaza: %s', (_nombre, mutacion) => {
    const mutado = mutacion.muta(ORIGINAL);
    // La mutación tiene que haber cambiado algo: si no, no prueba nada.
    expect(md5(mutado)).not.toBe(MD5_ORIGINAL);
    // El validador acepta el original...
    expect(mutacion.validador(ORIGINAL)).toBe(true);

    try {
      writeFileSync(MIGRACION, mutado, 'utf8');
      // ...y rechaza al mutante leído del disco real.
      expect(mutacion.validador(leer(MIGRACION))).toBe(false);
    } finally {
      writeFileSync(MIGRACION, leer(COPIA), 'utf8');
    }

    // Restauración verificada por md5, mutación a mutación.
    expect(md5(leer(MIGRACION))).toBe(MD5_ORIGINAL);
  });

  it('el archivo queda idéntico tras todas las mutaciones', () => {
    expect(md5(leer(MIGRACION))).toBe(MD5_ORIGINAL);
  });
});
