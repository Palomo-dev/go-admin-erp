/// <reference types="jest" />
/**
 * Telefonía no configurada: QUIÉN tiene que enterarse depende de DE QUIÉN son
 * las llaves que faltan.
 *
 * Hallazgo del dueño (2026-09-10), con captura: el softphone le mostraba a una
 * organización cliente «Faltan API Key de Twilio, API Secret de Twilio, TwiML
 * App SID…» con los nombres de las variables de entorno y un enlace a
 * «Proveedores e IA» para que las guardara. Pero el valor por defecto de
 * `voice:twilio` es `use_master_account: true`: **las llaves son de la
 * plataforma**, las conecta el dueño, y el cliente no tiene ni que saber que
 * existe Twilio.
 *
 * `getVoiceCredentials` ya devuelve `source`: `'org'` si la organización
 * configuró las suyas, `'env'`/`'none'` si vienen de la plataforma. Con eso:
 *   - faltan y `source !== 'org'`  → ámbito PLATAFORMA: el cliente ve un texto
 *     neutro sin proveedor ni variables, y el servidor lo registra para el dueño;
 *   - faltan y `source === 'org'`  → ámbito ORGANIZACIÓN: su administrador
 *     configuró mal sus propias llaves, y a él sí se le puede indicar dónde.
 */

jest.mock('../voiceContextService', () => {
  const real = jest.requireActual('../voiceContextService');
  return { ...real, getVoiceCredentials: jest.fn() };
});

import { getVoiceCredentials, VoiceNotConfiguredError } from '../voiceContextService';
import { generateVoiceToken } from '../voiceTokenService';

const mocked = getVoiceCredentials as jest.MockedFunction<typeof getVoiceCredentials>;

function credsSin(source: 'org' | 'env' | 'none') {
  return {
    accountSid: 'AC' + 'a'.repeat(32),
    authToken: '',
    apiKey: '',
    apiSecret: '',
    twimlAppSid: '',
    defaultNumber: '',
    isSubaccount: false,
    source,
  };
}

async function capturar(): Promise<VoiceNotConfiguredError> {
  try {
    await generateVoiceToken(7, 'u-1');
  } catch (e) {
    if (e instanceof VoiceNotConfiguredError) return e;
    throw e;
  }
  throw new Error('no lanzó');
}

describe('VoiceNotConfiguredError · ámbito de las llaves que faltan', () => {
  it('llaves de la plataforma (source env) → ámbito platform', async () => {
    mocked.mockResolvedValueOnce(credsSin('env'));
    const err = await capturar();
    expect(err.scope).toBe('platform');
    // Para los logs del dueño sí se conserva qué falta.
    expect(err.missing).toEqual(expect.arrayContaining(['TWILIO_API_KEY', 'TWILIO_API_SECRET', 'TWILIO_TWIML_APP_SID']));
  });

  it('sin ninguna fuente (source none) → también platform', async () => {
    mocked.mockResolvedValueOnce(credsSin('none'));
    expect((await capturar()).scope).toBe('platform');
  });

  it('la organización configuró las suyas y le faltan (source org) → ámbito organization', async () => {
    mocked.mockResolvedValueOnce(credsSin('org'));
    expect((await capturar()).scope).toBe('organization');
  });

  it('el mensaje que se le puede mostrar a un cliente no nombra al proveedor ni variables', async () => {
    mocked.mockResolvedValueOnce(credsSin('env'));
    const err = await capturar();
    expect(err.publicMessage).not.toMatch(/twilio/i);
    expect(err.publicMessage).not.toMatch(/TWILIO_|API Key|API Secret|TwiML/);
    expect(err.publicMessage.length).toBeGreaterThan(10);
  });
});

// ─── Lado del navegador: el texto que ve la persona ──────────────────────────
// Función pura del hook, sin React ni red.
import { describeNotConfigured } from '@/components/voice/hooks/useTwilioDevice';

describe('describeNotConfigured · lo que ve la persona en el softphone', () => {
  const faltan = ['TWILIO_API_KEY', 'TWILIO_API_SECRET', 'TWILIO_TWIML_APP_SID'];

  it('ámbito platform: ni proveedor, ni variables, ni «configúralo»', () => {
    const texto = describeNotConfigured({ scope: 'platform', missing: faltan, message: 'La telefonía aún no está habilitada para tu organización. Contacta al soporte de la plataforma.' });
    expect(texto).not.toMatch(/twilio/i);
    expect(texto).not.toMatch(/TWILIO_|API Key|API Secret|TwiML/);
    expect(texto).not.toMatch(/Proveedores e IA|configur/i);
  });

  it('ámbito platform con mensaje vacío del servidor: sigue sin filtrar nada', () => {
    const texto = describeNotConfigured({ scope: 'platform', missing: faltan, message: '' });
    expect(texto).not.toMatch(/twilio|TWILIO_/i);
    expect(texto.length).toBeGreaterThan(10);
  });

  it('ámbito organization: a su administrador SÍ se le dice qué falta', () => {
    const texto = describeNotConfigured({ scope: 'organization', missing: faltan, message: '' });
    expect(texto).toMatch(/API Key de Twilio/);
    expect(texto).toMatch(/tu organización/);
  });
});
