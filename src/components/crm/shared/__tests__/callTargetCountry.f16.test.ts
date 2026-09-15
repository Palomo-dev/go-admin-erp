/**
 * FASE-16 · ronda 6 · T19/T20: el indicativo de la organización llega a las
 * llamadas de `normalizePhone` que deciden A QUIÉN SE LLAMA.
 *
 * En la ronda 5 el tester quitó `defaultCountry` de las tres llamadas de
 * `QuickActionsBar` / `MobileCallDialog` y las 333 pruebas siguieron verdes:
 * T-3 estaba «cerrado» solo por `tsc`. El destino de una llamada REAL no puede
 * quedar sin red.
 *
 * No hay @testing-library en el repo (jest en `node`), así que se sigue el
 * precedente de la zona de voz (A-2.4/A-2.6, «se mira el CÓDIGO, no lo que
 * dice de sí mismo»): se lee el fuente sin comentarios y se afirma sobre la
 * forma de cada llamada. Quitar `defaultCountry` de CUALQUIERA de las tres
 * pone esta suite en rojo.
 */
import fs from 'fs';

const QUICK_ACTIONS_BAR = 'src/components/crm/shared/QuickActionsBar.tsx';
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

/**
 * El celular del VENDEDOR (`user_comm_preferences.mobile_phone_e164`) ya es
 * E.164 verificado por OTP: no es el destino de la llamada y no necesita
 * indicativo. Es la única llamada exenta.
 */
const EXENTAS = new Set(['row.mobile_phone_e164']);

describe('T19/T20 · QuickActionsBar: el destino de la llamada lleva el indicativo de la organización', () => {
  const code = stripped(QUICK_ACTIONS_BAR);

  it('lee el indicativo con useOrgDefaultCountry (no un valor fijo)', () => {
    expect(code).toMatch(/import\s*\{\s*useOrgDefaultCountry\s*\}\s*from\s*'\.\/useOrgDefaultCountry'/);
    expect(code).toMatch(/const defaultCountry = useOrgDefaultCountry\(\)/);
    expect(code).not.toMatch(/normalizePhone\([^()]*,\s*'\d+'\s*\)/);
  });

  it('las DOS llamadas con el teléfono del cliente (llamada desde navegador y targetPhone del diálogo) pasan defaultCountry', () => {
    const calls = normalizePhoneCalls(code).filter((c) => c.args[0] === 'customer?.phone');
    expect(calls).toHaveLength(2);
    for (const c of calls) expect(c.args).toEqual(['customer?.phone', 'defaultCountry']);
  });

  it('el `to` de softphone.makeCall es el normalizado con indicativo', () => {
    expect(code).toMatch(/const to = normalizePhone\(customer\?\.phone,\s*defaultCountry\)/);
    expect(code).toMatch(/softphone\.makeCall\(to,/);
  });

  it('el targetPhone que recibe MobileCallDialog es el normalizado con indicativo', () => {
    expect(code).toMatch(/targetPhone=\{normalizePhone\(customer\?\.phone,\s*defaultCountry\)/);
  });

  it('ninguna llamada a normalizePhone queda sin indicativo salvo las exentas', () => {
    for (const c of normalizePhoneCalls(code)) {
      if (EXENTAS.has(c.args[0])) continue;
      expect(c.args[1]).toBe('defaultCountry');
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
