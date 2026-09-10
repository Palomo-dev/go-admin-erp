/**
 * TESTER F4 · ronda 6 — casos NUEVOS (ninguno aparece en las baterías de las
 * rondas 2-6 del constructor ni en `f4Round5Tester`).
 *
 *  - W1-W3: quinta versión del enmascarado, atacada en los DOS sentidos.
 *  - W4: no-regresión de lo que la v5 declara acertar (incluidas las ocho frases
 *    de la fuga de r5, que ahora sí deben ocultarse).
 *  - W5-W6: búsqueda propia del gemelo en el sitio contiguo (campos que la ruta
 *    publica y la interfaz no lee; simetría de las dos guardas `?sync=1`).
 *  - W7: aritmética que verifica la afirmación «7 de 11 en rojo» del constructor.
 *
 * Dobles en memoria y lectura de fuentes: sin red ni BD.
 */
import fs from 'fs';
import path from 'path';
import { maskSensitiveForLlm } from '@/lib/services/crm/callAnalysisRules';

const SRC = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const masked = (s: string) => maskSensitiveForLlm(s).includes('[OCULTO]');

// ══════════════════════════════════════════════════════════════════════════
// W1-W4 · enmascarado v5
// ══════════════════════════════════════════════════════════════════════════
describe('W-A · enmascarado v5: frases nuevas en los dos sentidos', () => {
  it('W1 · CORREGIDO (r7): el PLURAL de los sustantivos «de credencial» se oculta igual que el singular', () => {
    // Estado en la r6: `CREDENTIAL_CONTEXT_NOUNS` sólo tenía formas SINGULARES,
    // mientras que `WEAK_ADJECTIVE_HEADS`, en el mismo archivo, sí listaba los
    // plurales ('factores', 'datos', 'cifras', 'numeros', 'palabras'…). Con la
    // palabra DÉBIL el plural apagaba el enmascarado entero (se leía como
    // modismo) y con la FUERTE cortaba la búsqueda del valor: la credencial
    // viajaba entera. En la r7 los plurales se DERIVAN de los singulares
    // (`pluralForms`), así que la clase queda cerrada por construcción.
    // Mismas nueve frases, expectativa invertida hacia el comportamiento correcto.
    const cerradas = [
      'la clave de los sistemas es Sol2024',
      'la clave de las cuentas es Sol2024',
      'la clave de los usuarios es Sol2024',
      'la clave de las redes es Sol2024',
      'la clave de los accesos es Sol2024',
      'la clave de los portales es Sol2024',
      'la contraseña de los sistemas es Sol2024', // palabra FUERTE: también se escapa
      'la contraseña de las cuentas es Sol2024',
      'el pin de las tarjetas es 4321',
    ];
    // Comportamiento REAL de hoy (r7): se ocultan las nueve.
    expect(cerradas.filter(masked)).toEqual(cerradas);
    // Y el singular equivalente también: el número gramatical ya no decide.
    expect(masked('la clave del sistema es Sol2024')).toBe(true);
    expect(masked('la contraseña de la cuenta es Sol2024')).toBe(true);
    expect(masked('el pin de la tarjeta es 4321')).toBe(true);
  });

  it('W2 · FALSO POSITIVO NUEVO: la cabeza adjetiva ya NO protege cuando la sigue un genitivo de credencial', () => {
    // El docblock de `maskSensitiveForLlm` (pieza 2) sigue diciendo que «clave»
    // «se descarta ENTERA cuando la frase la usa como adjetivo». Desde la r6 el
    // genitivo se evalúa antes y la anula. Frases comerciales normales pierden
    // el nombre del producto/plan que el análisis necesita.
    const destruidas = [
      'el tema clave de la cuenta es Premium2024',
      'la idea clave de la red es Fibra600',
      'el punto clave del portal es Magento2',
      'la pregunta clave del sistema es Windows11',
      'el factor clave de la plataforma es Salesforce2024',
      'el dato clave de la tarjeta es Visa2024',
    ];
    expect(destruidas.filter(masked)).toEqual(destruidas);
    // Sin genitivo de credencial la cabeza adjetiva sigue protegiendo (no-regresión).
    expect(masked('el punto clave del negocio es el iPhone16')).toBe(false);
    expect(masked('el dato clave del proyecto es Fase2')).toBe(false);
  });

  it('W3 · FALSO POSITIVO NUEVO con palabra FUERTE: vuelve el caso canónico de la r4 en variante', () => {
    // `nuestro codigo de seguridad interno es ISO9001` era EL falso positivo que
    // la r5 arregló y que la suite del constructor conserva. Con un sustantivo de
    // credencial en medio (en vez de «interno») vuelve a destruirse la norma.
    expect(masked('nuestro codigo de seguridad interno es ISO9001')).toBe(false); // el que se conserva
    expect(masked('el codigo de seguridad del sistema es ISO9001')).toBe(true); // la variante, destruida
    expect(masked('el codigo de seguridad de la red es ISO9001')).toBe(true);
  });

  it('W4 · NO REGRESIÓN: la fuga de r5 está cerrada y los aciertos/negativas históricos siguen', () => {
    // Las ocho frases de la fuga (tester r5 N2/V1) más variantes ortográficas nuevas.
    for (const s of [
      'la clave del router es Admin2024',
      'LA CLAVE DEL ROUTER ES Admin2024',
      'la clave del WiFi es Sol2024',
      'la clave de la Wi Fi es Sol2024',
      'la clave para el router es Admin2024',
      'la clave de acceso al portal es Sol2024',
      'te paso la clave del router: Admin2024',
      'la clave del router, apuntala, es Admin2024',
      'la clave de acceso es Niño2024',
      '[00:10] [CLIENTE]: la clave del router es Admin2024',
    ]) {
      expect(masked(s)).toBe(true);
    }
    // Dos secretos en la misma línea: se ocultan los dos.
    expect(maskSensitiveForLlm('la clave de acceso es Sol2024 y la contraseña del correo es Luna2025'))
      .toBe('la clave de acceso es [OCULTO] y la contraseña del correo es [OCULTO]');
    // Y las frases comerciales históricas siguen intactas.
    for (const s of [
      'la clave del negocio es el iPhone16',
      'el factor clave fue el plan Pro2026',
      'la clave es 20000000 al mes',
      'la clave del exito es Windows11',
      'la clave del proyecto es Fase2',
      'nuestras palabras clave son marketing y ventas',
      'la cifra clave del sistema es 150000',
      'el numero clave de la red es 4500',
    ]) {
      expect(masked(s)).toBe(false);
    }
    // Tarjetas: sin regresión.
    expect(maskSensitiveForLlm('mi tarjeta es 4111-1111-1111-1111')).toBe('mi tarjeta es [TARJETA ****1111]');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// W5-W6 · el gemelo que busco yo
// ══════════════════════════════════════════════════════════════════════════
describe('W-B · gemelos en el sitio contiguo', () => {
  it('W5 · CORREGIDO (r7): los dos paneles leen `dedupe_checked`, no sólo `deduped`', () => {
    const t = SRC('src/app/api/crm/calls/[id]/transcribe/route.ts');
    const a = SRC('src/app/api/crm/calls/[id]/analyze/route.ts');
    const panelT = SRC('src/components/crm/calls/CallTranscriptPanel.tsx');
    const panelA = SRC('src/components/crm/calls/CallAnalysisPanel.tsx');
    // Las rutas sí lo publican (r5 P2 + r6 N1).
    expect(t).toContain('dedupe_checked');
    expect(a).toContain('dedupe_checked');
    // `deduped` sí se lee en los dos paneles (el gemelo que el constructor cerró).
    expect(panelT).toContain('json.data?.deduped');
    expect(panelA).toContain('json.data?.deduped');
    // Y su hermano TAMBIÉN (r7): el usuario ya no ve «Transcripción en cola · Se
    // procesará en el próximo minuto» cuando el servidor no pudo comprobar si ya
    // había otra viva. Misma aserción, expectativa invertida.
    expect(panelT.includes('dedupe_checked') || panelT.includes('dedupe_error')).toBe(true);
    expect(panelA.includes('dedupe_checked') || panelA.includes('dedupe_error')).toBe(true);
  });

  it('W6 · CORREGIDO (r7): las DOS rutas `?sync=1` comprueban los DOS kinds (la asimetría, cerrada)', () => {
    const t = SRC('src/app/api/crm/calls/[id]/transcribe/route.ts');
    const a = SRC('src/app/api/crm/calls/[id]/analyze/route.ts');
    const tSync = t.slice(t.indexOf('if (sync)'), t.indexOf('// Sufijo de reintento'));
    const aSync = a.slice(a.indexOf('if (sync)'), a.indexOf('enqueueAnalyze('));
    expect(tSync).toContain("'transcribe'");
    expect(tSync).toContain("'analyze'");
    // `/analyze?sync=1` ya mira también si hay un `transcribe` vivo que encadenará
    // análisis (r7): misma aserción, expectativa invertida.
    expect(aSync).toContain("'analyze'");
    expect(aSync.includes("findLiveCallJob(ctx.organizationId, id, 'transcribe'")).toBe(true);
  });

  it('W7 · los seis puntos de encolado del repo: sólo las dos rutas de `calls/[id]` calculan sufijo, y las dos están guardadas', () => {
    const manual = SRC('src/app/api/crm/calls/manual/route.ts');
    const inline = SRC('src/app/api/crm/transcribe/route.ts');
    const webhook = SRC('src/app/api/crm/webhooks/elevenlabs/route.ts');
    const fetchH = SRC('src/lib/jobs/handlers/recordingFetch.ts');
    // Los descartes del constructor, comprobados: encolan sobre una llamada
    // RECIÉN creada (`created.callId`) o con la clave llana, que el índice único
    // parcial ya cubre. Ninguno calcula `forceRetryBucket`.
    for (const s of [manual, inline, webhook, fetchH]) expect(s).not.toContain('forceRetryBucket');
    expect(manual).toContain('created.callId');
    expect(inline).toContain('created.callId');
    // Y las dos que sí lo calculan consultan el job vivo antes de encolar.
    const t = SRC('src/app/api/crm/calls/[id]/transcribe/route.ts');
    const a = SRC('src/app/api/crm/calls/[id]/analyze/route.ts');
    expect(t.slice(0, t.indexOf('enqueueTranscribe('))).toContain("findLiveCallJob(ctx.organizationId, id, 'transcribe', sb)");
    expect(a.slice(0, a.indexOf('enqueueAnalyze('))).toContain("findLiveCallJob(ctx.organizationId, id, 'analyze', sb)");
  });
});
