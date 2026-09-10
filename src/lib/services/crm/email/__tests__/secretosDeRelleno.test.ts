/// <reference types="jest" />
/**
 * Los secretos de RELLENO no pueden pasar por secretos buenos.
 *
 * Hallazgo del orquestador (2026-09-10). El repo ya tiene un detector,
 * `isPlaceholderCredential`, pero **sólo lo usa la ruta de credenciales de
 * proveedor** (Twilio, ElevenLabs, Resend…). Los secretos propios de la
 * plataforma comprueban otra cosa:
 *
 *   · `unsubscribe.ts` acepta cualquier valor de 16 caracteres o más.
 *   · `domainStore.ts` acepta cualquier valor no vacío como clave de cifrado.
 *
 * El entorno real tenía `EMAIL_UNSUBSCRIBE_SECRET='your-email-unsubscribe-…'`,
 * de 36 caracteres. Pasaba la comprobación de longitud, así que **no se usaba
 * el respaldo**: los enlaces de baja se firmaban —y las credenciales de correo
 * guardadas se cifraban— con una cadena que está escrita en la documentación.
 *
 * Eso es peor que no configurar nada: sin configurar, el respaldo deriva la
 * clave de la service-role key y el sistema falla cerrado o firma con algo
 * secreto. Con el relleno, falla ABIERTO con una clave que cualquiera conoce.
 *
 * Se comprobó contra producción antes de cambiar nada: 0 dominios de correo,
 * 0 credenciales cifradas y 0 consentimientos de contacto. El alcance de
 * cerrarlo ahora es nulo; más adelante no lo habría sido.
 */

const RELLENO = 'your-email-unsubscribe-secret-16plus'; // el valor real que había
const SERVICE_KEY = 'clave-de-servicio-de-prueba-solo-para-este-test';
// `verifyUnsubscribeToken` exige que el identificador del mensaje sea un UUID.
const MSG = '3f2a1c4e-5b6d-4e8f-9a0b-1c2d3e4f5a6b';
const CUST = '7e8d9c0b-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

/** Reimporta el módulo con el entorno ya puesto (lee `process.env` al firmar). */
function conEntorno<T>(env: Record<string, string | undefined>, fn: (m: typeof import('../unsubscribe')) => T): T {
  const previo = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    let salida!: T;
    jest.isolateModules(() => {
      salida = fn(require('../unsubscribe') as typeof import('../unsubscribe'));
    });
    return salida;
  } finally {
    process.env = previo;
  }
}

const firmar = (env: Record<string, string | undefined>) =>
  conEntorno(env, (m) => m.signUnsubscribeToken(MSG, CUST));

describe('secretos de relleno · enlaces de baja', () => {
  it('un secreto de relleno se IGNORA y se usa el respaldo', () => {
    const conRelleno = firmar({
      EMAIL_UNSUBSCRIBE_SECRET: RELLENO,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    });
    const sinNada = firmar({
      EMAIL_UNSUBSCRIBE_SECRET: undefined,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    });
    // Si el relleno se usara como secreto, las dos firmas serían distintas.
    expect(conRelleno).toBe(sinNada);
  });

  it('un secreto de verdad SÍ se usa (la corrección no descarta lo bueno)', () => {
    const conReal = firmar({
      EMAIL_UNSUBSCRIBE_SECRET: 'K7#pQ2vR9wLm4Zt8Xc1Nb6Hy3Jd5Fg0S',
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    });
    const sinNada = firmar({
      EMAIL_UNSUBSCRIBE_SECRET: undefined,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    });
    expect(conReal).not.toBe(sinNada);
  });

  it('sin secreto y sin respaldo, falla CERRADO en vez de firmar con cualquier cosa', () => {
    expect(() =>
      firmar({ EMAIL_UNSUBSCRIBE_SECRET: RELLENO, SUPABASE_SERVICE_ROLE_KEY: undefined })
    ).toThrow(/no configurado/i);
  });

  it('lo firmado con el respaldo se verifica con el respaldo', () => {
    const env = { EMAIL_UNSUBSCRIBE_SECRET: RELLENO, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY };
    const token = firmar(env);
    const leido = conEntorno(env, (m) => m.verifyUnsubscribeToken(token));
    expect(leido).toEqual({ email_message_id: MSG, customer_id: CUST });
  });
});

describe('secretos de relleno · claves de cifrado de credenciales', () => {
  it('el relleno no entra en las fuentes de clave', () => {
    const previo = { ...process.env };
    process.env.EMAIL_CREDENTIALS_SECRET = 'your-email-credentials-secret-largo';
    process.env.EMAIL_UNSUBSCRIBE_SECRET = RELLENO;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
    try {
      let fuentes: string[] = [];
      jest.isolateModules(() => {
        const m = require('../domainStore') as { credentialKeySources?: () => string[] };
        fuentes = m.credentialKeySources ? m.credentialKeySources() : [];
      });
      expect(fuentes).not.toContain('your-email-credentials-secret-largo');
      expect(fuentes).not.toContain(RELLENO);
      expect(fuentes).toContain(SERVICE_KEY);
    } finally {
      process.env = previo;
    }
  });
});
