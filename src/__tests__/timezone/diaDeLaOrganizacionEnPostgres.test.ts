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
//   1. Ninguna de las 13 funciones arregladas conserva `CURRENT_DATE` — ni en
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
//   7. Las SIETE funciones del catálogo global de tasas de cambio siguen en
//      UTC **a propósito**, y su justificación escrita existe: ADR-004 las
//      nombra una por una. Es una lista blanca cerrada: una octava función con
//      `CURRENT_DATE` no está cubierta por el ADR.
//   8. Cada migración de la fase D tiene su reversión, y la reversión es real
//      (devuelve `CURRENT_DATE`), no un archivo vacío.
//
// Los casos sintéticos del final comprueban que cada validador rechaza de
// verdad su variante rota, para que el test no se quede verde por vacío.
// ============================================================================

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { sqlDeMigraciones, definiciones } from './zonaHorariaPorSucursal.test';

const RAIZ = join(__dirname, '..', '..', '..');
const DIR_MIGRACIONES = join(RAIZ, 'supabase/migrations');
const DIR_ROLLBACKS = join(RAIZ, 'supabase/rollbacks');
const DIR_ADR = join(RAIZ, 'docs/adr');

/** Las tres migraciones de esta fase. */
const MIGRACIONES_FASE_D = [
  '20260923210000_fase_d_dia_de_la_organizacion_en_triggers.sql',
  '20260923210500_fase_d_dia_de_la_organizacion_en_numeracion.sql',
  '20260923211000_fase_d_dia_de_la_organizacion_en_el_resto.sql',
];

const ADR_TASAS = 'ADR-004-dia-utc-en-el-catalogo-global-de-tasas.md';

/**
 * Las 7 funciones que se quedan en UTC a propósito: escriben en
 * `currency_rates`, que es un catálogo GLOBAL sin `organization_id`.
 * Lista blanca cerrada. Ampliarla exige volver al ADR-004 y justificarlo.
 */
const TASAS_EN_UTC_A_PROPOSITO = [
  'auto_generate_missing_rates',
  'fill_historical_rates_real_api',
  'fill_missing_currency_dates',
  'insert_fallback_rates',
  'save_exchange_rates',
  'update_global_exchange_rates',
] as const;

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
 * Las 13 funciones arregladas. `porSucursal: true` significa que la fila (o el
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
};

// ---------------------------------------------------------------------------
// Utilidades (exportadas para probarlas contra SQL sintético)
// ---------------------------------------------------------------------------

const CURRENT_DATE_RE = /\bCURRENT_DATE\b/i;
/** El equivalente de `CURRENT_DATE` escrito sobre timestamptz: medianoche UTC. */
const DATE_TRUNC_DIA_NOW_RE = /date_trunc\s*\(\s*'day'\s*,\s*now\s*\(\s*\)\s*\)/i;

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

describe('Fase D — el día calendario sale de la organización, no de UTC', () => {
  describe.each(Object.entries(CONTRATOS))('%s', (nombre, contrato) => {
    test('su definición vigente no conserva CURRENT_DATE', () => {
      const def = vigente(nombre);
      exige(
        CURRENT_DATE_RE.test(def.cuerpo),
        `${nombre} vuelve a decidir el día con CURRENT_DATE (día UTC). ` +
          `La organización sale de: ${contrato.origen}.`,
        false,
      );
    });

    test('resuelve el día con las funciones de la fase A', () => {
      const def = vigente(nombre);
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
        const def = vigente(nombre);
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

describe('Fase D — las 7 funciones de tasas se quedan en UTC con justificación', () => {
  const adr = join(DIR_ADR, ADR_TASAS);

  test('el ADR existe', () => {
    exige(
      existsSync(adr),
      `Falta ${adr}. Dejar CURRENT_DATE sin justificación escrita no está permitido.`,
      true,
    );
  });

  test.each(TASAS_EN_UTC_A_PROPOSITO)('el ADR nombra %s', (nombre) => {
    const texto = readFileSync(adr, 'utf8');
    expect(texto).toContain(nombre);
  });

  test('el ADR dice por qué: currency_rates no tiene organization_id', () => {
    const texto = readFileSync(adr, 'utf8');
    expect(texto).toContain('currency_rates');
    expect(/no tiene .{0,20}organization_id/i.test(texto)).toBe(true);
  });

  test('ninguna migración de la fase D reescribe una función de tasas', () => {
    for (const archivo of MIGRACIONES_FASE_D) {
      const texto = readFileSync(join(DIR_MIGRACIONES, archivo), 'utf8');
      for (const nombre of TASAS_EN_UTC_A_PROPOSITO) {
        const reescrita = new RegExp(
          `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+\\S*${nombre}\\s*\\(`,
          'i',
        ).test(texto);
        exige(
          reescrita,
          `${archivo} reescribe ${nombre}, que el ADR-004 deja en UTC a propósito.`,
          false,
        );
      }
    }
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
