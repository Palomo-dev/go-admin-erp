// ============================================================================
// Fase D — ninguna función de Postgres con organización decide el día en UTC
// ============================================================================
// Lee los `.sql` de `supabase/migrations/` (en orden de nombre = orden
// cronológico) y exige que el contrato de la fase D siga en pie.
//
// Por qué una red estática y no una de resultados: con las 85 organizaciones en
// `America/Bogota` y el servidor en UTC, `CURRENT_DATE` acierta 19 de cada 24
// horas. Un test de resultado pasaría casi siempre aunque alguien reintroduzca
// el fallo; lo que hay que fijar es la FORMA: qué expresión decide el día.
//
// Se exige, sobre la ÚLTIMA definición vigente de cada función:
//
//   1. Ninguna de las 14 funciones arregladas conserva `CURRENT_DATE` — ni en
//      código ni en comentarios, para que el inventario por `pg_proc.prosrc`
//      no la vuelva a contar.
//   2. Cada una resuelve el día con `fn_today_for`, `fn_today_for_org` o
//      `fn_timezone_for` (fase A). Nadie reimplementa la cascada.
//   3. Las que tienen sucursal a mano usan la forma de DOS argumentos
//      `fn_today_for(org, branch)` / `fn_timezone_for(org, branch)`: la zona
//      es de la sede, no de la organización.
//   4. Se conserva la firma exacta y el modo de seguridad (`SECURITY DEFINER`
//      donde lo había, y NO donde no lo había).
//   5. Ninguna migración de la fase D lleva `DROP FUNCTION` ni un `UPDATE`
//      masivo sobre datos históricos.
//   6. Las comparaciones contra columnas `timestamptz` no vuelven a
//      `date_trunc('day', now())` (= medianoche UTC): usan `AT TIME ZONE`.
//   7. La lista blanca de `CURRENT_DATE` está **vacía**. Las siete funciones
//      del catálogo global de tasas ya no deciden el día en UTC: pasaron a
//      `fn_today_system()` el 2026-09-23, porque `currency_rates` tenía dos
//      criterios de día a la vez (sus funciones en UTC y el `DEFAULT` de la
//      columna en el día del sistema). Cualquier firma nueva en el JSON exige
//      justificarla antes en el ADR-004.
//   8. Cada migración de la fase D tiene su reversión, y la reversión es real
//      (devuelve `CURRENT_DATE`), no un archivo vacío.
//
// Los casos sintéticos del final comprueban que cada validador rechaza de
// verdad su variante rota, para que el test no se quede verde por vacío.
// ============================================================================

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { sqlDeMigraciones, definiciones } from './zonaHorariaPorSucursal.test';

const RAIZ = join(__dirname, '..', '..', '..');
const DIR_MIGRACIONES = join(RAIZ, 'supabase/migrations');
const DIR_ROLLBACKS = join(RAIZ, 'supabase/rollbacks');
const DIR_ADR = join(RAIZ, 'docs/adr');

/**
 * Las migraciones de esta fase. Las tres primeras son el barrido original; la
 * cuarta es el addendum: `fn_emitir_acciones` no existía cuando la fase empezó
 * (la creó otra sesión en paralelo y apareció al repetir el inventario), así
 * que se arregla aparte pero bajo el mismo contrato.
 */
const MIGRACIONES_FASE_D = [
  '20260923210000_fase_d_dia_de_la_organizacion_en_triggers.sql',
  '20260923210500_fase_d_dia_de_la_organizacion_en_numeracion.sql',
  '20260923211000_fase_d_dia_de_la_organizacion_en_el_resto.sql',
  '20260923233000_fn_emitir_acciones_dia_de_la_organizacion.sql',
];

const ADR_TASAS = 'ADR-004-dia-utc-en-el-catalogo-global-de-tasas.md';

/** La migración que dejó el inventario en cero. */
const MIGRACION_TASAS = '20260923235500_tasas_catalogo_dia_del_sistema.sql';

/**
 * Las 7 funciones del catálogo global de tasas. Ya NO son una lista blanca:
 * son las que esta fase arregló al final, y lo que se exige de ellas es lo
 * contrario que antes — que **no** conserven `CURRENT_DATE` y que resuelvan el
 * día con `fn_today_system()`.
 *
 * `save_exchange_rates` aparece con dos sobrecargas (4 y 5 argumentos); en la
 * base hay además otras tres sobrecargas que nunca tuvieron `CURRENT_DATE` y
 * que esta fase no toca.
 */
