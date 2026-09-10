/**
 * TESTER F4 · ronda 5 — casos NUEVOS (ninguno aparece en las baterías de las
 * rondas 2, 3, 4 ni en `f4Round5Builder`).
 *
 *  - V1-V5: cuarta versión del enmascarado, atacada en los DOS sentidos con
 *    frases que no están en ninguna batería anterior.
 *  - V6: no regresión de lo que la v4 declara acertar.
 *  - V7: búsqueda del defecto de la MISMA familia en el sitio contiguo (la
 *    guarda de job vivo que se añadió a `/analyze` y NO a `/transcribe`).
 *
 * Dobles en memoria: sin red ni BD.
 */
import fs from 'fs';
import path from 'path';
import { maskSensitiveForLlm } from '@/lib/services/crm/callAnalysisRules';

const SRC = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

// ══════════════════════════════════════════════════════════════════════════
// V1-V5 · enmascarado v4
// ══════════════════════════════════════════════════════════════════════════
describe('V-A · enmascarado v4: frases nuevas en los dos sentidos', () => {
  it('V1 · [CERRADO EN r6] los sustantivos que el código declara «de credencial» ahora SÍ son conectores', () => {
    // Denuncia original (r5): CREDENTIAL_CONTEXT_NOUNS mantenía la lectura de
    // credencial tras «clave de/del», pero 8 de esos 17 sustantivos no eran
    // conectores, así que findSecretValue cortaba justo en la palabra que acababa
    // de declarar que SÍ hay credencial y la credencial viajaba entera al LLM.
    // Ronda 6: `SECRET_CONNECTORS` se construye con `...CREDENTIAL_CONTEXT_NOUNS`,
    // así que la contradicción interna no puede volver. Las MISMAS ocho frases,
    // con la expectativa correcta.
    const leaks = [
      'la clave del router es Admin2024',
      'la clave del sistema es Sol2024',
      'la clave del portal es Verano2025',
      'la clave de la red es Ana1990',
      'la clave de la plataforma es Secreta99',
      'la clave del modem es Casa2020',
      'la clave de ingreso es Sol2024',
      'la clave de login es Sol2024',
    ];
    const filtradas = leaks.filter((s) => maskSensitiveForLlm(s).includes('[OCULTO]'));
    expect(filtradas).toEqual(leaks); // las ocho se ocultan: nada viaja al LLM
  });

  it('V2 · «palabra clave»: la variante con genitivo de credencial queda cerrada; la otra sigue declarada como límite', () => {
    // Ronda 6: el genitivo se mira ANTES que la cabeza adjetiva, así que
    // «de acceso» / «del wifi» rescatan la frase.
    expect(maskSensitiveForLlm('la palabra clave de acceso es Verano2025')).toContain('[OCULTO]');
    // Sin genitivo de credencial, «palabra clave» sigue siendo «keyword» (SEO) y
    // se descarta: límite L9, DECLARADO en el docblock y en §17.2 del doc.
    expect(maskSensitiveForLlm('mi palabra clave es Sol2024')).not.toContain('[OCULTO]');
  });

  it('V3 · LÍMITE DECLARADO (L10/L11 en r6): una credencial con separador o dictada se salva entera', () => {
    for (const s of [
      'mi contraseña es Sol-2024',
      'mi contraseña es Sol_2024',
      'mi contraseña es Sol.2024',
      'la clave de acceso es Sol 2024',
      'el pin es el numero 4321',
    ]) {
      expect(maskSensitiveForLlm(s)).not.toContain('[OCULTO]');
    }
  });

  it('V4 · [CERRADO EN r6] el propio ejemplo del doc con la grafía habitual («Wi-Fi») también se oculta', () => {
    expect(maskSensitiveForLlm('la clave del wifi es Sol2024')).toContain('[OCULTO]'); // declarado
    expect(maskSensitiveForLlm('la clave del Wi-Fi es Sol2024')).toContain('[OCULTO]'); // mismo caso, ahora igual
    expect(maskSensitiveForLlm('la clave del wi-fi es Sol2024')).toContain('[OCULTO]');
  });

  it('V5 · FP NUEVO: «la clave es que … <producto alfanumérico>» sigue destruyendo el producto', () => {
    expect(maskSensitiveForLlm('la clave es que el Galaxy24 se vende solo')).toContain('[OCULTO]');
    expect(maskSensitiveForLlm('la clave es que usamos el Modelo3 en toda la flota')).toContain('[OCULTO]');
  });

  it('V6 · NO REGRESIÓN: lo que la v4 declara acertar sigue acertando', () => {
    for (const s of [
      'mi clave personal es Sol2024',
      'la clave de acceso es Secreta99',
      'la contraseña que usamos siempre es Verano2025',
      'el cvv es 123',
      'la clave del wifi es Sol2024',
    ]) {
      expect(maskSensitiveForLlm(s)).toContain('[OCULTO]');
    }
    for (const s of [
      'La clave del negocio es el iPhone16',
      'el factor clave fue el plan Pro2026',
      'nuestro codigo de seguridad interno es ISO9001',
      'el numero clave es 150000',
      'la cifra clave es 4500',
      'La clave es 20000000 al mes',
    ]) {
      expect(maskSensitiveForLlm(s)).not.toContain('[OCULTO]');
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// V7 · el sitio contiguo: la guarda de job vivo llegó a /analyze y no a /transcribe
// ══════════════════════════════════════════════════════════════════════════
describe('V-B · el defecto de la misma familia en el sitio contiguo', () => {
  it('V7 · [CERRADO EN r6] el camino de COLA de /transcribe consulta el job vivo antes de encolar', () => {
    const t = SRC('src/app/api/crm/calls/[id]/transcribe/route.ts');
    const a = SRC('src/app/api/crm/calls/[id]/analyze/route.ts');

    // /analyze (corregido en r5): consulta el job vivo ANTES de encolar el force.
    const aEnqueue = a.indexOf('enqueueAnalyze(');
    expect(a.slice(0, aEnqueue)).toContain('if (force) live = await findLiveCallJob(');

    // /transcribe (r5): la única llamada a findLiveCallJob estaba en la rama
    // `sync`; el camino de cola calculaba `retry` (clave DISTINTA cada minuto) y
    // encolaba a ciegas. Ronda 6: el mismo guardia que `/analyze`, con el kind
    // `transcribe`, ANTES de encolar, y `deduped:true` en la respuesta.
    const tEnqueue = t.indexOf('enqueueTranscribe(');
    const tSyncEnd = t.indexOf('// Sufijo de reintento');
    const colaBlock = t.slice(tSyncEnd, tEnqueue);
    expect(colaBlock).toContain('forceRetryBucket()');
    expect(colaBlock).toContain('findLiveCallJob('); // ← el hueco, cerrado
    expect(colaBlock).toContain("'transcribe'");
    expect(t).toMatch(/deduped: true/);
  });

  it('V7b · con `retry` la clave cambia de ventana en ventana: el índice único no puede frenarla', () => {
    // Fórmula real, leída del fuente (sin importar el módulo: arrastra el cliente supabase).
    const svc = SRC('src/lib/services/crm/callIntelligenceService.ts');
    expect(svc).toContain('`transcribe:${callId}`');
    expect(svc).toContain('FORCE_RETRY_WINDOW_MS = 60_000');
    expect(svc).toContain('dedupeKey: extra.retry ? `${TRANSCRIBE_DEDUPE(callId)}:retry:${extra.retry}` : TRANSCRIBE_DEDUPE(callId)');
    const bucket = (now: number) => Math.floor(now / 60_000);
    const k1 = `transcribe:call-x:retry:${bucket(1_000_000_000)}`;
    const k2 = `transcribe:call-x:retry:${bucket(1_000_000_000 + 61_000)}`;
    expect(k1).not.toEqual(k2); // dos claves vivas ⇒ dos jobs ⇒ dos cobros de STT
  });
});
