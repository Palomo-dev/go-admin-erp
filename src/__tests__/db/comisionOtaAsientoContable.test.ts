// ============================================================================
// Regresión F-65 · la comisión de OTA llama a `fn_create_journal_entry` con
// argumentos CON NOMBRE, nunca con la forma posicional
// ============================================================================
// `fn_auto_journal_ota_commission()` alimentaba sus dos disparadores
// (`booking_reservation_details` y `expedia_reservation_details`) con una
// llamada de DIEZ argumentos posicionales a `fn_create_journal_entry`, que
// solo tiene una firma, de CATORCE parámetros con nombre. PL/pgSQL resuelve
// los nombres de función en EJECUCIÓN, así que el error no salía al desplegar:
// salía la primera vez que una reserva con comisión pasaba por el disparador.
// Y como el disparador es AFTER INSERT OR UPDATE en la misma transacción, lo
// que caía era la escritura entera:
//
//     42883: function fn_create_journal_entry(integer, integer, unknown,
//            unknown, text, numeric, text, text, text,
//            timestamp with time zone) does not exist
//
// Por qué una red estática sobre el `.sql` y no un test contra la base: el
// fallo es de FORMA (con qué forma se llama a la función), no de resultado. Un
// test de resultado exigiría una base con datos y no correría en CI. La prueba
// de comportamiento se hizo con `DO … RAISE EXCEPTION` en transacción abortada
// y está en `docs/hallazgos/F-65.md`.
//
// La red prohíbe explícitamente la forma posicional, porque volver a ella es
// justo la reincidencia que costó que ninguna reserva de OTA con comisión
// pudiera guardarse.
//
// Las mutaciones del final comprueban que cada validador rechaza de verdad su
// variante rota. Cada mutación se escribe sobre el archivo REAL (con copia
// previa de la ruta completa) y se restaura en un `finally`, verificando el
// md5 contra el original.
//
// ---------------------------------------------------------------------------
// ALCANCE tras ADR-CC-013 (leer antes de tocar este archivo)
// ---------------------------------------------------------------------------
// Después de aplicar esta migración, la sesión de Finanzas reescribió el cuerpo
// vivo de `fn_auto_journal_ota_commission()` con la decisión CONTABLE de
// ADR-CC-013: regla 5235 → 2335, y búsqueda de regla que ya NO exige
// `event_type = 'confirmed'` sino cualquier regla activa de `ota_commission`.
//
// Esta red NO valida la decisión contable — no es suya y sería falso que la
// afirmara. Por eso aquí **no hay ni un código de cuenta cableado**: las
// cuentas salen de la regla de la organización, y quien las comprueba es la
// prueba en seco contra la base documentada en `docs/hallazgos/F-65.md`.
// Tampoco hay ninguna aserción de que la regla se busque solo con
// `event_type = 'confirmed'`: eso ya sería falso.
//
// Lo que esta red sí sigue guardando, y que ADR-CC-013 conserva literalmente,
// es la FORMA de la llamada, que es lo que rompió F-65:
//   - argumentos con nombre, nunca la forma posicional;
//   - idempotencia por `p_fact_key`;
//   - `SET search_path` en una función SECURITY DEFINER;
//   - `CREATE OR REPLACE`, jamás `DROP` (se llevaría los dos disparadores).
//
// Se vigilan DOS archivos: el de F-65 (registro histórico de la corrección) y
// el de ADR-CC-013 (`20260923223946_comision_ota_gasto_contra_pasivo.sql`), que
// es el que está EN VIGOR. Los validadores son puros, así que valen para los
// dos. Sobre el archivo de Finanzas no se muta nada: solo se lee.
// ============================================================================

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const RAIZ = join(__dirname, '..', '..', '..');

const MIG_OTA = join(
  RAIZ,
  'supabase/migrations/20260924180000_comision_ota_llamada_con_parametros_con_nombre.sql',
);
const RB_OTA = join(
  RAIZ,
  'supabase/rollbacks/20260924180000_comision_ota_llamada_con_parametros_con_nombre_rollback.sql',
);
/** La versión EN VIGOR de la función: decisión contable de la sesión de Finanzas. */
const MIG_ADR013 = join(RAIZ, 'supabase/migrations/20260923223946_comision_ota_gasto_contra_pasivo.sql');

const md5 = (v: string): string => createHash('md5').update(v, 'utf8').digest('hex');
const leer = (ruta: string): string => readFileSync(ruta, 'utf8');

/**
 * Quita los comentarios `--` antes de validar.
 *
 * La cabecera de la migración EXPLICA el defecto y por eso cita a propósito la
 * firma vieja y el mensaje 42883. Sin quitar comentarios, la propia
 * explicación haría fallar a los validadores.
 */
