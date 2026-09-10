/**
 * Harness de `verifyResendWebhook` con el paquete `svix` REAL (ESM-only).
 *
 * Jest corre en CommonJS y no puede cargar `svix` (ni siquiera vía
 * `createRequire`: jest intercepta el registro de módulos), que es exactamente
 * la razón por la que el bug de svix ≥2 (`Webhook.verify()` → void) llegó a
 * producción sin que ningún test lo viera. Este archivo se ejecuta con `tsx`
 * desde `svixReal.test.ts` en un proceso aparte e imprime un JSON con el
 * resultado de cada caso.
 *
 * NO es un test (jest solo ejecuta `*.test.ts`) y no toca la red ni la BD.
 *
 * Ejecutar a mano:
 *   npx tsx src/lib/services/crm/email/__tests__/svixReal.harness.mts
 */

const ROOT = new URL('../../../../../../', import.meta.url).href.replace(/\/$/, '');

const SECRET = 'whsec_' + Buffer.from('f7-r2-svix-real-secret-in-memory').toString('base64');
process.env.RESEND_WEBHOOK_SECRET = SECRET;

const { Webhook } = await import(`${ROOT}/node_modules/svix/dist/index.mjs`);
const { verifyResendWebhook, WebhookError } = await import(`${ROOT}/src/lib/security/webhookSignatures.ts`);

const wh = new Webhook(SECRET);

function sign(body: string, id = 'msg_f7r2', when = new Date()) {
  return {
    'svix-id': id,
    'svix-timestamp': String(Math.floor(when.getTime() / 1000)),
    'svix-signature': wh.sign(id, when, body),
  } as Record<string, string>;
}

interface Case { name: string; ok: boolean; detail: unknown }
const cases: Case[] = [];
const add = (name: string, ok: boolean, detail: unknown) => cases.push({ name, ok, detail });

// 0) La premisa: con svix >= 2, verify() devuelve undefined con firma VÁLIDA.
{
  const body = JSON.stringify({ type: 'email.sent', data: { email_id: 're_1' } });
  const out = wh.verify(body, sign(body));
  add('svix_verify_devuelve_void', out === undefined, { typeof: typeof out, svixVersion: 2 });
}

// 1) Firma válida → el helper devuelve el payload PARSEADO (no undefined).
{
  const payload = { type: 'email.delivered', created_at: '2026-09-08T10:00:00Z', data: { email_id: 're_abc' } };
  const body = JSON.stringify(payload);
  const out = verifyResendWebhook<typeof payload>(body, sign(body));
  add('firma_valida_devuelve_payload', !!out && out.type === 'email.delivered' && out.data.email_id === 're_abc', out);
}

// 2) Firma válida + JSON inválido → WebhookError 400 invalid_json (no 401).
{
  const body = '{ esto no es json';
  try {
    verifyResendWebhook(body, sign(body));
    add('json_invalido_400', false, 'no lanzó');
  } catch (err) {
    const e = err as InstanceType<typeof WebhookError>;
    add('json_invalido_400', e?.statusCode === 400 && e?.code === 'invalid_json', { statusCode: e?.statusCode, code: e?.code });
  }
}

// 3) Firma inválida → 401 resend_signature_invalid.
{
  const body = JSON.stringify({ type: 'email.sent', data: {} });
  const headers = sign(body);
  headers['svix-signature'] = 'v1,' + Buffer.from('firma-falsa').toString('base64');
  try {
    verifyResendWebhook(body, headers);
    add('firma_invalida_401', false, 'no lanzó');
  } catch (err) {
    const e = err as InstanceType<typeof WebhookError>;
    add('firma_invalida_401', e?.statusCode === 401 && e?.code === 'resend_signature_invalid', { statusCode: e?.statusCode, code: e?.code });
  }
}

// 4) Cuerpo alterado tras firmar → 401.
{
  const body = JSON.stringify({ type: 'email.sent', data: { email_id: 're_1' } });
  const headers = sign(body);
  try {
    verifyResendWebhook(body.replace('re_1', 're_2'), headers);
    add('cuerpo_alterado_401', false, 'no lanzó');
  } catch (err) {
    const e = err as InstanceType<typeof WebhookError>;
    add('cuerpo_alterado_401', e?.statusCode === 401, { statusCode: e?.statusCode, code: e?.code });
  }
}

// 5) Sin secreto configurado → 401 fail-closed (nunca "warn & continue").
{
  const body = JSON.stringify({ type: 'email.sent', data: {} });
  const headers = sign(body);
  delete process.env.RESEND_WEBHOOK_SECRET; // el 3er parámetro toma su valor por defecto de aquí
  try {
    verifyResendWebhook(body, headers);
    add('sin_secreto_401', false, 'no lanzó');
  } catch (err) {
    const e = err as InstanceType<typeof WebhookError>;
    add('sin_secreto_401', e?.statusCode === 401 && e?.code === 'resend_webhook_secret_missing', { statusCode: e?.statusCode, code: e?.code });
  }
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
}

// 6) Replay antiguo (20 min) → 401 por la tolerancia de svix.
{
  const body = JSON.stringify({ type: 'email.sent', data: {} });
  const headers = sign(body, 'msg_old', new Date(Date.now() - 20 * 60 * 1000));
  try {
    verifyResendWebhook(body, headers);
    add('replay_antiguo_401', false, 'no lanzó');
  } catch (err) {
    const e = err as InstanceType<typeof WebhookError>;
    add('replay_antiguo_401', e?.statusCode === 401, { statusCode: e?.statusCode, code: e?.code });
  }
}

process.stdout.write(`__SVIX_RESULT__${JSON.stringify(cases)}__END__\n`);
