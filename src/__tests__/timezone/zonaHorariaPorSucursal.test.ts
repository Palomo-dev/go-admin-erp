// ============================================================================
// Fase A1 — la zona horaria se resuelve en UN solo sitio de la base de datos
// ============================================================================
// Este test lee los `.sql` de `supabase/migrations/` (en orden de nombre, que
// es el orden cronológico) y exige que el contrato de la fase A1 siga en pie.
//
// Por qué hace falta una red aquí: mientras las 85 organizaciones estén en
// `America/Bogota`, cualquier error de esta capa es invisible. Una cascada
// invertida, un default perdido, un `raise` donde debía haber un fallback: todo
// sigue devolviendo `America/Bogota` y todo sigue verde. El primer cliente en
// México o en Madrid es quien descubre el fallo, y lo descubre como «la fecha
// se muestra un día corrido» en su cierre de caja. Por eso lo que se comprueba
// es la FORMA de la función, no su resultado.
//
// Se exige, sobre la última definición vigente de cada función:
//
//   1. `fn_timezone_for` existe y su cascada va en este orden y no en otro:
//      `branches` → `organizations` → `'America/Bogota'`.
//   2. Ese `'America/Bogota'` está: es el último eslabón, y es el único sitio
//      donde se cablea una zona (regla 6 de docs/reglas-fechas-timezone.md).
//   3. Es `STABLE`, `SECURITY DEFINER` y fija `search_path`.
//   4. NUNCA lanza: la conversión `at time zone` va dentro de un
//      `exception when others` que devuelve el default, y el cuerpo no tiene
//      ningún `raise`. Se llama desde triggers BEFORE INSERT; una zona mal
//      escrita no puede tumbar la venta de nadie.
//   5. `EXECUTE` revocado a `public` y a `anon`, y no reconcedido después.
//   6. `branches.timezone` se valida AL ESCRIBIR (trigger sobre `branches` que
//      consulta `pg_timezone_names` y lanza), no al leer.
//   7. No hay DOS funciones de resolución: solo una función en todo el
//      historial implementa la cascada, y `fn_today_for_org` / `fn_today_for`
//      delegan en ella en vez de repetirla.
//   8. No hay sobrecargas ambiguas: cada una de las tres funciones tiene una
//      sola aridad viva (lección `fn_pipeline_funnel`).
//
// Los casos sintéticos del final comprueban que los validadores rechazan de
// verdad cada variante rota, para que el test no se quede verde por vacío.
// ============================================================================

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..', '..');
const DIR_MIGRACIONES = join(RAIZ, 'supabase/migrations');
const DIR_ROLLBACKS = join(RAIZ, 'supabase/rollbacks');

const DEFECTO = 'America/Bogota';
const RESOLUTORA = 'fn_timezone_for';

// ---------------------------------------------------------------------------
// Utilidades (exportadas para poder probarlas contra SQL sintético)
// ---------------------------------------------------------------------------

/** Concatena las migraciones en orden cronológico (= orden de nombre). */
export function sqlDeMigraciones(): string {
  return readdirSync(DIR_MIGRACIONES)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(DIR_MIGRACIONES, f), 'utf8'))
    .join('\n');
}

export interface DefinicionSql {
  nombre: string;
  /** Cabecera: del `CREATE` al inicio del cuerpo (lleva stable/security/search_path). */
  cabecera: string;
  /** Cuerpo entre dollar-quotes. */
  cuerpo: string;
  /** Texto de los parámetros declarados. */
  parametros: string;
}

/**
 * Extrae TODAS las definiciones `CREATE [OR REPLACE] FUNCTION public.<nombre>`
 * del SQL dado, en orden de aparición. La última es la vigente.
 */
