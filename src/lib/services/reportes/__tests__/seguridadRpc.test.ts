// ============================================================================
// Reportes — ninguna RPC `fn_reporte_*` puede quedar abierta a `anon`
// ============================================================================
// Este test es la red que faltaba el 2026-09-22. Las 21 funciones
// `fn_reporte_*` son `SECURITY DEFINER` y reciben la organización por
// parámetro. Diecinueve de ellas nacieron con `EXECUTE` para `PUBLIC` y `anon`
// y sin comprobar la pertenencia del llamante, así que un `POST` a
// `/rest/v1/rpc/fn_reporte_*` con la sola clave publicable del navegador —la
// que va en el bundle, sin sesión— y un `p_organization_id` arbitrario devolvía
// 200 con las ventas, la caja, la cartera, los impuestos y el inventario de
// cualquiera de las 83 organizaciones. Fuga entre inquilinos.
//
// Peor: la migración `20260922210000` (filtro por sucursal) hizo `DROP` +
// `CREATE` de nueve de ellas y volvió a conceder `TO PUBLIC` y `TO anon`
// explícitamente. Es decir, el agujero se puede reabrir sin mala intención,
// simplemente recreando una función. De ahí este test.
//
// Se lee el estado EFECTIVO del esquema tal y como lo dejan los `.sql` de
// `supabase/migrations/`, aplicados en orden de nombre (que es el orden
// cronológico), y se exige que para toda `fn_reporte_*`:
//
//   1. la última migración que toca sus privilegios le REVOCA `EXECUTE` a
//      `PUBLIC` y a `anon` (y no se lo vuelve a conceder después);
//   2. su última definición lleva la guarda de pertenencia: `EXISTS` sobre
//      `organization_members` con el `auth.uid()` del llamante comparado contra
//      el `p_organization_id` QUE RECIBE —no contra otra cosa—, con
//      `is_active`, y `RAISE EXCEPTION ... ERRCODE = '42501'` cuando no la hay;
//   3. esa guarda está al principio del cuerpo, antes de cualquier consulta:
//      una guarda después de la consulta no impide leer los datos, solo impide
//      devolverlos... y ni eso, si la consulta tiene efectos secundarios.
//
// Si alguien añade una RPC de reportes nueva sin las dos mitades, o recrea una
// existente perdiéndolas, este test se pone rojo. Los casos sintéticos del
// final comprueban que los validadores de verdad rechazan cada variante rota,
// para que el test no se quede en verde por vacío.
// ============================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR_MIGRACIONES = join(__dirname, '../../../../..', 'supabase/migrations');

// ---------------------------------------------------------------------------
// Validadores (exportados para poder probarlos contra SQL sintético)
// ---------------------------------------------------------------------------

/**
 * Extrae el cuerpo completo de cada `CREATE [OR REPLACE] FUNCTION
 * public.fn_reporte_*`, desde el `CREATE` hasta el cierre de su dollar-quote.
 */
export function definicionesDeReportes(sql: string): Map<string, string> {
  const salida = new Map<string, string>();
  const cabecera = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(fn_reporte_\w+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = cabecera.exec(sql)) !== null) {
    const nombre = m[1].toLowerCase();
    // El cuerpo va entre el primer `AS $tag$` posterior y su `$tag$` de cierre.
    const apertura = /\bAS\s+(\$\w*\$)/gi;
    apertura.lastIndex = m.index;
    const a = apertura.exec(sql);
    if (!a) continue;
    const tag = a[1];
    const fin = sql.indexOf(tag, a.index + a[0].length);
    if (fin === -1) continue;
    salida.set(nombre, sql.slice(m.index, fin + tag.length));
  }
  return salida;
}

/**
 * ¿El cuerpo lleva la guarda de pertenencia, comparando contra el
 * `p_organization_id` recibido?
 */
