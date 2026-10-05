/**
 * FASE-16 · ronda 6 · T19/T20: el indicativo de la organización llega a las
 * llamadas de `normalizePhone` que deciden A QUIÉN SE LLAMA.
 *
 * En la ronda 5 el tester quitó `defaultCountry` de las tres llamadas de
 * `AccionesRapidasCrm` / `MobileCallDialog` y las 333 pruebas siguieron verdes:
 * T-3 estaba «cerrado» solo por `tsc`. El destino de una llamada REAL no puede
 * quedar sin red.
 *
 * No hay @testing-library en el repo (jest en `node`), así que se sigue el
 * precedente de la zona de voz (A-2.4/A-2.6, «se mira el CÓDIGO, no lo que
 * dice de sí mismo»): se lee el fuente sin comentarios y se afirma sobre la
 * forma de cada llamada. Quitar el indicativo de cualquier destino
 * pone esta suite en rojo.
 */
import fs from 'fs';

const ACCIONES_RAPIDAS = 'src/components/crm/acciones/AccionesRapidasCrm.tsx';
const MOBILE_CALL_DIALOG = 'src/components/crm/shared/MobileCallDialog.tsx';

/** Fuente sin líneas de comentario. */
function stripped(file: string): string {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
}

interface Call { args: string[]; text: string }

/** Todas las llamadas `normalizePhone(...)` del fuente, con sus argumentos. */
function normalizePhoneCalls(code: string): Call[] {
  const out: Call[] = [];
  const re = /normalizePhone\(([^()]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    out.push({ text: m[0], args: m[1].split(',').map((a) => a.trim()).filter(Boolean) });
  }
  return out;
}

/** El celular verificado del vendedor ya es E.164 y no es el destino. */
const EXENTAS = new Set(['row.mobile_phone_e164']);

// Ola 5: QuickActionsBar fue sustituido por AccionesRapidasCrm. Se protege
// el consumidor vigente: una normalización compartida por navegador y puente.
describe('T19/T20 · AccionesRapidasCrm: el destino lleva el indicativo de la organización', () => {
  const code = stripped(ACCIONES_RAPIDAS);

  it('lee el indicativo con useOrgDefaultCountry y no escribe uno fijo', () => {
    expect(code).toMatch(/import\s*\{\s*useOrgDefaultCountry\s*\}\s*from\s*'@\/components\/crm\/shared\/useOrgDefaultCountry'/);
    expect(code).toMatch(/const pais = useOrgDefaultCountry\(\) \?\? undefined/);
    expect(code).not.toMatch(/normalizePhone\([^()]*,\s*'\d+'\s*\)/);
  });

  it('normaliza el teléfono del cliente una sola vez con el indicativo', () => {
    const calls = normalizePhoneCalls(code);
    expect(calls.map((c) => c.args)).toEqual([['cliente?.phone', 'pais']]);
    expect(code).toMatch(/const telefono = normalizePhone\(cliente\?\.phone,\s*pais\)/);
  });

  it('el destino del softphone es el teléfono ya normalizado', () => {
    expect(code).toMatch(/softphone\.makeCall\(telefono,/);
    expect(code).not.toMatch(/softphone\.makeCall\(cliente\?\.phone,/);
  });

  it('el puente recibe el mismo teléfono normalizado', () => {
    expect(code).toMatch(/<MobileCallDialog[\s\S]*?targetPhone=\{telefono(?:\s*\?\?\s*'')?\}/);
  });

  it('ninguna normalización omite el indicativo de la organización', () => {
    for (const c of normalizePhoneCalls(code)) {
      if (EXENTAS.has(c.args[0])) continue;
      expect(c.args[1]).toBe('pais');
    }
  });
});

describe('T19/T20 · MobileCallDialog: el `to` del puente lleva el indicativo de la organización', () => {
  const code = stripped(MOBILE_CALL_DIALOG);

  it('lee el indicativo con useOrgDefaultCountry (no un valor fijo)', () => {
    expect(code).toMatch(/import\s*\{\s*useOrgDefaultCountry\s*\}\s*from\s*'\.\/useOrgDefaultCountry'/);
    expect(code).toMatch(/const defaultCountry = useOrgDefaultCountry\(\)/);
    expect(code).not.toMatch(/normalizePhone\([^()]*,\s*'\d+'\s*\)/);
  });

  it('el `to` que va a POST /api/voice/bridge/initiate es normalizePhone(targetPhone, defaultCountry)', () => {
    expect(code).toMatch(/const to = normalizePhone\(targetPhone,\s*defaultCountry\)/);
    // Y es ESE `to` el que viaja en el body (no targetPhone en crudo).
    expect(code).toMatch(/body:\s*JSON\.stringify\(\{\s*to,/);
    expect(code).toMatch(/fetch\('\/api\/voice\/bridge\/initiate'/);
  });

  it('todas las llamadas con targetPhone (destino y el «Cliente:» que se muestra) pasan defaultCountry', () => {
    const calls = normalizePhoneCalls(code).filter((c) => c.args[0] === 'targetPhone');
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const c of calls) expect(c.args).toEqual(['targetPhone', 'defaultCountry']);
  });

  it('la única llamada exenta es la del celular del vendedor (ya E.164 y verificado por OTP)', () => {
    const sinIndicativo = normalizePhoneCalls(code).filter((c) => c.args.length === 1).map((c) => c.args[0]);
    expect(sinIndicativo).toEqual(['row.mobile_phone_e164']);
  });
});