const FUNCIONES_DEL_CATALOGO_DE_TASAS = [
  'auto_generate_missing_rates',
  'fill_historical_rates_real_api',
  'fill_missing_currency_dates',
  'insert_fallback_rates',
  'save_exchange_rates',
  'update_global_exchange_rates',
] as const;

/**
 * La lista blanca. NO se escribe aquí: sale del MISMO archivo que lee el job de
 * CI que comprueba la base viva (`scripts/verificar-current-date-en-postgres.mjs`).
 * Dos copias de una lista blanca divergen, y la que divergiera sería justo la
 * que deja pasar la función intrusa. Ver ADR-005.
 *
 * Hoy está **vacía**, y ese es el contrato: si alguien añade una firma, los
 * tests de más abajo exigen que el ADR-004 la nombre y la justifique.
 */
const LISTA_BLANCA: { adr: string; firmas: string[] } = JSON.parse(
  readFileSync(join(RAIZ, 'scripts/lista-blanca-current-date.json'), 'utf8'),
);

/** Nombres distintos de lo que haya en la lista blanca (hoy: ninguno). */
const TASAS_EN_UTC_A_PROPOSITO = [
  ...new Set(LISTA_BLANCA.firmas.map((f) => f.replace(/\(.*$/, '').trim())),
].sort() as readonly string[];

interface Contrato {
  /** Firma esperada, normalizada (minúsculas, sin espacios de más). */
  firma: string;
  /** ¿La definición vigente debe declarar `SECURITY DEFINER`? */
  definer: boolean;
  /** ¿Debe resolver la zona con la forma de dos argumentos (org, sucursal)? */
  porSucursal: boolean;
  /** De dónde sale la organización, para el mensaje de error. */
  origen: string;
}

/**
 * Las 14 funciones arregladas. `porSucursal: true` significa que la fila (o el
 * parámetro) sí trae una sucursal y por tanto la zona tiene que bajar hasta
 * ella; `false` significa que solo hay organización y `fn_today_for_org` basta.
 */
const CONTRATOS: Record<string, Contrato> = {
  // --- grupo 1: triggers -----------------------------------------------
  calculate_days_overdue: {
    firma: '',
    definer: false,
    porSucursal: true,
    origen: 'accounts_receivable.organization_id + .branch_id',
  },
  fn_ar_installments_before_save: {
    firma: '',
    definer: false,
    porSucursal: true,
    origen: 'ar_installments -> accounts_receivable (no tiene organization_id propio)',
  },
  hrm_generate_loan_installments: {
    firma: '',
    definer: false,
    porSucursal: true,
    origen: 'employee_loans.organization_id + employments.branch_id',
  },
  hrm_update_loan_on_installment_payment: {
    firma: '',
    definer: false,
    porSucursal: true,
    origen: 'loan_installments -> employee_loans -> employments',
  },
  create_employment_for_new_member: {
    firma: '',
    definer: true,
    porSucursal: true,
    origen: 'organization_members.organization_id + la sucursal que ya resuelve',
  },
  fn_create_default_branch_and_period: {
    firma: '',
    definer: true,
    porSucursal: false,
    origen: 'NEW.id (la organización recién creada)',
  },
  fn_create_default_org_structure: {
    firma: '',
    definer: true,
    porSucursal: false,
    origen: 'NEW.id (la organización recién creada)',
  },
  // --- grupo 2: numeración de documentos -------------------------------
  fn_get_next_invoice_number: {
    firma: 'p_org_id integer, p_branch_id integer, p_document_type text',
    definer: false,
    porSucursal: true,
    origen: 'parámetros; invoice_sequences es por (organización, sucursal)',
  },
  fn_get_next_sale_number: {
    firma: 'p_org_id integer, p_branch_id integer, p_sequence_type text',
    definer: false,
    porSucursal: true,
    origen: 'parámetros; sale_sequences es por (organización, sucursal)',
  },
  // --- grupo 3: el resto -----------------------------------------------
  get_restaurant_availability: {
    firma:
      'p_organization_id integer, p_date date, p_party_size integer default 2, ' +
      "p_zone text default null::text, p_slot_interval integer default 30",
    definer: true,
    porSucursal: true,
    origen: 'p_organization_id + restaurant_booking_settings.branch_id',
  },
  get_ai_tokens_usage: {
    firma: 'org_id integer',
    definer: true,
    porSucursal: false,
    origen: 'parámetro org_id',
  },
  complete_invitation_registration: {
    firma:
      'invitation_code text, user_id uuid, user_email text, first_name text, ' +
      'last_name text, phone_number text, user_password text',
    definer: true,
    porSucursal: false,
    origen: 'invitations.organization_id',
  },
  fn_reschedule_overdue_tasks: {
    firma: '',
    definer: true,
    porSucursal: false,
    origen: 'tasks.organization_id, por tarea dentro del bucle',
  },
  fn_daily_task_agent: {
    firma: '',
    definer: true,
    porSucursal: false,
    origen: 'organizations.id, por organización dentro del bucle',
  },
  // --- addendum: la que se coló mientras corría la fase -----------------
  // Decide DOS días contables: si el periodo contable está abierto
  // (`fn_is_period_open`) y el `effective_date` del certificado de acciones.
  // `porSucursal: false` a propósito y verificado por MCP: `fiscal_periods` es
  // por organización, y `cap_transactions` NO tiene `branch_id`. La `v_branch`
  // que la función calcula existe solo para rellenar `journal_entries.branch_id`
  // y se elige con un `order by ... limit 1`: no es el lugar del hecho.
  fn_emitir_acciones: {
    firma: 'p_subscription_id uuid, p_admin_user_id uuid, p_referencia_tecleada text',
    definer: true,
    porSucursal: false,
    origen: "investor_config.organizacion_contable_id -> v_org",
  },
};

// ---------------------------------------------------------------------------
// Utilidades (exportadas para probarlas contra SQL sintético)
// ---------------------------------------------------------------------------

const CURRENT_DATE_RE = /\bCURRENT_DATE\b/i;
/** El equivalente de `CURRENT_DATE` escrito sobre timestamptz: medianoche UTC. */
const DATE_TRUNC_DIA_NOW_RE = /date_trunc\s*\(\s*'day'\s*,\s*now\s*\(\s*\)\s*\)/i;

/** Quita los comentarios `--` de un SQL, para no auditar la documentación. */
export function sinComentariosDeLinea(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

export function normalizaFirma(parametros: string): string {
  return parametros.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** ¿El texto resuelve el día/zona con las funciones de la fase A? */
export function usaResolutoraDeFaseA(cuerpo: string): boolean {
  return /\bfn_(today_for|today_for_org|timezone_for)\s*\(/i.test(cuerpo);
}

/** ¿Usa la forma de dos argumentos, es decir, baja hasta la sucursal? */
export function resuelveHastaLaSucursal(cuerpo: string): boolean {
  // `fn_today_for(a, b)` o `fn_timezone_for(a, b)` con dos argumentos de primer
  // nivel. Se excluye a propósito `fn_today_for(NULL::integer)`, que es el
  // fallback de un argumento.
  const re = /\bfn_(?:today_for|timezone_for)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cuerpo)) !== null) {
    const args = m[1];
    let nivel = 0;
    let comas = 0;
    for (const c of args) {
      if (c === '(') nivel++;
      else if (c === ')') nivel--;
      else if (c === ',' && nivel === 0) comas++;
    }
    if (comas >= 1) return true;
  }
  return false;
}

export function declaraSecurityDefiner(cabecera: string): boolean {
  return /\bSECURITY\s+DEFINER\b/i.test(cabecera);
}

// ---------------------------------------------------------------------------

/** `expect` con explicación: esta versión de Jest no acepta un segundo argumento. */
function exige(condicion: boolean, mensaje: string, esperado = true): void {
  if (condicion !== esperado) throw new Error(mensaje);
  expect(condicion).toBe(esperado);
}

const SQL = sqlDeMigraciones();

function vigente(nombre: string) {
  const defs = definiciones(SQL, nombre);
  expect(defs.length).toBeGreaterThan(0);
  return defs[defs.length - 1];
}

/**
 * La definición que de verdad decide el día. Coincide con `vigente` salvo
 * cuando la firma contratada solo delega en una sobrecarga de sí misma (una
 * sola implementación): entonces se audita la última definición de esa otra
 * firma. Caso real: `get_restaurant_availability` de 5 argumentos delega desde
 * 20261006114054 en la de 6 (con `p_branch_id`), que es la que baja la zona a
 * la sede. La firma y el modo de seguridad se siguen exigiendo sobre `vigente`.
 * No es una lista blanca: la sobrecarga pasa por los mismos tres controles.
 */
function implementacion(nombre: string) {
  const def = vigente(nombre);
  const cuerpo = sinComentariosDeLinea(def.cuerpo);
  const delega = new RegExp(`\\b${nombre}\\s*\\(`, 'i').test(cuerpo);
  if (!delega || usaResolutoraDeFaseA(def.cuerpo)) return def;
  const propia = normalizaFirma(def.parametros);
  const otras = definiciones(SQL, nombre).filter((d) => normalizaFirma(d.parametros) !== propia);
  return otras.length > 0 ? otras[otras.length - 1] : def;
}

describe('Fase D — el día calendario sale de la organización, no de UTC', () => {
  describe.each(Object.entries(CONTRATOS))('%s', (nombre, contrato) => {
    test('su definición vigente no conserva CURRENT_DATE', () => {
      const def = implementacion(nombre);
      exige(
        CURRENT_DATE_RE.test(def.cuerpo),
        `${nombre} vuelve a decidir el día con CURRENT_DATE (día UTC). ` +
          `La organización sale de: ${contrato.origen}.`,
        false,
      );
    });

    test('resuelve el día con las funciones de la fase A', () => {
      const def = implementacion(nombre);
      exige(
        usaResolutoraDeFaseA(def.cuerpo),
        `${nombre} no llama a fn_today_for / fn_today_for_org / fn_timezone_for. ` +
          'La resolución vive en un solo sitio (ADR-001); no se reimplementa.',
        true,
      );
    });

    test('conserva su firma exacta (sin sobrecargas nuevas)', () => {
      const def = vigente(nombre);
      expect(normalizaFirma(def.parametros)).toBe(normalizaFirma(contrato.firma));
    });

    test('conserva su modo de seguridad', () => {
      const def = vigente(nombre);
      expect(declaraSecurityDefiner(def.cabecera)).toBe(contrato.definer);
    });

    if (contrato.porSucursal) {
      test('baja la zona hasta la sucursal (forma de dos argumentos)', () => {
        const def = implementacion(nombre);
        exige(
          resuelveHastaLaSucursal(def.cuerpo),
          `${nombre} tiene sucursal a mano (${contrato.origen}) pero resuelve ` +
            'solo por organización. Una cadena con sedes en dos husos vuelve a fallar.',
          true,
        );
      });
    }
  });

  test('las funciones del grupo 3 no comparan timestamptz contra medianoche UTC', () => {
    for (const nombre of [
      'fn_daily_task_agent',
      'fn_reschedule_overdue_tasks',
      'get_ai_tokens_usage',
    ]) {
      const def = vigente(nombre);
      exige(
        DATE_TRUNC_DIA_NOW_RE.test(def.cuerpo),
        `${nombre} vuelve a usar date_trunc('day', now()), que es medianoche UTC. ` +
          'Es el mismo fallo que CURRENT_DATE escrito de otra forma.',
        false,
      );
      expect(/\bAT\s+TIME\s+ZONE\b/i.test(def.cuerpo)).toBe(true);
    }
  });

  test('fn_reschedule_overdue_tasks fija las 18:00 locales, no las 18:00 UTC', () => {
    const def = vigente('fn_reschedule_overdue_tasks');
    expect(/interval\s+'18\s+hours'/i.test(def.cuerpo)).toBe(false);
    expect(/time\s+'18:00'[\s\S]{0,60}AT\s+TIME\s+ZONE/i.test(def.cuerpo)).toBe(true);
  });
});

describe('Fase D — forma de las migraciones', () => {
  test.each(MIGRACIONES_FASE_D)('%s existe y tiene reversión real', (archivo) => {
    const mig = join(DIR_MIGRACIONES, archivo);
    expect(existsSync(mig)).toBe(true);

    const rollback = join(DIR_ROLLBACKS, archivo.replace(/\.sql$/, '_rollback.sql'));
    exige(
      existsSync(rollback),
      `Falta ${rollback}. Política de migraciones: la reversión va en el mismo commit.`,
      true,
    );

    const textoRollback = readFileSync(rollback, 'utf8');
    expect(textoRollback.length).toBeGreaterThan(500);
    exige(
      CURRENT_DATE_RE.test(textoRollback),
      'La reversión no devuelve CURRENT_DATE: entonces no revierte nada.',
      true,
    );
  });

  test.each(MIGRACIONES_FASE_D)('%s no borra funciones ni toca datos históricos', (archivo) => {
    const texto = readFileSync(join(DIR_MIGRACIONES, archivo), 'utf8');
    expect(/\bDROP\s+FUNCTION\b/i.test(texto)).toBe(false);
    // Un `UPDATE` de nivel superior (no dentro de un cuerpo de función) sería
    // un toque a datos de clientes. Los `UPDATE` legítimos van indentados
    // dentro de los cuerpos; ninguno debe empezar en la columna 0.
    expect(/^UPDATE\s/im.test(texto)).toBe(false);
    expect(/^DELETE\s/im.test(texto)).toBe(false);
  });

  test('fn_today_system no se toca: es el DEFAULT del catálogo global', () => {
    for (const archivo of MIGRACIONES_FASE_D) {
      const texto = readFileSync(join(DIR_MIGRACIONES, archivo), 'utf8');
      expect(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+\S*fn_today_system/i.test(texto)).toBe(
        false,
      );
    }
  });
});

describe('Fase D — el catálogo global de tasas también resuelve el día del sistema', () => {
  const adr = join(DIR_ADR, ADR_TASAS);
  const migracion = join(DIR_MIGRACIONES, MIGRACION_TASAS);
  const sqlMigracion = existsSync(migracion) ? readFileSync(migracion, 'utf8') : '';

  test('la lista blanca de CURRENT_DATE está vacía', () => {
    // Es el contrato nuevo, y es más fuerte que el anterior: ninguna función de
    // `public` decide un día calendario con CURRENT_DATE. Sin excepciones que
    // mantener. Volver a llenarla exige justificarlo primero en el ADR-004, y
    // los tests de más abajo lo exigen entrada por entrada.
    exige(
      LISTA_BLANCA.firmas.length === 0,
      `La lista blanca volvió a tener ${LISTA_BLANCA.firmas.length} firma(s): ` +
        `${LISTA_BLANCA.firmas.join(', ')}. Si de verdad hace falta, el ADR-004 ` +
        'tiene que nombrarlas y decir por qué ese dato no es de ninguna organización.',
      true,
    );
  });

  test('si algún día se llena, guarda FIRMAS y no solo nombres', () => {
    // `save_exchange_rates` tiene varias sobrecargas: por nombre, una sobrecarga
    // nueva con CURRENT_DATE pasaría inadvertida.
    for (const firma of LISTA_BLANCA.firmas) {
      expect(firma).toMatch(/^[a-z_][a-z0-9_]*\(.*\)$/);
    }
    expect(new Set(LISTA_BLANCA.firmas).size).toBe(LISTA_BLANCA.firmas.length);
  });

  test('la lista blanca apunta al ADR que la gobierna', () => {
    expect(LISTA_BLANCA.adr).toContain(ADR_TASAS);
  });

  test('cada firma que haya en la lista blanca está nombrada en el ADR', () => {
    // Con la lista vacía esto no comprueba nada; existe para que llenarla
    // vuelva a obligar a escribir el porqué. `test.each` no admite array vacío.
    const texto = readFileSync(adr, 'utf8');
    for (const nombre of TASAS_EN_UTC_A_PROPOSITO) {
      exige(
        texto.includes(nombre),
        `La lista blanca nombra ${nombre} y el ADR-004 no lo menciona.`,
        true,
      );
    }
  });

  test('el ADR existe y marca que sustituye a su versión anterior', () => {
    exige(existsSync(adr), `Falta ${adr}.`, true);
    const texto = readFileSync(adr, 'utf8');
    // El ADR-004 decía lo contrario de lo que dice hoy; si se pierde la marca de
    // sustitución, quien lo lea creerá que el catálogo sigue en UTC.
    expect(/sustituye/i.test(texto)).toBe(true);
    expect(texto).toContain('fn_today_system');
  });

  test('el ADR conserva el contexto: currency_rates no tiene organization_id', () => {
    const texto = readFileSync(adr, 'utf8');
    expect(texto).toContain('currency_rates');
    expect(/no tiene .{0,20}organization_id/i.test(texto)).toBe(true);
  });

  test('el ADR dice qué pasa con las filas históricas', () => {
    const texto = readFileSync(adr, 'utf8');
    expect(/hist[oó]ric/i.test(texto)).toBe(true);
    // El recuento medido tiene que estar escrito: un ADR que dice "algunas filas"
    // no permite decidir nada.
    expect(/\b2[\s.]?400\b/.test(texto)).toBe(true);
  });

  test('la migración existe y tiene reversión real', () => {
    exige(existsSync(migracion), `Falta ${migracion}.`, true);
    const rollback = join(DIR_ROLLBACKS, MIGRACION_TASAS.replace(/\.sql$/, '_rollback.sql'));
    exige(
      existsSync(rollback),
      `Falta ${rollback}. Política de migraciones: la reversión va en el mismo commit.`,
      true,
    );
    const textoRollback = readFileSync(rollback, 'utf8');
    expect(textoRollback.length).toBeGreaterThan(500);
    exige(
      CURRENT_DATE_RE.test(textoRollback),
      'La reversión no devuelve CURRENT_DATE: entonces no revierte nada.',
      true,
    );
  });

  test('la migración no borra funciones ni toca datos históricos', () => {
    // Sobre el SQL SIN comentarios: la cabecera del archivo explica justamente
    // que no hay `DROP FUNCTION`, y una comprobación ingenua se dispararía con
    // su propia documentación.
    const codigo = sinComentariosDeLinea(sqlMigracion);
    expect(/\bDROP\s+FUNCTION\b/i.test(codigo)).toBe(false);
    expect(/^UPDATE\s/im.test(codigo)).toBe(false);
    expect(/^DELETE\s/im.test(codigo)).toBe(false);
  });

  test('la migración no redefine fn_today_system', () => {
    // Tiene otros dos consumidores (`fn_set_task_date_tz` y el DEFAULT de
    // `provider_pricing.valid_from`): se arreglan las llamadoras, no la llamada.
    expect(
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+\S*fn_today_system/i.test(
        sinComentariosDeLinea(sqlMigracion),
      ),
    ).toBe(false);
  });

  test.each(FUNCIONES_DEL_CATALOGO_DE_TASAS)(
    '%s: la migración la reescribe sin CURRENT_DATE y con fn_today_system()',
    (nombre) => {
      const defs = definiciones(sqlMigracion, nombre);
      exige(
        defs.length > 0,
        `${MIGRACION_TASAS} no reescribe ${nombre}, que es una de las 7 del catálogo.`,
        true,
      );
      for (const def of defs) {
        exige(
          CURRENT_DATE_RE.test(def.cuerpo),
          `${nombre} conserva CURRENT_DATE (día UTC) en ${MIGRACION_TASAS}.`,
          false,
        );
        exige(
          /\bfn_today_system\s*\(/i.test(def.cuerpo),
          `${nombre} no resuelve el día con fn_today_system(), que es el mismo ` +
            'criterio que el DEFAULT de currency_rates.rate_date.',
          true,
        );
        // Tampoco el equivalente escrito sobre timestamptz.
        expect(DATE_TRUNC_DIA_NOW_RE.test(def.cuerpo)).toBe(false);
      }
    },
  );

  test('save_exchange_rates se reescribe con sus DOS sobrecargas, sin crear una nueva', () => {
    const defs = definiciones(sqlMigracion, 'save_exchange_rates');
    expect(defs).toHaveLength(2);
    const firmas = defs.map((d) => normalizaFirma(d.parametros)).sort();
    expect(firmas).toEqual(
      [
        normalizaFirma(
          "org_id integer, base_currency_id uuid, rates jsonb, source text DEFAULT 'openexchangerates'::text",
        ),
        normalizaFirma(
          "org_id integer, base_currency_id uuid, rates jsonb, source text DEFAULT 'openexchangerates'::text, api_timestamp bigint DEFAULT NULL::bigint",
        ),
      ].sort(),
    );
    // Las dos eran SECURITY DEFINER y tienen que seguir siéndolo.
    for (const def of defs) expect(declaraSecurityDefiner(def.cabecera)).toBe(true);
  });

  test('las que NO eran SECURITY DEFINER no lo son ahora', () => {
    for (const nombre of [
      'auto_generate_missing_rates',
      'fill_historical_rates_real_api',
      'fill_missing_currency_dates',
      'insert_fallback_rates',
      'update_global_exchange_rates',
    ]) {
      for (const def of definiciones(sqlMigracion, nombre)) {
        exige(
          declaraSecurityDefiner(def.cabecera),
          `${nombre} gana SECURITY DEFINER en ${MIGRACION_TASAS}: la migración era ` +
            'de fechas, no de privilegios.',
          false,
        );
      }
    }
  });

  test('la variable local que se llamaba current_date desapareció', () => {
    // `save_exchange_rates(...,bigint)` declaraba `current_date date := ...`, y
    // ese NOMBRE casa con la expresión del inventario (`prosrc ~* CURRENT_DATE`).
    // Sin renombrarla, el inventario nunca habría podido llegar a cero.
    const defs = definiciones(sqlMigracion, 'save_exchange_rates');
    for (const def of defs) {
      expect(/^\s*current_date\s+date\b/im.test(def.cuerpo)).toBe(false);
    }
  });

  test('la migración no escribe ninguna credencial', () => {
    expect(/eyJ[A-Za-z0-9_-]{20,}/.test(sqlMigracion)).toBe(false);
    expect(/service_role_key\s*=\s*['"]/.test(sqlMigracion)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// El inventario contra la base viva sigue enchufado (ADR-005)
// ---------------------------------------------------------------------------
// Este archivo lee los `.sql` del repositorio, y por eso NO vio en su día a
// `fn_emitir_acciones`: otra sesión la aplicó por MCP. La red que sí la habría
// visto es el job de CI que consulta la base. Aquí se comprueba que ese job
// sigue existiendo y que no se le ha quitado lo que lo hace útil.
// ---------------------------------------------------------------------------
describe('Fase D — la comprobación contra la base viva sigue en pie', () => {
  const WORKFLOW = join(RAIZ, '.github/workflows/inventario-postgres.yml');
  const SCRIPT = join(RAIZ, 'scripts/verificar-current-date-en-postgres.mjs');

  test('el script de inventario existe y consulta la RPC', () => {
    exige(existsSync(SCRIPT), `Falta ${SCRIPT} (ADR-005).`, true);
    const texto = readFileSync(SCRIPT, 'utf8');
    expect(texto).toContain('fn_inventario_current_date');
    expect(texto).toContain('scripts/lista-blanca-current-date.json');
  });

  test('el script se SALTA si faltan credenciales, no falla', () => {
    // Un fork no recibe `secrets`. Si esto se convirtiera en un fallo, toda
    // contribución externa vería un rojo que no puede arreglar.
    const texto = readFileSync(SCRIPT, 'utf8');
    expect(/function\s+salta\b[\s\S]*process\.exit\(0\)/.test(texto)).toBe(true);
  });

  test('el script no lleva ninguna credencial escrita', () => {
    const texto = readFileSync(SCRIPT, 'utf8');
    // Nada que parezca un JWT de Supabase ni una URL de proyecto concreta.
    expect(/eyJ[A-Za-z0-9_-]{20,}/.test(texto)).toBe(false);
    expect(/https:\/\/[a-z0-9]{20}\.supabase\.co/.test(texto)).toBe(false);
  });

  test('el workflow existe, corre el script y tiene disparador programado', () => {
    exige(existsSync(WORKFLOW), `Falta ${WORKFLOW} (ADR-005).`, true);
    const texto = readFileSync(WORKFLOW, 'utf8');
    expect(texto).toContain('node scripts/verificar-current-date-en-postgres.mjs');
    // El `schedule` es el único disparador que ve una función aplicada por MCP
    // sin commit: sin él, el job solo mira cuando ya hay un cambio en el repo.
    expect(/^\s*schedule:/m.test(texto)).toBe(true);
    expect(/cron:/.test(texto)).toBe(true);
    // Las credenciales llegan por `secrets`, nunca escritas en el archivo.
    expect(texto).toContain('${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}');
    expect(/eyJ[A-Za-z0-9_-]{20,}/.test(texto)).toBe(false);
  });

  test('la migración que crea la RPC tiene su reversión', () => {
    const mig = join(DIR_MIGRACIONES, '20260923234000_fn_inventario_current_date.sql');
    const rollback = join(
      DIR_ROLLBACKS,
      '20260923234000_fn_inventario_current_date_rollback.sql',
    );
    expect(existsSync(mig)).toBe(true);
    exige(existsSync(rollback), `Falta ${rollback}.`, true);
    const texto = readFileSync(mig, 'utf8');
    // Solo service_role: anon y authenticated no ejecutan el inventario.
    expect(/grant\s+execute\s+on\s+function\s+public\.fn_inventario_current_date\(\)\s+to\s+service_role/i.test(texto)).toBe(true);
    expect(/revoke\s+all\s+on\s+function\s+public\.fn_inventario_current_date\(\)\s+from\s+anon/i.test(texto)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Que los validadores rechacen de verdad: SQL sintético roto
// ---------------------------------------------------------------------------
describe('los validadores no se quedan verdes por vacío', () => {
  const ROTO_CURRENT_DATE = `
    CREATE OR REPLACE FUNCTION public.fn_falsa() RETURNS trigger LANGUAGE plpgsql AS $f$
    BEGIN NEW.dia := CURRENT_DATE; RETURN NEW; END; $f$;`;

  const ROTO_SOLO_ORG = `
    CREATE OR REPLACE FUNCTION public.fn_falsa() RETURNS trigger LANGUAGE plpgsql AS $f$
    BEGIN NEW.dia := public.fn_today_for_org(NEW.organization_id); RETURN NEW; END; $f$;`;

  const BUENA = `
    CREATE OR REPLACE FUNCTION public.fn_falsa() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $f$
    BEGIN NEW.dia := public.fn_today_for(NEW.organization_id, NEW.branch_id); RETURN NEW; END; $f$;`;

  test('detecta CURRENT_DATE reintroducido', () => {
    const d = definiciones(ROTO_CURRENT_DATE, 'fn_falsa')[0];
    expect(CURRENT_DATE_RE.test(d.cuerpo)).toBe(true);
    expect(usaResolutoraDeFaseA(d.cuerpo)).toBe(false);
  });

  test('detecta que se resolvió solo por organización teniendo sucursal', () => {
    const d = definiciones(ROTO_SOLO_ORG, 'fn_falsa')[0];
    expect(usaResolutoraDeFaseA(d.cuerpo)).toBe(true);
    expect(resuelveHastaLaSucursal(d.cuerpo)).toBe(false);
  });

  test('acepta la forma correcta', () => {
    const d = definiciones(BUENA, 'fn_falsa')[0];
    expect(CURRENT_DATE_RE.test(d.cuerpo)).toBe(false);
    expect(usaResolutoraDeFaseA(d.cuerpo)).toBe(true);
    expect(resuelveHastaLaSucursal(d.cuerpo)).toBe(true);
    expect(declaraSecurityDefiner(d.cabecera)).toBe(true);
  });

  test('el fallback de un argumento fn_today_for(NULL) no cuenta como sucursal', () => {
    const sql = `
      CREATE OR REPLACE FUNCTION public.fn_falsa() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN NEW.dia := public.fn_today_for(NULL::integer); RETURN NEW; END; $f$;`;
    const d = definiciones(sql, 'fn_falsa')[0];
    expect(resuelveHastaLaSucursal(d.cuerpo)).toBe(false);
  });

  test('detecta date_trunc(day, now()) como el mismo fallo en timestamptz', () => {
    expect(DATE_TRUNC_DIA_NOW_RE.test("x < date_trunc('day', now())")).toBe(true);
    expect(DATE_TRUNC_DIA_NOW_RE.test('x < v_day_start')).toBe(false);
  });

  test('normalizaFirma distingue dos firmas distintas', () => {
    expect(normalizaFirma('  p_org_id   INTEGER , p_branch_id integer ')).toBe(
      'p_org_id integer , p_branch_id integer',
    );
    expect(normalizaFirma('p_org_id integer')).not.toBe(normalizaFirma('p_org_id bigint'));
  });
});
