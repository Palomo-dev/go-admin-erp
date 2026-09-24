// ============================================================================
// Regresión: una organización nueva nace con embudo de ventas y etapa ganadora
// ============================================================================
// F-74 · La causa raíz de F-66. El síntoma de F-66 fue que 23 leads del
// formulario web de una organización acabaron en su embudo de «Onboarding»; la
// corrección hizo que el lead se dirija al embudo de tipo `sales` o no se cree.
// Pero esa organización NO TENÍA embudo de ventas, y no era una excepción:
// medido el 2026-09-23 sobre 85 organizaciones, 77 no tienen ninguno y de las
// 8 creadas entre el 2026-08-26 y el 2026-09-23 no lo tiene NINGUNA.
//
// El alta de una organización dispara 18 triggers (sucursal, 13 periodos
// fiscales, 48 cuentas, 6 departamentos, `comm_settings`, `website_settings`,
// módulos `is_core`…) y ninguno sembraba un embudo. `fn_crm_seed_defaults`
// siembra diez tablas de configuración del CRM y tampoco. El único sitio que
// creaba embudos al activar el CRM era `src/app/api/modules/route.ts`, y creaba
// `onboarding` y `renewal` — nunca `sales`.
//
// Por qué una red estática sobre el `.sql` y no un test contra la base: igual
// que en `sucursalYPipelinePorInquilino.test.ts`, el fallo es de FORMA (qué
// siembra la migración y con qué guardas), no de resultado. La prueba de
// comportamiento se hizo con `DO … RAISE EXCEPTION` en transacción abortada,
// creando organizaciones dentro de la transacción, y está en
// `docs/hallazgos/F-74.md`.
//
// Las mutaciones del final se escriben sobre los archivos REALES (con copia de
// la ruta completa) y se restauran verificando el md5.
// ============================================================================

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { PIPELINE_TEMPLATES } from '@/lib/services/crm/pipelineTemplates';

const RAIZ = join(__dirname, '..', '..', '..');

const MIG = join(
  RAIZ,
  'supabase/migrations/20260924000500_aprovisionamiento_embudo_de_ventas_por_organizacion.sql',
);
const RB = join(
  RAIZ,
  'supabase/rollbacks/20260924000500_aprovisionamiento_embudo_de_ventas_por_organizacion_rollback.sql',
);

const md5 = (v: string): string => createHash('md5').update(v, 'utf8').digest('hex');
const leer = (ruta: string): string => readFileSync(ruta, 'utf8');

/**
 * Quita los comentarios `--`. La cabecera de la migración EXPLICA el defecto y
 * cita a propósito `onboarding`, `renewal` y `fn_crm_seed_defaults`: sin quitar
 * comentarios la propia explicación haría fallar a los validadores.
 */
function sinComentarios(sql: string): string {
  return sql
    .split('\n')
    .map((linea) => linea.replace(/--.*$/, ''))
    .join('\n');
}