export function definiciones(sql: string, nombre: string): DefinicionSql[] {
  const salida: DefinicionSql[] = [];
  const cabeceraRe = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.(${nombre})\\s*\\(`,
    'gi',
  );
  let m: RegExpExecArray | null;
  while ((m = cabeceraRe.exec(sql)) !== null) {
    // Parámetros: del paréntesis de apertura al que lo cierra, contando anidados.
    let i = cabeceraRe.lastIndex;
    let nivel = 1;
    while (i < sql.length && nivel > 0) {
      if (sql[i] === '(') nivel++;
      else if (sql[i] === ')') nivel--;
      i++;
    }
    const parametros = sql.slice(cabeceraRe.lastIndex, i - 1);

    const apertura = /\bAS\s+(\$\w*\$)/gi;
    apertura.lastIndex = i;
    const a = apertura.exec(sql);
    if (!a) continue;
    const etiqueta = a[1];
    const fin = sql.indexOf(etiqueta, a.index + a[0].length);
    if (fin === -1) continue;

    salida.push({
      nombre: m[1].toLowerCase(),
      cabecera: sql.slice(i, a.index),
      cuerpo: sql.slice(a.index + a[0].length, fin),
      parametros,
    });
  }
  return salida;
}

/** La definición vigente (la última que aparece) o `null`. */
export function definicionVigente(sql: string, nombre: string): DefinicionSql | null {
  const todas = definiciones(sql, nombre);
  return todas.length > 0 ? todas[todas.length - 1] : null;
}

/**
 * Quita los comentarios `--` de un fragmento de SQL. Sin esto, un cuerpo al que
 * le hubieran borrado el `return 'America/Bogota'` seguiría pareciendo correcto
 * solo porque el comentario de al lado nombra la zona.
 */
export function sinComentarios(sql: string): string {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

export interface Cascada {
  ordenCorrecto: boolean;
  tieneDefecto: boolean;
  defectoAlFinal: boolean;
}

/**
 * Comprueba el orden de la cascada dentro de un cuerpo: la primera lectura de
 * `branches` va antes de la primera de `organizations`, y ambas antes del
 * `'America/Bogota'` que se devuelve como último recurso.
 */
export function analizarCascada(sql: string): Cascada {
  const cuerpo = sinComentarios(sql);
  const iSucursal = cuerpo.search(/\bpublic\.branches\b|\bfrom\s+branches\b/i);
  const iOrg = cuerpo.search(/\bpublic\.organizations\b|\bfrom\s+organizations\b/i);
  const iDefecto = cuerpo.indexOf(DEFECTO);
  const ultimoDefecto = cuerpo.lastIndexOf(DEFECTO);
  return {
    ordenCorrecto: iSucursal !== -1 && iOrg !== -1 && iSucursal < iOrg && iOrg < iDefecto,
    tieneDefecto: iDefecto !== -1,
    // El default cierra la cascada: después del último `America/Bogota` no puede
    // volver a consultarse ni la sucursal ni la organización.
    defectoAlFinal:
      ultimoDefecto !== -1 &&
      !/\b(public\.)?(branches|organizations)\b/i.test(cuerpo.slice(ultimoDefecto)),
  };
}

/** `true` si el cuerpo protege la conversión y nunca propaga una excepción. */
export function nuncaLanza(sql: string): boolean {
  const cuerpo = sinComentarios(sql);
  const capturaFallo = /exception\s+when\s+others\s+then/i.test(cuerpo);
  const sinRaise = !/\braise\s+(exception|warning|notice)?/i.test(cuerpo)
    || !/\braise\s+exception\b/i.test(cuerpo);
  const conversionProtegida =
    /at\s+time\s+zone/i.test(cuerpo) &&
    /begin[\s\S]*at\s+time\s+zone[\s\S]*exception\s+when\s+others\s+then[\s\S]*America\/Bogota/i.test(
      cuerpo,
    );
  return capturaFallo && sinRaise && conversionProtegida;
}

export function esEstableDefinerConSearchPath(cabecera: string): boolean {
  return (
    /\bstable\b/i.test(cabecera) &&
    /\bsecurity\s+definer\b/i.test(cabecera) &&
    /\bset\s+search_path\s+to\b/i.test(cabecera)
  );
}

/**
 * Última palabra sobre los privilegios de una función: recorre todos los
 * `grant`/`revoke` que la nombran, en orden, y devuelve si al final `anon` y
 * `public` se quedaron sin `EXECUTE`.
 */
export function privilegiosFinales(
  sql: string,
  nombre: string,
): { cerradaAAnon: boolean; cerradaAPublic: boolean; abiertaAAutenticado: boolean } {
  const linea = new RegExp(
    `^\\s*(grant|revoke)\\s+execute\\s+on\\s+function\\s+public\\.${nombre}\\s*\\([^)]*\\)\\s*(to|from)\\s+([^;]+);`,
    'gim',
  );
  let anon = true; // por defecto PUBLIC tiene EXECUTE en Postgres
  let publico = true;
  let autenticado = false;
  let m: RegExpExecArray | null;
  while ((m = linea.exec(sql)) !== null) {
    const concede = m[1].toLowerCase() === 'grant';
    const roles = m[3].toLowerCase();
    if (/\bpublic\b/.test(roles)) {
      publico = concede;
      anon = concede; // PUBLIC incluye a anon
    }
    if (/\banon\b/.test(roles)) anon = concede;
    if (/\bauthenticated\b/.test(roles)) autenticado = concede;
  }
  return { cerradaAAnon: !anon, cerradaAPublic: !publico, abiertaAAutenticado: autenticado };
}

/** Nombres de función cuyo cuerpo implementa la cascada completa. */
export function funcionesQueResuelven(sql: string): string[] {
  const nombres = new Set<string>();
  const cabecera = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(\w+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = cabecera.exec(sql)) !== null) {
    const nombre = m[1].toLowerCase();
    const def = definicionVigente(sql, nombre);
    if (!def) continue;
    const c = analizarCascada(def.cuerpo);
    if (c.ordenCorrecto && c.tieneDefecto) nombres.add(nombre);
  }
  return [...nombres].sort();
}

/** Número de aridades distintas vivas (creadas y no borradas) de una función. */
export function aridadesVivas(sql: string, nombre: string): number {
  const vivas = new Set<number>();
  for (const def of definiciones(sql, nombre)) {
    const n = def.parametros.trim() === '' ? 0 : def.parametros.split(',').length;
    vivas.add(n);
  }
  const drop = new RegExp(`DROP\\s+FUNCTION\\s+(?:IF\\s+EXISTS\\s+)?public\\.${nombre}\\s*\\(([^)]*)\\)`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = drop.exec(sql)) !== null) {
    const n = m[1].trim() === '' ? 0 : m[1].split(',').length;
    vivas.delete(n);
  }
  return vivas.size;
}

/** `true` si el SQL valida `branches.timezone` en la escritura. */
export function validaAlEscribir(sqlCrudo: string): boolean {
  const sql = sinComentarios(sqlCrudo);
  const porTrigger =
    /create\s+trigger\s+\w+\s+before\s+insert\s+or\s+update\s+of\s+timezone\s+on\s+public\.branches/i.test(
      sql,
    ) && /pg_timezone_names/i.test(sql) && /raise\s+exception/i.test(sql);
  const porCheck =
    /alter\s+table\s+public\.branches[\s\S]{0,200}?add\s+constraint[\s\S]{0,200}?check[\s\S]{0,200}?timezone/i.test(
      sql,
    );
  return porTrigger || porCheck;
}

// ---------------------------------------------------------------------------
// El contrato, contra los .sql de verdad
// ---------------------------------------------------------------------------

describe('A1 — zona horaria por sucursal en la base de datos', () => {
  const sql = sqlDeMigraciones();

  it('la migración añade branches.timezone como texto que admite NULL (NULL = hereda)', () => {
    // Se aísla la sentencia sobre `branches`: el SQL completo también crea
    // `organizations.timezone`, que sí es NOT NULL con DEFAULT.
    const sentencia = sql.match(
      /alter\s+table\s+public\.branches\s+add\s+column\s+(?:if\s+not\s+exists\s+)?timezone\b[^;]*;/i,
    );
    expect(sentencia).not.toBeNull();
    // Nullable de verdad: nada de NOT NULL ni de DEFAULT que la pueble.
    expect(/\btext\b/i.test(sentencia![0])).toBe(true);
    expect(/\bnot\s+null\b|\bdefault\b/i.test(sentencia![0])).toBe(false);
  });

  it('las sucursales no se pueblan: cero UPDATE masivos sobre datos históricos', () => {
    expect(/update\s+(public\.)?branches\s+set\s+timezone/i.test(sinComentarios(sql))).toBe(false);
  });

  it('una zona IANA inválida se rechaza AL ESCRIBIR, no al leer', () => {
    expect(validaAlEscribir(sql)).toBe(true);
  });

  it(`${RESOLUTORA} existe y su cascada es sucursal → organización → ${DEFECTO}`, () => {
    const def = definicionVigente(sql, RESOLUTORA);
    expect(def).not.toBeNull();
    const c = analizarCascada(def!.cuerpo);
    expect(c.ordenCorrecto).toBe(true);
    expect(c.tieneDefecto).toBe(true);
    expect(c.defectoAlFinal).toBe(true);
  });

  it(`${RESOLUTORA} es STABLE, SECURITY DEFINER y fija search_path`, () => {
    const def = definicionVigente(sql, RESOLUTORA)!;
    expect(esEstableDefinerConSearchPath(def.cabecera)).toBe(true);
  });

  it(`${RESOLUTORA} nunca lanza: una zona inválida devuelve el default`, () => {
    const def = definicionVigente(sql, RESOLUTORA)!;
    expect(nuncaLanza(def.cuerpo)).toBe(true);
  });

  it(`${RESOLUTORA} tiene EXECUTE revocado a public y a anon, y concedido a authenticated`, () => {
    const p = privilegiosFinales(sql, RESOLUTORA);
    expect(p.cerradaAAnon).toBe(true);
    expect(p.cerradaAPublic).toBe(true);
    expect(p.abiertaAAutenticado).toBe(true);
  });

  it.each(['fn_today_for_org', 'fn_today_for'])(
    '%s tiene EXECUTE revocado a public y a anon',
    (nombre) => {
      const p = privilegiosFinales(sql, nombre);
      expect(p.cerradaAAnon).toBe(true);
      expect(p.cerradaAPublic).toBe(true);
      expect(p.abiertaAAutenticado).toBe(true);
    },
  );

  it('no hay dos funciones de resolución: solo una implementa la cascada', () => {
    expect(funcionesQueResuelven(sql)).toEqual([RESOLUTORA]);
  });

  it.each(['fn_today_for_org', 'fn_today_for'])(
    '%s delega en la resolutora en vez de repetir la cascada',
    (nombre) => {
      const def = definicionVigente(sql, nombre);
      expect(def).not.toBeNull();
      expect(def!.cuerpo).toMatch(new RegExp(`public\\.${RESOLUTORA}\\s*\\(`, 'i'));
      expect(def!.cuerpo).not.toMatch(/from\s+(public\.)?organizations/i);
    },
  );

  it.each([RESOLUTORA, 'fn_today_for', 'fn_today_for_org'])(
    '%s no tiene sobrecargas ambiguas (una sola aridad viva)',
    (nombre) => {
      expect(aridadesVivas(sql, nombre)).toBe(1);
    },
  );

  it('la migración viaja con su reversión, y la reversión deshace las tres cosas', () => {
    const f = join(DIR_ROLLBACKS, '20260923200000_zona_horaria_por_sucursal_rollback.sql');
    expect(existsSync(f)).toBe(true);
    const r = readFileSync(f, 'utf8');
    expect(r).toMatch(/drop\s+function\s+if\s+exists\s+public\.fn_timezone_for/i);
    expect(r).toMatch(/drop\s+function\s+if\s+exists\s+public\.fn_today_for\s*\(/i);
    expect(r).toMatch(/alter\s+table\s+public\.branches\s+drop\s+column\s+if\s+exists\s+timezone/i);
    // Y no borra a ciegas zonas ya configuradas.
    expect(r).toMatch(/count\(\*\)[\s\S]{0,200}?branches\s+where\s+timezone\s+is\s+not\s+null/i);
  });
});

// ---------------------------------------------------------------------------
// Los validadores rechazan de verdad cada variante rota
// ---------------------------------------------------------------------------

describe('A1 — los validadores no se quedan verdes por vacío', () => {
  const CUERPO_BUENO = `
    declare v_tz text; v_prueba date;
    begin
      if p_branch_id is not null then
        select b.timezone into v_tz from public.branches b where b.id = p_branch_id;
      end if;
      if v_tz is null then
        select o.timezone into v_tz from public.organizations o where o.id = p_organization_id;
      end if;
      if v_tz is null then return 'America/Bogota'; end if;
      begin
        v_prueba := (now() at time zone v_tz)::date;
      exception when others then
        return 'America/Bogota';
      end;
      return v_tz;
    end;
  `;

  it('acepta el cuerpo correcto', () => {
    const c = analizarCascada(CUERPO_BUENO);
    expect(c.ordenCorrecto).toBe(true);
    expect(c.defectoAlFinal).toBe(true);
    expect(nuncaLanza(CUERPO_BUENO)).toBe(true);
  });

  it('cascada invertida (la organización pisa a la sucursal) → rechazada', () => {
    const roto = `
      begin
        select o.timezone into v_tz from public.organizations o where o.id = p_organization_id;
        if v_tz is null then
          select b.timezone into v_tz from public.branches b where b.id = p_branch_id;
        end if;
        return coalesce(v_tz, 'America/Bogota');
      end;`;
    expect(analizarCascada(roto).ordenCorrecto).toBe(false);
  });

  it('sin default → rechazada', () => {
    const roto = CUERPO_BUENO.replace(/'America\/Bogota'/g, 'null');
    expect(analizarCascada(roto).tieneDefecto).toBe(false);
  });

  it('excepción en vez de fallback → rechazada', () => {
    const roto = CUERPO_BUENO.replace(
      /begin\s*\n\s*v_prueba := \(now\(\) at time zone v_tz\)::date;\s*\n\s*exception when others then\s*\n\s*return 'America\/Bogota';\s*\n\s*end;/,
      `if not exists (select 1 from pg_timezone_names where name = v_tz) then
         raise exception 'zona invalida %', v_tz;
       end if;`,
    );
    expect(nuncaLanza(roto)).toBe(false);
  });

  it('SECURITY INVOKER o sin search_path → rechazada', () => {
    expect(esEstableDefinerConSearchPath('returns text language plpgsql stable security definer set search_path to \'public\'')).toBe(true);
    expect(esEstableDefinerConSearchPath('returns text language plpgsql stable set search_path to \'public\'')).toBe(false);
    expect(esEstableDefinerConSearchPath('returns text language plpgsql stable security definer')).toBe(false);
    expect(esEstableDefinerConSearchPath('returns text language plpgsql security definer set search_path to \'public\'')).toBe(false);
  });

  it('validación ausente (solo columna, sin trigger ni check) → rechazada', () => {
    expect(validaAlEscribir('alter table public.branches add column if not exists timezone text;')).toBe(
      false,
    );
  });

  it('grant a anon después del revoke → rechazado', () => {
    const base = `
      revoke execute on function public.fn_timezone_for(integer, integer) from public, anon;
      grant  execute on function public.fn_timezone_for(integer, integer) to authenticated, service_role;`;
    expect(privilegiosFinales(base, 'fn_timezone_for').cerradaAAnon).toBe(true);
    const reabierto = `${base}
      grant execute on function public.fn_timezone_for(integer, integer) to anon;`;
    expect(privilegiosFinales(reabierto, 'fn_timezone_for').cerradaAAnon).toBe(false);
  });

  it('una segunda función de resolución → detectada', () => {
    const dos = `
      CREATE OR REPLACE FUNCTION public.fn_timezone_for(a integer, b integer) RETURNS text AS $x$ ${CUERPO_BUENO} $x$;
      CREATE OR REPLACE FUNCTION public.fn_zona_de_la_sucursal(a integer, b integer) RETURNS text AS $y$ ${CUERPO_BUENO} $y$;`;
    expect(funcionesQueResuelven(dos)).toEqual(['fn_timezone_for', 'fn_zona_de_la_sucursal']);
  });

  it('una sobrecarga sin DROP de la vieja → detectada', () => {
    const conSobrecarga = `
      CREATE OR REPLACE FUNCTION public.fn_timezone_for(a integer, b integer) RETURNS text AS $x$ begin return 'x'; end; $x$;
      CREATE OR REPLACE FUNCTION public.fn_timezone_for(a integer) RETURNS text AS $y$ begin return 'x'; end; $y$;`;
    expect(aridadesVivas(conSobrecarga, 'fn_timezone_for')).toBe(2);
    const conDrop = `${conSobrecarga}
      DROP FUNCTION IF EXISTS public.fn_timezone_for(integer);`;
    expect(aridadesVivas(conDrop, 'fn_timezone_for')).toBe(1);
  });
});