function sinComentarios(sql: string): string {
  return sql
    .split('\n')
    .map((linea) => linea.replace(/--.*$/, ''))
    .join('\n');
}

/**
 * Devuelve el cuerpo `$function$…$function$` de una función concreta.
 *
 * Insensible a mayúsculas: la migración de F-65 escribe el DDL en mayúsculas y
 * la de ADR-CC-013 en minúsculas, y esta red vigila las dos.
 */
function cuerpoDe(sql: string, nombre: string): string {
  const re = new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${nombre}\\s*\\([\\s\\S]*?\\bAS\\s+\\$function\\$([\\s\\S]*?)\\$function\\$`,
    'i',
  );
  const m = re.exec(sinComentarios(sql));
  return m ? m[1] : '';
}

/** Los argumentos de la (única) llamada a `fn_create_journal_entry`, uno por línea. */
function argumentosDeLaLlamada(sql: string): string[] {
  const cuerpo = cuerpoDe(sql, 'fn_auto_journal_ota_commission');
  const m = /fn_create_journal_entry\s*\(([\s\S]*?)\n\s*\)\s*;/.exec(cuerpo);
  if (!m) return [];
  return m[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

// --- Validadores (funciones puras: valen igual para el archivo y sus mutantes)

/** 1. Todos los argumentos van CON NOMBRE y están los nueve obligatorios. */
function llamadaConParametrosConNombre(sql: string): boolean {
  const args = argumentosDeLaLlamada(sql);
  if (args.length < 9) return false;
  if (!args.every((a) => /^p_[a-z_]+\s*:=/.test(a))) return false;
  const nombres = args.map((a) => /^(p_[a-z_]+)/.exec(a)?.[1]);
  return [
    'p_organization_id',
    'p_branch_id',
    'p_entry_date',
    'p_memo',
    'p_source',
    'p_source_id',
    'p_debit_account',
    'p_credit_account',
    'p_amount',
  ].every((n) => nombres.includes(n));
}

/** 2. La forma posicional queda PROHIBIDA: ni un solo argumento sin nombre. */
function sinLlamadaPosicional(sql: string): boolean {
  const cuerpo = cuerpoDe(sql, 'fn_auto_journal_ota_commission');
  if (!/fn_create_journal_entry\s*\(/.test(cuerpo)) return false;
  if (/PERFORM\s+fn_create_journal_entry/i.test(cuerpo)) return false;
  const args = argumentosDeLaLlamada(sql);
  return args.length > 0 && args.every((a) => a.includes(':='));
}

/**
 * 3. Idempotencia: el hecho se identifica con `p_fact_key`, que es lo ÚNICO
 *    que tiene unicidad en `journal_entries`
 *    (`uq_journal_entries_fact_key`, UNIQUE sobre (organization_id, fact_key)).
 *    `(source, source_id)` sólo tiene un índice NO único.
 */
function idempotentePorFactKey(sql: string): boolean {
  const args = argumentosDeLaLlamada(sql);
  const factKey = args.find((a) => a.startsWith('p_fact_key'));
  if (!factKey) return false;
  return /'accrual:ota_commission:'/.test(factKey) && /NEW\.id::text/.test(factKey);
}

/** 4. El `source_id` identifica la fila de detalle y su evento. */
function sourceIdIdentificaElHecho(sql: string): boolean {
  const args = argumentosDeLaLlamada(sql);
  const sourceId = args.find((a) => a.startsWith('p_source_id'));
  if (!sourceId) return false;
  return /NEW\.id::text/.test(sourceId) && /v_event_type/.test(sourceId);
}

/**
 * 5. La fecha del asiento es el instante del devengo, no el de ejecución del
 *    disparador: `COALESCE(NEW.updated_at, NEW.created_at, now())`.
 *    `entry_date` es `timestamptz`, así que aquí NO interviene el día
 *    calendario de la organización.
 */
function fechaDeDevengo(sql: string): boolean {
  const args = argumentosDeLaLlamada(sql);
  const fecha = args.find((a) => a.startsWith('p_entry_date'));
  if (!fecha) return false;
  return /NEW\.updated_at/.test(fecha) && /NEW\.created_at/.test(fecha) && /now\(\)/.test(fecha);
}

/** 6. `p_source` agrupa por origen y `p_memo` lleva la descripción (no al revés). */
function origenYMemoEnSuSitio(sql: string): boolean {
  const args = argumentosDeLaLlamada(sql);
  const origen = args.find((a) => a.startsWith('p_source '))
    ?? args.find((a) => /^p_source\s*:=/.test(a));
  const memo = args.find((a) => /^p_memo\s*:=/.test(a));
  if (!origen || !memo) return false;
  return /:=\s*'ota_commission'/.test(origen) && /:=\s*v_description/.test(memo);
}

/**
 * 7. Contrato: firma `()`, RETURNS trigger, plpgsql, SECURITY DEFINER,
 *    `CREATE OR REPLACE` (jamás `DROP`), y el `search_path` fijo que esta
 *    migración añade a propósito.
 */
function contratoOta(sql: string): boolean {
  const cuerpo = sinComentarios(sql);
  return (
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.fn_auto_journal_ota_commission\s*\(\s*\)/i.test(cuerpo) &&
    /RETURNS\s+trigger/i.test(cuerpo) &&
    /LANGUAGE\s+plpgsql/i.test(cuerpo) &&
    /SECURITY\s+DEFINER/i.test(cuerpo) &&
    /SET\s+search_path\s+TO\s+'public',\s*'pg_temp'/i.test(cuerpo) &&
    !/DROP\s+FUNCTION/i.test(cuerpo)
  );
}

/** 8. Nada de credenciales en un `.sql`: el repositorio es público. */
function sinCredenciales(sql: string): boolean {
  return !/(service_role_key|eyJ[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9]{20,}|postgres:\/\/[^\s]*:[^\s]*@)/i.test(sql);
}

// --- Los archivos reales cumplen el contrato

describe('F-65 · la comisión de OTA genera su asiento contable', () => {
  it('la migración y su reversión existen', () => {
    expect(existsSync(MIG_OTA)).toBe(true);
    expect(existsSync(RB_OTA)).toBe(true);
  });

  it('llama a fn_create_journal_entry con argumentos CON NOMBRE', () => {
    expect(llamadaConParametrosConNombre(leer(MIG_OTA))).toBe(true);
  });

  it('prohíbe la forma posicional que producía el 42883', () => {
    expect(sinLlamadaPosicional(leer(MIG_OTA))).toBe(true);
  });

  it('es idempotente por fact_key (lo único con unicidad en journal_entries)', () => {
    expect(idempotentePorFactKey(leer(MIG_OTA))).toBe(true);
  });

  it('el source_id identifica la fila de detalle y su evento', () => {
    expect(sourceIdIdentificaElHecho(leer(MIG_OTA))).toBe(true);
  });

  it('la fecha del asiento es el instante del devengo, no el del disparador', () => {
    expect(fechaDeDevengo(leer(MIG_OTA))).toBe(true);
  });

  it('p_source agrupa por origen y p_memo lleva la descripción', () => {
    expect(origenYMemoEnSuSitio(leer(MIG_OTA))).toBe(true);
  });

  it('conserva firma, SECURITY DEFINER y CREATE OR REPLACE, y fija el search_path', () => {
    expect(contratoOta(leer(MIG_OTA))).toBe(true);
  });

  it('la reversión es real: devuelve la llamada posicional (y lo advierte)', () => {
    const rb = leer(RB_OTA);
    expect(/PERFORM\s+fn_create_journal_entry\s*\(/i.test(sinComentarios(rb))).toBe(true);
    expect(sinLlamadaPosicional(rb)).toBe(false);
    expect(/CREATE\s+OR\s+REPLACE\s+FUNCTION/i.test(rb)).toBe(true);
    expect(/42883/.test(rb)).toBe(true);
  });
});

// La versión EN VIGOR de la función es la de ADR-CC-013. Su `.sql` se vigila
// con los mismos validadores de FORMA, porque es la parte que esa sesión
// declaró conservar. Aquí no se muta su archivo ni se valida su contabilidad.
describe('ADR-CC-013 · el cuerpo vigente conserva la forma que arregló F-65', () => {
  const vigente = (): string => leer(MIG_ADR013);

  it('la migración de ADR-CC-013 está en el repositorio', () => {
    expect(existsSync(MIG_ADR013)).toBe(true);
  });

  it('sigue llamando con argumentos CON NOMBRE', () => {
    expect(llamadaConParametrosConNombre(vigente())).toBe(true);
  });

  it('no ha vuelto a la forma posicional', () => {
    expect(sinLlamadaPosicional(vigente())).toBe(true);
  });

  it('conserva la idempotencia por fact_key', () => {
    expect(idempotentePorFactKey(vigente())).toBe(true);
  });

  it('conserva el source_id que identifica la fila de detalle', () => {
    expect(sourceIdIdentificaElHecho(vigente())).toBe(true);
  });

  it('conserva la fecha de devengo', () => {
    expect(fechaDeDevengo(vigente())).toBe(true);
  });

  it('conserva p_source y p_memo en su sitio', () => {
    expect(origenYMemoEnSuSitio(vigente())).toBe(true);
  });

  it('conserva el contrato: CREATE OR REPLACE, SECURITY DEFINER y search_path', () => {
    expect(contratoOta(vigente())).toBe(true);
  });
});

describe('los .sql son publicables (repositorio público)', () => {
  it.each([MIG_OTA, RB_OTA, MIG_ADR013])('%s no lleva credenciales', (ruta) => {
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

const LLAMADA_BUENA = `    v_entry_id := fn_create_journal_entry(
        p_organization_id := v_reservation.organization_id,
        p_branch_id       := v_branch_id,
        p_entry_date      := COALESCE(NEW.updated_at, NEW.created_at, now()),
        p_memo            := v_description,
        p_source          := 'ota_commission',
        p_source_id       := NEW.id::text || ':' || v_event_type,
        p_debit_account   := v_rule.debit_account_code,
        p_credit_account  := v_rule.credit_account_code,
        p_amount          := v_amount,
        p_fact_key        := 'accrual:ota_commission:' || NEW.id::text
    );`;

const LLAMADA_POSICIONAL = `    PERFORM fn_create_journal_entry(
        v_reservation.organization_id,
        v_branch_id,
        'ota_commission',
        'confirmed',
        NEW.id::text,
        v_amount,
        v_rule.debit_account_code,
        v_rule.credit_account_code,
        v_description,
        COALESCE(NEW.updated_at, now())
    );`;

const MUTACIONES: Mutacion[] = [
  {
    nombre: 'vuelve la llamada posicional de 10 argumentos (el defecto original)',
    archivo: MIG_OTA,
    muta: (s) => s.replace(LLAMADA_BUENA, LLAMADA_POSICIONAL),
    validador: sinLlamadaPosicional,
  },
  {
    nombre: 'la llamada posicional tampoco pasa por «con nombre»',
    archivo: MIG_OTA,
    muta: (s) => s.replace(LLAMADA_BUENA, LLAMADA_POSICIONAL),
    validador: llamadaConParametrosConNombre,
  },
  {
    nombre: 'quita el p_fact_key: reprocesar duplicaría el asiento',
    archivo: MIG_OTA,
    muta: (s) =>
      s.replace(
        `        p_amount          := v_amount,
        p_fact_key        := 'accrual:ota_commission:' || NEW.id::text
    );`,
        `        p_amount          := v_amount
    );`,
      ),
    validador: idempotentePorFactKey,
  },
  {
    nombre: 'el source_id deja de identificar la fila de detalle',
    archivo: MIG_OTA,
    muta: (s) =>
      s.replace(
        `        p_source_id       := NEW.id::text || ':' || v_event_type,`,
        `        p_source_id       := NEW.reservation_id::text,`,
      ),
    validador: sourceIdIdentificaElHecho,
  },
  {
    nombre: 'fecha el asiento en el instante del disparador, no en el del devengo',
    archivo: MIG_OTA,
    muta: (s) =>
      s.replace(
        `        p_entry_date      := COALESCE(NEW.updated_at, NEW.created_at, now()),`,
        `        p_entry_date      := now(),`,
      ),
    validador: fechaDeDevengo,
  },
  {
    nombre: 'intercambia p_memo y p_source (el desalineamiento de la firma vieja)',
    archivo: MIG_OTA,
    muta: (s) =>
      s.replace(
        `        p_memo            := v_description,
        p_source          := 'ota_commission',`,
        `        p_memo            := 'ota_commission',
        p_source          := v_description,`,
      ),
    validador: origenYMemoEnSuSitio,
  },
  {
    nombre: 'cambia CREATE OR REPLACE por DROP + CREATE (se llevaría los dos triggers y la ACL)',
    archivo: MIG_OTA,
    muta: (s) =>
      s.replace(
        'CREATE OR REPLACE FUNCTION public.fn_auto_journal_ota_commission()',
        'DROP FUNCTION public.fn_auto_journal_ota_commission();\nCREATE FUNCTION public.fn_auto_journal_ota_commission()',
      ),
    validador: contratoOta,
  },
  {
    nombre: 'le quita el SET search_path a una función SECURITY DEFINER',
    archivo: MIG_OTA,
    muta: (s) => s.replace(/\n SET search_path TO 'public', 'pg_temp'\nAS \$function\$/, '\nAS $function$'),
    validador: contratoOta,
  },
  {
    nombre: 'cuela una credencial en la migración (repositorio público)',
    archivo: MIG_OTA,
    muta: (s) =>
      s.replace(
        '-- F-65 — La comision de OTA vuelve a generar su asiento contable.',
        '-- F-65 — La comision de OTA vuelve a generar su asiento contable.\n-- service_role_key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9ejemplo',
      ),
    validador: sinCredenciales,
  },
];

describe('mutaciones sobre los .sql reales (con copia y restauración verificada)', () => {
  const ORIGINALES = new Map<string, string>([[MIG_OTA, leer(MIG_OTA)]]);
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