export function tieneGuardaDePertenencia(cuerpo: string): boolean {
  const t = cuerpo.replace(/\s+/g, ' ').toLowerCase();
  return (
    t.includes('organization_members') &&
    // el auth.uid() del llamante, no un valor del cliente
    /om\.user_id\s*=\s*\(\s*select\s+auth\.uid\(\)\s*\)/.test(t) &&
    // y comparado contra el PARÁMETRO, no contra otra organización
    /om\.organization_id\s*=\s*p_organization_id/.test(t) &&
    /om\.is_active\s*=\s*true/.test(t) &&
    // el código de error tiene que ser 42501: el servicio y PostgREST lo
    // traducen a «permission denied» / 401, no a un 500 genérico
    /errcode\s*=\s*'42501'/.test(t)
  );
}

/**
 * ¿La guarda está antes de cualquier consulta? Entre el `BEGIN` del cuerpo y el
 * `IF NOT EXISTS` de la guarda solo se admiten comentarios y líneas en blanco.
 */
export function guardaAlPrincipioDelCuerpo(cuerpo: string): boolean {
  const begin = cuerpo.search(/\nBEGIN\b/i);
  if (begin === -1) return false;
  const tras = cuerpo.slice(begin);
  const guarda = tras.search(/IF\s+NOT\s+EXISTS/i);
  if (guarda === -1) return false;
  const enMedio = tras.slice(tras.indexOf('\n', 1) + 1, guarda);
  return enMedio
    .split('\n')
    .every((linea) => linea.trim() === '' || linea.trim().startsWith('--'));
}

type EstadoAcl = { anonRevocado: boolean; publicRevocado: boolean; ultimaLinea: string };

/**
 * Recorre el SQL en orden y deja, por función, si su última sentencia de
 * privilegios le quita `EXECUTE` a `anon` y a `PUBLIC`, por separado.
 *
 * Se llevan los dos por separado a propósito: revocarle `EXECUTE` a `anon` y
 * dejárselo a `PUBLIC` no cierra nada, porque un privilegio de `PUBLIC` alcanza
 * a todos los roles, `anon` incluido. Y en Postgres una función nace con
 * `EXECUTE` para `PUBLIC`, así que «nunca mencionada» significa «abierta».
 */
export function aclDeReportes(sql: string, previo?: Map<string, EstadoAcl>): Map<string, EstadoAcl> {
  const estado = new Map(previo ?? []);
  const sentencia =
    /(GRANT|REVOKE)\s+EXECUTE\s+ON\s+FUNCTION\s+public\.(fn_reporte_\w+)\s*\([^)]*\)\s*(?:TO|FROM)\s+([^;]+);/gi;
  let m: RegExpExecArray | null;
  while ((m = sentencia.exec(sql)) !== null) {
    const esRevoke = m[1].toUpperCase() === 'REVOKE';
    const nombre = m[2].toLowerCase();
    const roles = m[3].toLowerCase();
    const tocaAnon = /\banon\b/.test(roles);
    const tocaPublic = /\bpublic\b/.test(roles);
    if (!tocaAnon && !tocaPublic) continue;
    const previoFn = estado.get(nombre);
    estado.set(nombre, {
      anonRevocado: tocaAnon ? esRevoke : (previoFn?.anonRevocado ?? false),
      publicRevocado: tocaPublic ? esRevoke : (previoFn?.publicRevocado ?? false),
      ultimaLinea: m[0].replace(/\s+/g, ' ').trim(),
    });
  }
  return estado;
}

// ---------------------------------------------------------------------------
// Estado efectivo del esquema según los .sql del repositorio
// ---------------------------------------------------------------------------

function migracionesEnOrden(): string[] {
  return readdirSync(DIR_MIGRACIONES)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // el prefijo es la marca de tiempo: orden alfabético = cronológico
}

const definicionEfectiva = new Map<string, { cuerpo: string; archivo: string }>();
let aclEfectiva = new Map<string, EstadoAcl>();

for (const archivo of migracionesEnOrden()) {
  const sql = readFileSync(join(DIR_MIGRACIONES, archivo), 'utf8');
  if (!sql.toLowerCase().includes('fn_reporte_')) continue;
  for (const [nombre, cuerpo] of definicionesDeReportes(sql)) {
    definicionEfectiva.set(nombre, { cuerpo, archivo });
  }
  aclEfectiva = aclDeReportes(sql, aclEfectiva);
}

