// ============================================================================
// Regresión: ni la sucursal de una comisión ni el pipeline de un lead web
// se eligen con un literal ni «el primero que aparezca»
// ============================================================================
// Dos defectos distintos con la misma raíz — elegir una fila sin filtrar por
// organización — y por eso una sola red:
//
// F-64 · `fn_create_commission_on_opportunity_won` hacía
//
//     SELECT id INTO v_branch_id FROM branches WHERE organization_id = NEW.organization_id LIMIT 1;
//     IF v_branch_id IS NULL THEN v_branch_id := 1; END IF;
//
//   El literal `1` NO está filtrado por organización: `branches.id` es una
//   secuencia global, así que la sucursal 1 es de quien sea. Como hoy la
//   sucursal 1 no existe, el síntoma vivo era un ABORTO (23503, FK
//   `commissions_branch_id_fkey`): una organización sin sucursales no podía
//   marcar ninguna oportunidad como ganada. El día que exista una sucursal 1,
//   el aborto se vuelve silencio y la comisión se carga a otro inquilino.
//   Además el `LIMIT 1` sin `ORDER BY` era no determinista e ignoraba
//   `opportunities.branch_id`.
//
// F-66 · `web_capture_lead` elegía el pipeline por antigüedad cuando la
//   organización no tenía ninguno marcado por defecto, **sin mirar
//   `pipeline_type`**. Resultado medido: 23 de 42 leads web acabaron en un
//   embudo de `onboarding`.
//
// Por qué una red estática sobre el `.sql` y no un test contra la base: el
// fallo es de FORMA (qué filtra la consulta), no de resultado. Un test de
// resultado exigiría una base con datos y no correría en CI. La prueba de
// comportamiento se hizo con `DO … RAISE EXCEPTION` en transacción abortada y
// está en `docs/hallazgos/F-64.md` y `F-66.md`.
//
// Las mutaciones del final comprueban que cada validador rechaza de verdad su
// variante rota, para que el test no se quede verde por vacío. Cada mutación
// se escribe sobre el archivo REAL (con copia previa de la ruta completa) y se
// restaura en un `finally`, verificando el md5 contra el original.
// ============================================================================

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const RAIZ = join(__dirname, '..', '..', '..');

const MIG_COMISION = join(
  RAIZ,
  'supabase/migrations/20260923235000_comision_de_oportunidad_sucursal_del_mismo_inquilino.sql',
);
const RB_COMISION = join(
  RAIZ,
  'supabase/rollbacks/20260923235000_comision_de_oportunidad_sucursal_del_mismo_inquilino_rollback.sql',
);
const MIG_LEAD = join(RAIZ, 'supabase/migrations/20260923235500_web_capture_lead_pipeline_de_ventas.sql');
const RB_LEAD = join(RAIZ, 'supabase/rollbacks/20260923235500_web_capture_lead_pipeline_de_ventas_rollback.sql');

const md5 = (v: string): string => createHash('md5').update(v, 'utf8').digest('hex');
const leer = (ruta: string): string => readFileSync(ruta, 'utf8');

/**
 * Quita los comentarios `--` antes de validar.
 *
 * La cabecera de cada migración EXPLICA el defecto y por eso cita a propósito
 * `v_branch_id := 1` y el `order by p.created_at asc limit 1`. Sin quitar
 * comentarios, la propia explicación haría fallar a los validadores.
 *
 * (Ninguno de los archivos tiene `--` dentro de una cadena SQL; si alguna vez
 * lo tuviera, habría que pasar a un tokenizador de verdad.)
 */
function sinComentarios(sql: string): string {
  return sql
    .split('\n')
    .map((linea) => linea.replace(/--.*$/, ''))
    .join('\n');
}