/** Cuerpo `$fn$…$fn$` de una función concreta de esta migración. */
function cuerpoDe(sql: string, nombre: string): string {
  const re = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${nombre}\\s*\\([\\s\\S]*?AS \\$fn\\$([\\s\\S]*?)\\$fn\\$`,
  );
  const m = re.exec(sinComentarios(sql));
  return m ? m[1] : '';
}

/** Las filas de la tabla VALUES de etapas, ya parseadas. */
interface EtapaSembrada {
  name: string;
  position: number;
  probability: number;
  color: string;
  slaDays: number | null;
  isWon: boolean;
  isLost: boolean;
}

function etapasSembradas(sql: string): EtapaSembrada[] {
  const cuerpo = cuerpoDe(sql, 'fn_crm_seed_pipeline_ventas');
  const filas = cuerpo.match(
    /\(\s*'([^']+)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'(#[0-9a-f]{6})'\s*,\s*(\d+|NULL)\s*,\s*(true|false)\s*,\s*(true|false)\s*\)/gi,
  );
  if (!filas) return [];
  return filas.map((f) => {
    const m =
      /\(\s*'([^']+)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'(#[0-9a-f]{6})'\s*,\s*(\d+|NULL)\s*,\s*(true|false)\s*,\s*(true|false)\s*\)/i.exec(
        f,
      ) as RegExpExecArray;
    return {
      name: m[1],
      position: Number(m[2]),
      probability: Number(m[3]),
      color: m[4],
      slaDays: /^null$/i.test(m[5]) ? null : Number(m[5]),
      isWon: m[6].toLowerCase() === 'true',
      isLost: m[7].toLowerCase() === 'true',
    };
  });
}

// --- Validadores (funciones puras: valen para el archivo y para sus mutantes)

/**
 * 1. La siembra se dispara sola, en la base, por las DOS vías: el alta de la
 *    organización y la activación del módulo. Que la aplicación la llame no
 *    cuenta: un lead del formulario web no pasa por ninguna ruta de Next.
 */
function seDisparaSolaPorLasDosVias(sql: string): boolean {
  const cuerpo = sinComentarios(sql);
  return (
    /CREATE\s+TRIGGER\s+trg_seed_crm_pipeline_on_org\s+AFTER\s+INSERT\s+ON\s+public\.organizations/i.test(cuerpo) &&
    /CREATE\s+TRIGGER\s+trg_seed_crm_pipeline_on_module\s+AFTER\s+INSERT\s+OR\s+UPDATE\s+OF\s+is_active\s+ON\s+public\.organization_modules/i.test(
      cuerpo,
    )
  );
}

/** 2. El embudo sembrado es de VENTAS, con `pipeline_type` explícito. */
function siembraUnEmbudoDeVentas(sql: string): boolean {
  const cuerpo = cuerpoDe(sql, 'fn_crm_seed_pipeline_ventas');
  return (
    /INSERT\s+INTO\s+public\.pipelines\s*\([^)]*pipeline_type[^)]*\)/i.test(cuerpo) &&
    /VALUES\s*\(\s*p_org_id\s*,\s*'[^']+'\s*,\s*'sales'/i.test(cuerpo) &&
    /coalesce\s*\(\s*p\.pipeline_type\s*,\s*'sales'\s*\)\s*=\s*'sales'/i.test(cuerpo)
  );
}

/**
 * 3. Hay UNA etapa ganadora (`is_won`) y UNA perdedora (`is_lost`), y no la
 *    misma. Sin `is_won` no se puede cerrar una oportunidad como ganada:
 *    `opportunitiesService.getWonStage` filtra por `is_won = true`.
 */
function tieneEtapaGanadoraYPerdedora(sql: string): boolean {
  const etapas = etapasSembradas(sql);
  if (etapas.length < 2) return false;
  const ganadoras = etapas.filter((e) => e.isWon);
  const perdedoras = etapas.filter((e) => e.isLost);
  return (
    ganadoras.length === 1 &&
    perdedoras.length === 1 &&
    ganadoras[0].name !== perdedoras[0].name &&
    ganadoras[0].probability === 100 &&
    perdedoras[0].probability === 0
  );
}

/**
 * 4. `probability` va en PORCENTAJE 0-100 (CHECK `stages_probability_range`),
 *    no en fracción 0-1. El error clásico es escribir 0.9 en vez de 90: con
 *    enteros, 0.9 se guardaría como 1 y el pronóstico saldría a cero.
 */
function probabilidadEnPorcentaje(sql: string): boolean {
  const etapas = etapasSembradas(sql);
  if (etapas.length === 0) return false;
  return (
    etapas.every((e) => Number.isInteger(e.probability) && e.probability >= 0 && e.probability <= 100) &&
    etapas.filter((e) => e.probability > 1).length >= etapas.length - 2
  );
}

/**
 * 5. Idempotente: ni el embudo ni las etapas se insertan sin guarda. El
 *    disparador del módulo se ejecuta en cada activación y el de la
 *    organización puede convivir con una siembra retroactiva.
 */
function esIdempotente(sql: string): boolean {
  const cuerpo = cuerpoDe(sql, 'fn_crm_seed_pipeline_ventas');
  // El embudo solo si la búsqueda previa no encontró ninguno de ventas.
  const embudoGuardado = /IF\s+v_pipeline_id\s+IS\s+NULL\s+THEN[\s\S]*?INSERT\s+INTO\s+public\.pipelines/i.test(cuerpo);
  // Las etapas solo si ese embudo no tiene ninguna.
  const etapasGuardadas =
    /INSERT\s+INTO\s+public\.stages[\s\S]*?WHERE\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.stages\s+s\s+WHERE\s+s\.pipeline_id\s*=\s*v_pipeline_id\s*\)/i.test(
      cuerpo,
    );
  return embudoGuardado && etapasGuardadas;
}

/**
 * 6. `is_default` se calcula, no se cablea a `true`.
 *    `unique_default_pipeline_per_org` es un UNIQUE parcial sobre
 *    (organization_id) WHERE is_default: un `true` fijo aborta en cuanto la
 *    organización ya tenga otro embudo marcado.
 */
function respetaElUnicoEmbudoPorDefecto(sql: string): boolean {
  const cuerpo = cuerpoDe(sql, 'fn_crm_seed_pipeline_ventas');
  return (
    /SELECT\s+NOT\s+EXISTS\s*\([\s\S]*?FROM\s+public\.pipelines\s+p[\s\S]*?p\.is_default\s+IS\s+TRUE[\s\S]*?\)\s*INTO\s+v_default/i.test(
      cuerpo,
    ) &&
    /VALUES\s*\(\s*p_org_id\s*,\s*'[^']+'\s*,\s*'sales'\s*,\s*coalesce\s*\(\s*v_default\s*,\s*false\s*\)\s*\)/i.test(cuerpo) &&
    !/'sales'\s*,\s*true\s*\)/i.test(cuerpo)
  );
}

/**
 * 7. La función siembra datos de UN inquilino y NO lleva
 *    `fn_assert_acceso_org` (en un disparador de `organizations` no hay sesión
 *    útil todavía: la fila de `organization_members` se inserta después). La
 *    contrapartida es obligatoria: cerrada por ACL a `anon` y `authenticated`,
 *    para que ningún inquilino pueda invocarla ni sobre su organización ni
 *    sobre otra.
 */
function noEsInvocablePorUnInquilino(sql: string): boolean {
  const cuerpo = sinComentarios(sql);
  const revokes = cuerpo.match(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.(fn_crm_seed_pipeline_ventas\(integer\)|fn_seed_crm_pipeline_on_org\(\)|fn_seed_crm_pipeline_on_module\(\))\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/gi) ?? [];
  const grants = cuerpo.match(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.fn_crm_seed_pipeline_ventas\(integer\)\s+TO\s+([a-z_,\s]+);/i);
  return (
    revokes.length === 3 &&
    grants !== null &&
    /service_role/.test(grants[1]) &&
    !/\b(anon|authenticated|PUBLIC)\b/i.test(grants[1])
  );
}

/**
 * 8. Una semilla no puede tumbar el alta de una organización ni la activación
 *    de un módulo: los dos disparadores tragan el error como WARNING.
 */
function laSemillaNoTumbaElAlta(sql: string): boolean {
  for (const fn of ['fn_seed_crm_pipeline_on_org', 'fn_seed_crm_pipeline_on_module']) {
    const cuerpo = cuerpoDe(sql, fn);
    if (!/EXCEPTION\s+WHEN\s+OTHERS\s+THEN[\s\S]*?RAISE\s+WARNING/i.test(cuerpo)) return false;
  }
  return true;
}

/** 9. Contrato de las tres funciones nuevas: DEFINER y search_path fijo. */
function contratoDeLasFuncionesNuevas(sql: string): boolean {
  const cuerpo = sinComentarios(sql);
  const creates =
    cuerpo.match(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.(fn_crm_seed_pipeline_ventas|fn_seed_crm_pipeline_on_org|fn_seed_crm_pipeline_on_module)\s*\(/gi,
    ) ?? [];
  return (
    creates.length === 3 &&
    (cuerpo.match(/SECURITY\s+DEFINER/gi) ?? []).length === 3 &&
    (cuerpo.match(/SET\s+search_path\s+TO\s+'public',\s*'pg_temp'/gi) ?? []).length === 3 &&
    !/DROP\s+FUNCTION/i.test(cuerpo)
  );
}

/**
 * 10. La migración NO reescribe `fn_crm_seed_defaults` ni su disparador. Son
 *     8,5 KB de cuerpo ajeno con su propio contrato (`search_path=public`, ACL
 *     con `authenticated`): reescribirlos para colar tres líneas es riesgo
 *     gratuito. La semilla del embudo va en función propia.
 */
function noTocaLaSemillaDeConfiguracion(sql: string): boolean {
  const cuerpo = sinComentarios(sql);
  return (
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.fn_crm_seed_defaults/i.test(cuerpo) &&
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.fn_on_crm_module_activated/i.test(cuerpo) &&
    !/DROP\s+TRIGGER[^\n]*trg_crm_module_activated_seed/i.test(cuerpo)
  );
}

/**
 * 11. La migración NO escribe sobre datos de clientes ya existentes. La siembra
 *     retroactiva de las 77 organizaciones sin embudo la decide el dueño y está
 *     propuesta —sin ejecutar— en `docs/hallazgos/F-74.md`.
 */
function sinBackfillSobreDatosDeClientes(sql: string): boolean {
  const cuerpo = sinComentarios(sql);
  // Nada de UPDATE/DELETE, y ninguna llamada a la semilla fuera de sus
  // funciones (un backfill sería `SELECT fn_… FROM organizations`).
  return (
    !/\bUPDATE\s+public\.(organizations|pipelines|stages|opportunities|organization_modules)\b/i.test(cuerpo) &&
    !/\bDELETE\s+FROM\b/i.test(cuerpo) &&
    !/(SELECT|PERFORM)\s+public\.fn_crm_seed_pipeline_ventas\s*\([^)]*\)\s*\r?\n?\s*FROM\s+/i.test(cuerpo)
  );
}

/** 12. Nada de credenciales en un `.sql`: el repositorio es público. */
function sinCredenciales(sql: string): boolean {
  return !/(service_role_key|eyJ[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9]{20,}|postgres:\/\/[^\s]*:[^\s]*@)/i.test(sql);
}

/**
 * 13. Las etapas sembradas coinciden con la plantilla 'sales' de
 *     `pipelineTemplates.ts`. La base no puede importar TypeScript, así que la
 *     copia es inevitable; lo que no es inevitable es que las dos se separen en
 *     silencio y un embudo creado desde la UI no se parezca al sembrado.
 */
function coincideConLaPlantillaDeVentas(sql: string): boolean {
  const plantilla = PIPELINE_TEMPLATES.find((t) => t.key === 'sales');
  if (!plantilla) return false;
  const sembradas = etapasSembradas(sql);
  if (sembradas.length !== plantilla.stages.length) return false;
  return plantilla.stages.every((esperada, i) => {
    const real = sembradas[i];
    return (
      real !== undefined &&
      real.name === esperada.name &&
      real.position === esperada.position &&
      real.probability === esperada.probability &&
      real.color === esperada.color &&
      real.slaDays === esperada.sla_days &&
      real.isWon === esperada.is_won &&
      real.isLost === esperada.is_lost
    );
  });
}

// --- El archivo real cumple el contrato

describe('F-74 · toda organización nueva nace con embudo de ventas', () => {
  it('la migración y su reversión existen', () => {
    expect(existsSync(MIG)).toBe(true);
    expect(existsSync(RB)).toBe(true);
  });

  it('se dispara sola por las dos vías (alta de organización y activación del módulo)', () => {
    expect(seDisparaSolaPorLasDosVias(leer(MIG))).toBe(true);
  });

  it('el embudo sembrado es de tipo `sales`, con `pipeline_type` explícito', () => {
    expect(siembraUnEmbudoDeVentas(leer(MIG))).toBe(true);
  });

  it('tiene exactamente una etapa ganadora (`is_won`) y una perdedora (`is_lost`)', () => {
    expect(tieneEtapaGanadoraYPerdedora(leer(MIG))).toBe(true);
  });

  it('`probability` va en porcentaje 0-100, no en fracción 0-1', () => {
    expect(probabilidadEnPorcentaje(leer(MIG))).toBe(true);
  });

  it('es idempotente: ni el embudo ni las etapas se insertan sin guarda', () => {
    expect(esIdempotente(leer(MIG))).toBe(true);
  });

  it('`is_default` se calcula y respeta `unique_default_pipeline_per_org`', () => {
    expect(respetaElUnicoEmbudoPorDefecto(leer(MIG))).toBe(true);
  });

  it('la semilla no es invocable por un inquilino (REVOKE de anon y authenticated)', () => {
    expect(noEsInvocablePorUnInquilino(leer(MIG))).toBe(true);
  });

  it('una semilla fallida no tumba el alta ni la activación del módulo', () => {
    expect(laSemillaNoTumbaElAlta(leer(MIG))).toBe(true);
  });

  it('conserva el contrato de las tres funciones nuevas y no usa DROP FUNCTION', () => {
    expect(contratoDeLasFuncionesNuevas(leer(MIG))).toBe(true);
  });

  it('no reescribe `fn_crm_seed_defaults` ni su disparador', () => {
    expect(noTocaLaSemillaDeConfiguracion(leer(MIG))).toBe(true);
  });

  it('no escribe sobre datos de clientes existentes (la siembra retroactiva la decide el dueño)', () => {
    expect(sinBackfillSobreDatosDeClientes(leer(MIG))).toBe(true);
  });

  it('las etapas coinciden con la plantilla `sales` de pipelineTemplates.ts', () => {
    expect(coincideConLaPlantillaDeVentas(leer(MIG))).toBe(true);
  });

  it('la reversión retira los dos disparadores y las tres funciones, y avisa de que no borra datos', () => {
    const rb = leer(RB);
    const sinCom = sinComentarios(rb);
    expect(/DROP\s+TRIGGER\s+IF\s+EXISTS\s+trg_seed_crm_pipeline_on_org\s+ON\s+public\.organizations/i.test(sinCom)).toBe(true);
    expect(
      /DROP\s+TRIGGER\s+IF\s+EXISTS\s+trg_seed_crm_pipeline_on_module\s+ON\s+public\.organization_modules/i.test(sinCom),
    ).toBe(true);
    for (const fn of [
      'public\\.fn_crm_seed_pipeline_ventas\\(integer\\)',
      'public\\.fn_seed_crm_pipeline_on_org\\(\\)',
      'public\\.fn_seed_crm_pipeline_on_module\\(\\)',
    ]) {
      expect(new RegExp(`DROP\\s+FUNCTION\\s+IF\\s+EXISTS\\s+${fn}`, 'i').test(sinCom)).toBe(true);
    }
    // No borra datos, y lo dice (POLITICA-MIGRACIONES: «un rollback que no
    // revierte datos, lo dice»).
    expect(/NO\s+borra\s+datos/i.test(rb)).toBe(true);
    expect(/\bDELETE\s+FROM\b/i.test(sinCom)).toBe(false);
  });
});

describe('los dos .sql son publicables (repositorio público)', () => {
  it.each([MIG, RB])('%s no lleva credenciales', (ruta) => {
    expect(sinCredenciales(leer(ruta))).toBe(true);
  });
});

// --- Mutaciones: cada validador rechaza de verdad su variante rota

interface Mutacion {
  nombre: string;
  archivo: string;
  muta: (sql: string) => string;
  validador: (sql: string) => boolean;
}

const MUTACIONES: Mutacion[] = [
  {
    nombre: 'deja la siembra solo en la aplicación (quita el disparador del alta)',
    archivo: MIG,
    muta: (s) =>
      s.replace(
        'CREATE TRIGGER trg_seed_crm_pipeline_on_org\nAFTER INSERT ON public.organizations',
        'CREATE TRIGGER trg_seed_crm_pipeline_on_org\nAFTER UPDATE ON public.organizations',
      ),
    validador: seDisparaSolaPorLasDosVias,
  },
  {
    nombre: 'siembra un embudo de onboarding en vez de uno de ventas (el defecto de /api/modules)',
    archivo: MIG,
    muta: (s) => s.replace("VALUES (p_org_id, 'Ventas', 'sales', coalesce(v_default, false))", "VALUES (p_org_id, 'Ventas', 'onboarding', coalesce(v_default, false))"),
    validador: siembraUnEmbudoDeVentas,
  },
  {
    nombre: 'se olvida de marcar la etapa ganadora (`is_won`)',
    archivo: MIG,
    muta: (s) => s.replace("('Contrato/pago', 8, 100, '#22c55e', NULL,  true, false),", "('Contrato/pago', 8, 100, '#22c55e', NULL, false, false),"),
    validador: tieneEtapaGanadoraYPerdedora,
  },
  {
    nombre: 'escribe la probabilidad en fracción 0-1 en vez de porcentaje',
    archivo: MIG,
    muta: (s) =>
      s
        .replace("('Lead nuevo',    1,  10, '#3b82f6',    3, false, false),", "('Lead nuevo',    1,  0, '#3b82f6',    3, false, false),")
        .replace("('Contactado',    2,  20, '#6366f1',    7, false, false),", "('Contactado',    2,  0, '#6366f1',    7, false, false),")
        .replace("('Calificado',    3,  35, '#8b5cf6',   10, false, false),", "('Calificado',    3,  0, '#8b5cf6',   10, false, false),"),
    validador: probabilidadEnPorcentaje,
  },
  {
    nombre: 'quita la guarda de las etapas (reejecutar duplicaría las 9)',
    archivo: MIG,
    muta: (s) =>
      s.replace(
        '   WHERE NOT EXISTS (SELECT 1 FROM public.stages s WHERE s.pipeline_id = v_pipeline_id);',
        '   ;',
      ),
    validador: esIdempotente,
  },
  {
    nombre: 'cablea `is_default` a true (abortaría con unique_default_pipeline_per_org)',
    archivo: MIG,
    muta: (s) => s.replace("VALUES (p_org_id, 'Ventas', 'sales', coalesce(v_default, false))", "VALUES (p_org_id, 'Ventas', 'sales', true)"),
    validador: respetaElUnicoEmbudoPorDefecto,
  },
  {
    nombre: 'abre la semilla a `authenticated` (un inquilino podría sembrar en otro)',
    archivo: MIG,
    muta: (s) =>
      s.replace(
        'GRANT EXECUTE ON FUNCTION public.fn_crm_seed_pipeline_ventas(integer) TO service_role;',
        'GRANT EXECUTE ON FUNCTION public.fn_crm_seed_pipeline_ventas(integer) TO service_role, authenticated;',
      ),
    validador: noEsInvocablePorUnInquilino,
  },
  {
    nombre: 'deja que un fallo de la semilla tumbe el alta de la organización',
    archivo: MIG,
    muta: (s) =>
      s.replace(
        /\n  BEGIN\n    PERFORM public\.fn_crm_seed_pipeline_ventas\(NEW\.id\);\n  EXCEPTION WHEN OTHERS THEN\n[\s\S]*?RAISE WARNING 'fn_seed_crm_pipeline_on_org[^\n]*\n  END;/,
        '\n  PERFORM public.fn_crm_seed_pipeline_ventas(NEW.id);',
      ),
    validador: laSemillaNoTumbaElAlta,
  },
  {
    nombre: 'le quita el SET search_path a la semilla',
    archivo: MIG,
    muta: (s) =>
      s.replace(
        "CREATE OR REPLACE FUNCTION public.fn_crm_seed_pipeline_ventas(p_org_id integer)\nRETURNS jsonb\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path TO 'public', 'pg_temp'\n",
        'CREATE OR REPLACE FUNCTION public.fn_crm_seed_pipeline_ventas(p_org_id integer)\nRETURNS jsonb\nLANGUAGE plpgsql\nSECURITY DEFINER\n',
      ),
    validador: contratoDeLasFuncionesNuevas,
  },
  {
    nombre: 'reescribe `fn_crm_seed_defaults` para colar la llamada dentro',
    archivo: MIG,
    muta: (s) =>
      s.replace(
        'CREATE OR REPLACE FUNCTION public.fn_crm_seed_pipeline_ventas(p_org_id integer)',
        'CREATE OR REPLACE FUNCTION public.fn_crm_seed_defaults(p_org_id integer) RETURNS jsonb LANGUAGE plpgsql AS $x$ BEGIN RETURN NULL; END $x$;\n\nCREATE OR REPLACE FUNCTION public.fn_crm_seed_pipeline_ventas(p_org_id integer)',
      ),
    validador: noTocaLaSemillaDeConfiguracion,
  },
  {
    nombre: 'cuela el backfill de las 77 organizaciones dentro de la migración',
    archivo: MIG,
    muta: (s) =>
      s.replace(
        '-- NOTA: esta migracion NO hace backfill.',
        'SELECT public.fn_crm_seed_pipeline_ventas(o.id)\n  FROM public.organizations o;\n\n-- NOTA: esta migracion NO hace backfill.',
      ),
    validador: sinBackfillSobreDatosDeClientes,
  },
  {
    nombre: 'separa las etapas sembradas de la plantilla `sales` de la UI',
    archivo: MIG,
    muta: (s) => s.replace("('Discovery',     4,  50, '#a855f7',   14, false, false),", "('Descubrimiento', 4,  50, '#a855f7',   14, false, false),"),
    validador: coincideConLaPlantillaDeVentas,
  },
  {
    nombre: 'cuela una credencial en la migración (repositorio público)',
    archivo: MIG,
    muta: (s) =>
      s.replace(
        '-- Aprovisionamiento: toda organizacion nace con su embudo de ventas',
        '-- Aprovisionamiento: toda organizacion nace con su embudo de ventas\n-- service_role_key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9example',
      ),
    validador: sinCredenciales,
  },
];

describe('mutaciones sobre los .sql reales (con copia y restauración verificada)', () => {
  const ORIGINALES = new Map<string, string>([[MIG, leer(MIG)]]);
  const COPIAS = new Map<string, string>();

  beforeAll(() => {
    for (const [ruta, contenido] of ORIGINALES) {
      const copia = join(tmpdir(), `${basename(ruta)}.${process.pid}.bak`);
      copyFileSync(ruta, copia);
      // La copia guarda la RUTA COMPLETA del original y se verifica por md5.
      expect(md5(leer(copia))).toBe(md5(contenido));
      COPIAS.set(ruta, copia);
    }
  });

  afterAll(() => {
    // Red de seguridad: pase lo que pase, los archivos del repo quedan igual.
    for (const [ruta, copia] of COPIAS) {
      writeFileSync(ruta, leer(copia), 'utf8');
      expect(md5(leer(ruta))).toBe(md5(ORIGINALES.get(ruta) as string));
      rmSync(copia, { force: true });
    }
  });

  it('hay al menos 6 mutaciones', () => {
    expect(MUTACIONES.length).toBeGreaterThanOrEqual(6);
  });

  it.each(MUTACIONES.map((m) => [m.nombre, m] as const))('rechaza: %s', (_nombre, mutacion) => {
    const original = ORIGINALES.get(mutacion.archivo) as string;
    const copia = COPIAS.get(mutacion.archivo) as string;
    const mutado = mutacion.muta(original);

    // La mutación tiene que haber cambiado algo: si no, no prueba nada.
    expect(md5(mutado)).not.toBe(md5(original));
    // El validador acepta el original...
    expect(mutacion.validador(original)).toBe(true);

    try {
      writeFileSync(mutacion.archivo, mutado, 'utf8');
      // ...y rechaza al mutante leído del disco real.
      expect(mutacion.validador(leer(mutacion.archivo))).toBe(false);
    } finally {
      writeFileSync(mutacion.archivo, leer(copia), 'utf8');
    }

    // Restauración verificada por md5, mutación a mutación.
    expect(md5(leer(mutacion.archivo))).toBe(md5(original));
  });

  it('los archivos quedan idénticos tras todas las mutaciones', () => {
    for (const [ruta, contenido] of ORIGINALES) {
      expect(md5(leer(ruta))).toBe(md5(contenido));
    }
  });
});