const NOMBRES = [...definicionEfectiva.keys()].sort();

describe('RPC de reportes · ninguna queda abierta a anon', () => {
  test('el repositorio define al menos las 21 fn_reporte_* conocidas', () => {
    // Si este número baja, o la lectura de migraciones deja de encontrar nada,
    // el resto de asserts se volverían vacíos y verdes por accidente.
    expect(NOMBRES.length).toBeGreaterThanOrEqual(21);
  });

  test.each(NOMBRES)('%s tiene REVOKE de EXECUTE a PUBLIC y anon', (nombre) => {
    const acl = aclEfectiva.get(nombre);
    expect({ fn: nombre, acl }).toMatchObject({
      acl: { anonRevocado: true, publicRevocado: true },
    });
  });

  test.each(NOMBRES)('%s lleva la guarda de pertenencia', (nombre) => {
    const { cuerpo, archivo } = definicionEfectiva.get(nombre)!;
    expect({ fn: nombre, archivo, guarda: tieneGuardaDePertenencia(cuerpo) }).toMatchObject({
      guarda: true,
    });
  });

  test.each(NOMBRES)('%s pone la guarda antes de cualquier consulta', (nombre) => {
    const { cuerpo, archivo } = definicionEfectiva.get(nombre)!;
    expect({ fn: nombre, archivo, alPrincipio: guardaAlPrincipioDelCuerpo(cuerpo) }).toMatchObject({
      alPrincipio: true,
    });
  });

  test('conserva EXECUTE para authenticated y service_role', () => {
    // Cerrar de más también es un fallo: el navegador con sesión y el servidor
    // tienen que seguir pudiendo leer sus propios reportes.
    const sql = readFileSync(
      join(DIR_MIGRACIONES, '20260922233000_reportes_cerrar_anon_y_guarda_pertenencia.sql'),
      'utf8',
    );
    const grants = sql.match(
      /grant\s+execute\s+on\s+function\s+public\.fn_reporte_\w+\([^)]*\)\s+to\s+authenticated,\s*service_role;/gi,
    );
    expect(grants).toHaveLength(19);
  });
});

// ---------------------------------------------------------------------------
// Casos sintéticos: los validadores tienen que RECHAZAR cada variante rota.
// Sin esto, un validador que devolviera siempre `true` dejaría el test verde.
// ---------------------------------------------------------------------------

const RPC_NUEVA_CORRECTA = `
begin;
CREATE OR REPLACE FUNCTION public.fn_reporte_nuevo(p_organization_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
BEGIN
  -- Guarda de pertenencia
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = (select auth.uid())
      AND om.organization_id = p_organization_id
      AND om.is_active = true
  ) THEN
    RAISE EXCEPTION 'ORG_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(count(*)) INTO v FROM sales s WHERE s.organization_id = p_organization_id;
  RETURN v;
END;
$function$;

revoke execute on function public.fn_reporte_nuevo(bigint) from public, anon;
grant  execute on function public.fn_reporte_nuevo(bigint) to authenticated, service_role;
commit;
`;

/** Aplica una mutación al SQL de referencia. */
function mutar(de: string, a: string): string {
  const roto = RPC_NUEVA_CORRECTA.replace(de, a);
  if (roto === RPC_NUEVA_CORRECTA) throw new Error(`la mutación no aplicó: ${de}`);
  return roto;
}

function cuerpoDe(sql: string): string {
  return definicionesDeReportes(sql).get('fn_reporte_nuevo')!;
}