/** Devuelve el cuerpo `$function$…$function$` de una función concreta. */
function cuerpoDe(sql: string, nombre: string): string {
  const re = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${nombre}\\s*\\([\\s\\S]*?AS \\$function\\$([\\s\\S]*?)\\$function\\$`,
  );
  const m = re.exec(sinComentarios(sql));
  return m ? m[1] : '';
}

// --- Validadores (funciones puras: valen igual para el archivo y sus mutantes)

/** 1. No reaparece el literal de sucursal: ni `:= 1` ni la sucursal 0. */
function sinSucursalInventada(sql: string): boolean {
  const cuerpo = sinComentarios(sql);
  return (
    !/v_branch_id\s*:=\s*\d+\s*;/i.test(cuerpo) &&
    !/COALESCE\s*\(\s*v_reservation\.branch_id\s*,\s*\d+\s*\)/i.test(cuerpo)
  );
}

/**
 * 2. TODA consulta a `branches` que elige una sucursal filtra por
 *    `organization_id`. Se comprueba sobre cada `FROM branches …` del cuerpo.
 */
function toda_seleccion_de_branches_filtra_por_organizacion(sql: string): boolean {
  const cuerpo = sinComentarios(sql);
  const bloques = cuerpo.match(/FROM\s+branches\b[\s\S]*?(?=;|\bLIMIT\s+1\s*;)/gi) ?? [];
  if (bloques.length === 0) return false;
  return bloques.every((b) => /\borganization_id\s*=/i.test(b));
}

/** 3. El respaldo de sucursal es reproducible: LIMIT 1 siempre con ORDER BY. */
function respaldoDeSucursalDeterminista(sql: string): boolean {
  const cuerpo = sinComentarios(sql);
  const bloques = cuerpo.match(/FROM\s+branches\b[\s\S]*?LIMIT\s+1/gi) ?? [];
  if (bloques.length === 0) return false;
  return bloques.every((b) => /ORDER\s+BY/i.test(b) && /is_main/i.test(b));
}

/** 4. La sucursal declarada en la oportunidad se comprueba contra su inquilino. */
function compruebaLaSucursalDeLaOportunidad(sql: string): boolean {
  const cuerpo = cuerpoDe(sql, 'fn_create_commission_on_opportunity_won');
  return (
    /NEW\.branch_id/.test(cuerpo) &&
    /b\.organization_id\s*=\s*NEW\.organization_id/i.test(cuerpo)
  );
}

/** 5. El pipeline del lead web se elige por TIPO, no por antigüedad. */
function eligeElPipelinePorTipo(sql: string): boolean {
  const cuerpo = cuerpoDe(sql, 'web_capture_lead');
  return (
    /coalesce\s*\(\s*p\.pipeline_type\s*,\s*'sales'\s*\)\s*=\s*'sales'/i.test(cuerpo) &&
    /organization_id\s*=\s*v_org\.id/i.test(cuerpo)
  );
}

/** 6. No queda ningún respaldo que coja un pipeline sin mirar el tipo. */
function sinRespaldoDePipelineSinTipo(sql: string): boolean {
  const cuerpo = cuerpoDe(sql, 'web_capture_lead');
  const selects = cuerpo.match(/from\s+public\.pipelines\s+p[\s\S]*?limit\s+1/gi) ?? [];
  if (selects.length === 0) return false;
  return selects.every((s) => /pipeline_type/i.test(s));
}

/** 7. Sin pipeline de ventas el fallo es visible: no cae en otro embudo. */
function elFalloDePipelineEsVisible(sql: string): boolean {
  const cuerpo = cuerpoDe(sql, 'web_capture_lead');
  return /'no_sales_pipeline'/.test(cuerpo) && /raise\s+warning/i.test(cuerpo);
}

/** 8. La etapa sale del pipeline elegido y de ningún otro. */
function laEtapaEsDelPipelineElegido(sql: string): boolean {
  const cuerpo = cuerpoDe(sql, 'web_capture_lead');
  return /from\s+public\.stages\s+s[\s\S]*?where\s+s\.pipeline_id\s*=\s*v_pipeline_id/i.test(cuerpo);
}

/** 9. Contrato de las tres funciones de comisión/asiento. */
function contratoComision(sql: string): boolean {
  const cuerpo = sinComentarios(sql);
  return (
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.fn_create_commission_on_opportunity_won\s*\(\s*\)/i.test(cuerpo) &&
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.fn_auto_journal_commission\s*\(\s*\)/i.test(cuerpo) &&
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.fn_auto_journal_ota_commission\s*\(\s*\)/i.test(cuerpo) &&
    !/DROP\s+FUNCTION/i.test(cuerpo) &&
    (cuerpo.match(/SECURITY\s+DEFINER/gi) ?? []).length === 3 &&
    // search_path tal cual estaba: 'public' en la primera, 'public','pg_temp'
    // en la segunda, NINGUNO en la de OTA.
    (cuerpo.match(/SET\s+search_path/gi) ?? []).length === 2
  );
}

/** 10. Contrato de `web_capture_lead`: firma, seguridad y search_path. */
function contratoLead(sql: string): boolean {
  const cuerpo = sinComentarios(sql);
  return (
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.web_capture_lead\s*\(\s*p_organization_id\s+integer/i.test(cuerpo) &&
    /RETURNS\s+jsonb/i.test(cuerpo) &&
    /LANGUAGE\s+plpgsql/i.test(cuerpo) &&
    /SECURITY\s+DEFINER/i.test(cuerpo) &&
    /SET\s+search_path\s+TO\s+'public',\s*'pg_temp'/i.test(cuerpo) &&
    !/DROP\s+FUNCTION/i.test(cuerpo)
  );
}

/** 11. Nada de credenciales en un `.sql`: el repositorio es público. */
function sinCredenciales(sql: string): boolean {
  return !/(service_role_key|eyJ[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9]{20,}|postgres:\/\/[^\s]*:[^\s]*@)/i.test(sql);
}

// --- Los archivos reales cumplen el contrato

describe('F-64 · la sucursal de una comisión es siempre del mismo inquilino', () => {
  it('la migración y su reversión existen', () => {
    expect(existsSync(MIG_COMISION)).toBe(true);
    expect(existsSync(RB_COMISION)).toBe(true);
  });

  it('no vuelve a inventarse una sucursal (ni `:= 1` ni la sucursal 0)', () => {
    expect(sinSucursalInventada(leer(MIG_COMISION))).toBe(true);
  });

  it('toda selección de `branches` filtra por organization_id', () => {
    expect(toda_seleccion_de_branches_filtra_por_organizacion(leer(MIG_COMISION))).toBe(true);
  });

  it('el respaldo de sucursal es reproducible (ORDER BY con is_main, no LIMIT 1 a secas)', () => {
    expect(respaldoDeSucursalDeterminista(leer(MIG_COMISION))).toBe(true);
  });

  it('la sucursal que declara la oportunidad se comprueba contra su organización', () => {
    expect(compruebaLaSucursalDeLaOportunidad(leer(MIG_COMISION))).toBe(true);
  });

  it('conserva firma, SECURITY DEFINER, los search_path de cada una y CREATE OR REPLACE', () => {
    expect(contratoComision(leer(MIG_COMISION))).toBe(true);
  });

  it('la reversión es real: devuelve el cuerpo con `v_branch_id := 1`', () => {
    const rb = sinComentarios(leer(RB_COMISION));
    expect(/v_branch_id\s*:=\s*1\s*;/.test(rb)).toBe(true);
    expect(/COALESCE\(v_reservation\.branch_id,\s*0\)/i.test(rb)).toBe(true);
    expect(/CREATE\s+OR\s+REPLACE\s+FUNCTION/i.test(rb)).toBe(true);
  });
});

describe('F-66 · el lead web entra al embudo de ventas o no entra', () => {
  it('la migración y su reversión existen', () => {
    expect(existsSync(MIG_LEAD)).toBe(true);
    expect(existsSync(RB_LEAD)).toBe(true);
  });

  it('elige el pipeline por `pipeline_type`, no por antigüedad', () => {
    expect(eligeElPipelinePorTipo(leer(MIG_LEAD))).toBe(true);
  });

  it('no queda ningún respaldo que coja un pipeline sin mirar el tipo', () => {
    expect(sinRespaldoDePipelineSinTipo(leer(MIG_LEAD))).toBe(true);
  });

  it('sin pipeline de ventas el fallo es visible y no cae en otro embudo', () => {
    expect(elFalloDePipelineEsVisible(leer(MIG_LEAD))).toBe(true);
  });

  it('la etapa sale del pipeline elegido y de ningún otro', () => {
    expect(laEtapaEsDelPipelineElegido(leer(MIG_LEAD))).toBe(true);
  });

  it('conserva firma, RETURNS jsonb, SECURITY DEFINER y su search_path', () => {
    expect(contratoLead(leer(MIG_LEAD))).toBe(true);
  });

  it('la reversión es real: devuelve el respaldo que ignora el tipo', () => {
    const rb = sinComentarios(leer(RB_LEAD));
    expect(/from\s+public\.pipelines\s+p\s+where\s+p\.organization_id\s*=\s*v_org\.id\s+order\s+by\s+p\.created_at/is.test(rb)).toBe(
      true,
    );
    expect(/'no_pipeline'/.test(rb)).toBe(true);
  });
});

describe('los cuatro .sql son publicables (repositorio público)', () => {
  it.each([MIG_COMISION, RB_COMISION, MIG_LEAD, RB_LEAD])('%s no lleva credenciales', (ruta) => {
    expect(sinCredenciales(leer(ruta))).toBe(true);
  });
});

// --- Mutaciones: cada validador rechaza de verdad su variante rota

interface Mutacion {
  nombre: string;
  archivo: string;
  muta: (sql: string) => string;
  /** Validador que debe pasar de `true` a `false` con la mutación. */
  validador: (sql: string) => boolean;
}

const MUTACIONES: Mutacion[] = [
  {
    nombre: 'vuelve el literal `v_branch_id := 1` (el defecto original)',
    archivo: MIG_COMISION,
    muta: (s) =>
      s.replace(
        "    -- Sin sucursales no se inventa ninguna: NULL y constancia en el log.\n    IF v_branch_id IS NULL THEN",
        '    IF v_branch_id IS NULL THEN\n        v_branch_id := 1;\n    END IF;\n    IF v_branch_id IS NULL THEN',
      ),
    validador: sinSucursalInventada,
  },
  {
    nombre: 'vuelve la sucursal 0 en la función de OTA',
    archivo: MIG_COMISION,
    muta: (s) => s.replace(/        v_branch_id,\n        'ota_commission',/, "        COALESCE(v_reservation.branch_id, 0),\n        'ota_commission',"),
    validador: sinSucursalInventada,
  },
  {
    nombre: 'quita el filtro de organización al respaldo de sucursal',
    archivo: MIG_COMISION,
    muta: (s) =>
      s.replace(
        /          FROM branches b\n         WHERE b\.organization_id = NEW\.organization_id\n         ORDER BY/,
        '          FROM branches b\n         ORDER BY',
      ),
    validador: toda_seleccion_de_branches_filtra_por_organizacion,
  },
  {
    nombre: 'vuelve al LIMIT 1 sin ORDER BY (no determinista)',
    archivo: MIG_COMISION,
    muta: (s) =>
      s.replace(
        /         ORDER BY \(b\.is_main IS TRUE\) DESC, \(b\.is_active IS TRUE\) DESC, b\.id ASC\n         LIMIT 1;/,
        '         LIMIT 1;',
      ),
    validador: respaldoDeSucursalDeterminista,
  },
  {
    nombre: 'deja de comprobar el inquilino de la sucursal de la oportunidad',
    archivo: MIG_COMISION,
    muta: (s) =>
      s
        .replace(
          /         WHERE b\.id::bigint = NEW\.branch_id\n           AND b\.organization_id = NEW\.organization_id;/,
          '         WHERE b.id::bigint = NEW.branch_id;',
        )
        .replace(
          /         WHERE b\.organization_id = NEW\.organization_id\n         ORDER BY \(b\.is_main IS TRUE\) DESC, \(b\.is_active IS TRUE\) DESC, b\.id ASC\n         LIMIT 1;\n    END IF;\n\n    -- Sin sucursales/,
          '         ORDER BY (b.is_main IS TRUE) DESC, (b.is_active IS TRUE) DESC, b.id ASC\n         LIMIT 1;\n    END IF;\n\n    -- Sin sucursales',
        ),
    validador: compruebaLaSucursalDeLaOportunidad,
  },
  {
    nombre: 'cambia CREATE OR REPLACE por DROP + CREATE (se llevaría triggers y ACL)',
    archivo: MIG_COMISION,
    muta: (s) =>
      s.replace(
        'CREATE OR REPLACE FUNCTION public.fn_create_commission_on_opportunity_won()',
        'DROP FUNCTION public.fn_create_commission_on_opportunity_won();\nCREATE FUNCTION public.fn_create_commission_on_opportunity_won()',
      ),
    validador: contratoComision,
  },
  {
    nombre: 'le inventa a la función de OTA un search_path que no tenía',
    archivo: MIG_COMISION,
    muta: (s) =>
      s.replace(
        'CREATE OR REPLACE FUNCTION public.fn_auto_journal_ota_commission()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n',
        "CREATE OR REPLACE FUNCTION public.fn_auto_journal_ota_commission()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\n",
      ),
    validador: contratoComision,
  },
  {
    nombre: 'vuelve a elegir el pipeline por antigüedad, sin mirar el tipo',
    archivo: MIG_LEAD,
    muta: (s) =>
      s.replace(
        "     and coalesce(p.pipeline_type, 'sales') = 'sales'\n   order by (p.is_default is true) desc, p.created_at asc, p.id asc",
        '   order by p.created_at asc',
      ),
    validador: eligeElPipelinePorTipo,
  },
  {
    nombre: 'reintroduce el respaldo «el primer pipeline que aparezca»',
    archivo: MIG_LEAD,
    muta: (s) =>
      s.replace(
        '  if v_pipeline_id is not null then\n    -- La etapa sale de ESTE pipeline',
        '  if v_pipeline_id is null then\n    select p.id into v_pipeline_id\n      from public.pipelines p\n     where p.organization_id = v_org.id\n     order by p.created_at asc\n     limit 1;\n  end if;\n\n  if v_pipeline_id is not null then\n    -- La etapa sale de ESTE pipeline',
      ),
    validador: sinRespaldoDePipelineSinTipo,
  },
  {
    nombre: 'silencia el caso «no hay pipeline de ventas»',
    archivo: MIG_LEAD,
    muta: (s) => s.replace(/'no_sales_pipeline'/g, "'no_pipeline'"),
    validador: elFalloDePipelineEsVisible,
  },
  {
    nombre: 'deja que la etapa salga de cualquier pipeline',
    archivo: MIG_LEAD,
    muta: (s) =>
      s.replace(
        '     where s.pipeline_id = v_pipeline_id\n     order by s.position asc',
        '     order by s.position asc',
      ),
    validador: laEtapaEsDelPipelineElegido,
  },
  {
    nombre: 'le quita a web_capture_lead su SET search_path',
    archivo: MIG_LEAD,
    muta: (s) => s.replace(/\n SET search_path TO 'public', 'pg_temp'\nAS \$function\$/, '\nAS $function$'),
    validador: contratoLead,
  },
  {
    nombre: 'cuela una credencial en la migración (repositorio público)',
    archivo: MIG_LEAD,
    muta: (s) =>
      s.replace(
        '-- web_capture_lead: el lead web entra al embudo de VENTAS, o no entra.',
        '-- web_capture_lead: el lead web entra al embudo de VENTAS, o no entra.\n-- service_role_key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9example',
      ),
    validador: sinCredenciales,
  },
];

describe('mutaciones sobre los .sql reales (con copia y restauración verificada)', () => {
  const ORIGINALES = new Map<string, string>([
    [MIG_COMISION, leer(MIG_COMISION)],
    [MIG_LEAD, leer(MIG_LEAD)],
  ]);
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

  it('hay al menos 5 mutaciones', () => {
    expect(MUTACIONES.length).toBeGreaterThanOrEqual(5);
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
