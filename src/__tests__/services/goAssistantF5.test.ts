/**
 * GO Assistant — Fase 5: audio entra y sale (§5.5.1).
 *
 * La voz en vivo por WebSocket depende del `ws-server` desplegado (§5.5.2) y
 * queda tras `voice_enabled`. Lo que sí vive aquí: la nota de voz pasa por la
 * cadena STT del ERP y devuelve confianza; la respuesta en audio solo si la
 * organización lo activó, y el texto que se lee no lleva markdown.
 */

import fs from 'fs';
import path from 'path';
import { textoDecible, MAX_TTS_CHARS } from '@/lib/ai/assistant/tts';

const SRC = path.join(process.cwd(), 'src');
const leer = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');

describe('F5 — texto decible', () => {
  it('quita el markdown que se lee fatal en voz alta', () => {
    const md = '## Resumen\n\n- **Camisa azul**: 3 × $25.000\n- [ver producto](https://x)\n\n`sku-1` listo';
    expect(textoDecible(md)).toBe('Resumen Camisa azul: 3 × $25.000 ver producto sku-1 listo');
  });

  it('descarta bloques de código y tablas', () => {
    expect(textoDecible('Hola\n```sql\nselect 1\n```\n| a | b |\n|---|---|')).toBe('Hola a b --- ---');
  });

  it('recorta al tope: nadie escucha 5.000 caracteres', () => {
    expect(textoDecible('x'.repeat(10_000)).length).toBe(MAX_TTS_CHARS);
  });
});

describe('F5 — contratos de las rutas (por lectura del código)', () => {
  it('la transcripción usa la cadena STT del ERP, no Whisper cableado, y devuelve confianza', () => {
    const src = leer('app/api/ai-assistant/transcribe/route.ts');
    expect(src).toContain('transcribeWithFallback');
    expect(src).not.toContain("'whisper-1'");
    expect(src).not.toContain('openai.audio.transcriptions');
    expect(src).toContain('confidence');
  });

  it('la transcripción y el TTS cobran DESPUÉS de tener el resultado (§2.8)', () => {
    for (const ruta of ['app/api/ai-assistant/transcribe/route.ts', 'app/api/ai-assistant/tts/route.ts']) {
      const src = leer(ruta);
      const saldo = src.indexOf('checkAICredits(');
      const proveedor = ruta.includes('tts') ? src.indexOf('api.elevenlabs.io') : src.indexOf('transcribeWithFallback(');
      const cobro = src.indexOf('chargeAiCredits(');
      expect(saldo).toBeGreaterThan(-1);
      expect(proveedor).toBeGreaterThan(saldo);
      expect(cobro).toBeGreaterThan(proveedor);
    }
  });

  it('el TTS respeta tts_enabled de la organización y no acepta un voice_id arbitrario en la URL', () => {
    const src = leer('app/api/ai-assistant/tts/route.ts');
    expect(src).toContain('tts_enabled');
    expect(src).toContain("'TTS_DISABLED'");
    expect(src).toMatch(/\^\[A-Za-z0-9_-\]\{1,64\}\$/);
  });

  it('el archivo de ruta del TTS no exporta nada que Next no admita', () => {
    const src = leer('app/api/ai-assistant/tts/route.ts');
    const exports = Array.from(src.matchAll(/^export (?:const|async function|function) (\w+)/gm)).map((m) => m[1]);
    for (const e of exports) expect(['POST', 'runtime', 'dynamic']).toContain(e);
  });
});