describe('RPC de reportes · los validadores rechazan una RPC nueva mal hecha', () => {
  test('la RPC nueva bien hecha pasa los tres validadores', () => {
    const cuerpo = cuerpoDe(RPC_NUEVA_CORRECTA);
    expect(tieneGuardaDePertenencia(cuerpo)).toBe(true);
    expect(guardaAlPrincipioDelCuerpo(cuerpo)).toBe(true);
    expect(aclDeReportes(RPC_NUEVA_CORRECTA).get('fn_reporte_nuevo')).toMatchObject({
      anonRevocado: true,
      publicRevocado: true,
    });
  });

  test('mutación 1 · sin REVOKE: la RPC queda abierta a anon', () => {
    const roto = mutar('revoke execute on function public.fn_reporte_nuevo(bigint) from public, anon;\n', '');
    expect(aclDeReportes(roto).get('fn_reporte_nuevo')).toBeUndefined();
  });

  test('mutación 2 · GRANT a anon después del REVOKE: gana el último', () => {
    const roto = `${RPC_NUEVA_CORRECTA}\ngrant execute on function public.fn_reporte_nuevo(bigint) to anon;`;
    expect(aclDeReportes(roto).get('fn_reporte_nuevo')?.anonRevocado).toBe(false);
  });

  test('mutación 3 · se deja PUBLIC (solo se revoca anon)', () => {
    // Revocar a `anon` sin revocar a PUBLIC no cierra nada: PUBLIC alcanza a
    // todos los roles, `anon` incluido.
    const roto = mutar('from public, anon;', 'from anon;');
    expect(aclDeReportes(roto).get('fn_reporte_nuevo')).toMatchObject({
      anonRevocado: true,
      publicRevocado: false,
    });
  });

  test('mutación 4 · sin guarda de pertenencia', () => {
    const roto = mutar(
      `  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = (select auth.uid())
      AND om.organization_id = p_organization_id
      AND om.is_active = true
  ) THEN
    RAISE EXCEPTION 'ORG_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

`,
      '',
    );
    expect(tieneGuardaDePertenencia(cuerpoDe(roto))).toBe(false);
  });

  test('mutación 5 · la guarda no compara la organización del parámetro', () => {
    // El fallo clásico: se comprueba que el usuario pertenece a ALGUNA
    // organización, no a la que pide. Cualquier usuario con sesión leería
    // cualquier organización.
    const roto = mutar('AND om.organization_id = p_organization_id\n', '');
    expect(tieneGuardaDePertenencia(cuerpoDe(roto))).toBe(false);
  });

  test('mutación 6 · la guarda usa un id del cliente en vez de auth.uid()', () => {
    const roto = mutar('om.user_id = (select auth.uid())', 'om.user_id = p_user_id');
    expect(tieneGuardaDePertenencia(cuerpoDe(roto))).toBe(false);
  });

  test('mutación 7 · excepción con un código distinto de 42501', () => {
    const roto = mutar("ERRCODE = '42501'", "ERRCODE = 'P0001'");
    expect(tieneGuardaDePertenencia(cuerpoDe(roto))).toBe(false);
  });

  test('mutación 8 · la guarda va DESPUÉS de la consulta', () => {
    const guarda = `  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = (select auth.uid())
      AND om.organization_id = p_organization_id
      AND om.is_active = true
  ) THEN
    RAISE EXCEPTION 'ORG_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
`;
    const consulta = `  SELECT to_jsonb(count(*)) INTO v FROM sales s WHERE s.organization_id = p_organization_id;`;
    const roto = RPC_NUEVA_CORRECTA
      .replace(`${guarda}\n`, '')
      .replace(consulta, `${consulta}\n${guarda}`);
    expect(roto).not.toEqual(RPC_NUEVA_CORRECTA);
    const cuerpo = cuerpoDe(roto);
    // La guarda sigue estando (pasa el validador de contenido)…
    expect(tieneGuardaDePertenencia(cuerpo)).toBe(true);
    // …pero llega tarde, y eso es lo que detecta el validador de posición.
    expect(guardaAlPrincipioDelCuerpo(cuerpo)).toBe(false);
  });

  test('mutación 9 · guarda sin is_active: un miembro desactivado seguiría leyendo', () => {
    const roto = mutar('\n      AND om.is_active = true', '');
    expect(tieneGuardaDePertenencia(cuerpoDe(roto))).toBe(false);
  });
});
