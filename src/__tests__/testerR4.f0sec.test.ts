/// <reference types="jest" />
/**
 * F0-SEC r4 · tester · caso 21 de `guardrails.test.ts` (bytes de control) y el
 * byte 0x01 que dejaba muerta la guarda de cron strings del caso JOBS.
 *
 * El caso 21 no exporta nada, así que aquí se comprueba desde fuera:
 *  - el regex del caso 21 se extrae del fuente de `guardrails.test.ts` y se
 *    ejercita contra bytes reales en un directorio temporal (NUL, SOH, BEL, VT,
 *    FF, ESC, 0x1F → detectados; TAB, LF, CR, 0x20, 0x7F, UTF-8 multibyte →
 *    tolerados);
 *  - el propio `guardrails.test.ts` no lleva bytes de control y su regex de
 *    cron strings lleva `\1` como retrorreferencia (no 0x01) y CASA con un
 *    cron string real;
 *  - el archivo del tester r3 que llevaba el NUL es texto (contiene `\u0000`
 *    como secuencia de escape);
 *  - un barrido independiente de `src/**` con `latin1` da 0 ofensores (si el
 *    caso 21 se mutara, este barrido seguiría en rojo ante un byte real).
 *
 * Sin bytes de control en este archivo: todo va como secuencia de escape.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const SRC_ROOT = path.resolve(__dirname, '..');
const GUARDRAILS = path.join(SRC_ROOT, '__tests__', 'guardrails.test.ts');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.next') walk(p, out);
    else if (e.isFile() && /\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Regex del caso 21 tal cual está escrito en el guardarraíl (`const CONTROL_BYTE = /.../`). */
function controlByteRegexFromGuardrail(): RegExp {
  const src = fs.readFileSync(GUARDRAILS, 'utf8');
  const m = /const CONTROL_BYTE = \/(.+?)\/;/.exec(src);
  if (!m) throw new Error('caso 21: no se encontró CONTROL_BYTE en guardrails.test.ts');
  return new RegExp(m[1]);
}

describe('caso 21 · el detector de bytes de control', () => {
  const CONTROL_BYTE = controlByteRegexFromGuardrail();

  test('está definido como [\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F] (sin allow-list de archivos)', () => {
    expect(CONTROL_BYTE.source).toBe('[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]');
    const src = fs.readFileSync(GUARDRAILS, 'utf8');
    const caso21 = src.slice(src.indexOf('Caso 21'));
    expect(caso21).toContain('walkDir(SRC_ROOT)');
    expect(caso21).not.toMatch(/isExcluded\(/);
    expect(caso21).toContain("toString('latin1')");
  });

  test.each<[string, number]>([
    ['NUL', 0x00], ['SOH', 0x01], ['BEL', 0x07], ['BS', 0x08], ['VT', 0x0b], ['FF', 0x0c], ['SO', 0x0e], ['US', 0x1f], ['ESC', 0x1b],
  ])('detecta %s (0x%s) escrito como byte real en un archivo temporal', (_l, byte) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f0sec-r4-'));
    try {
      const file = path.join(dir, 'sonda.ts');
      fs.writeFileSync(file, Buffer.concat([Buffer.from("const a = 'x", 'utf8'), Buffer.from([byte]), Buffer.from("y';\n", 'utf8')]));
      const raw = fs.readFileSync(file).toString('latin1');
      const m = CONTROL_BYTE.exec(raw);
      expect(m).not.toBeNull();
      expect(raw.charCodeAt(m!.index)).toBe(byte);
      expect(raw.slice(0, m!.index).split('\n').length).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('tolera TAB, LF, CR, CRLF, espacio, DEL (0x7F) y UTF-8 multibyte (ñ, emoji) leídos como latin1', () => {
    const buf = Buffer.concat([Buffer.from('a\tb\nc\r\nd \u007f', 'utf8'), Buffer.from('ñ 🙂 “comillas”', 'utf8')]);
    expect(CONTROL_BYTE.test(buf.toString('latin1'))).toBe(false);
  });

  test('las secuencias de escape en el fuente (\\u0000, \\x1b, \\0) NO son bytes de control', () => {
    expect(CONTROL_BYTE.test("const nul = 'pn-a\\u0000'; const esc = '\\x1b[0m'; const z = '\\0';")).toBe(false);
  });

  test('un archivo con NUL bajo un src/ simulado deja el barrido en rojo con archivo:línea (0x00)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f0sec-r4-src-'));
    try {
      fs.mkdirSync(path.join(dir, 'lib'));
      fs.writeFileSync(path.join(dir, 'lib', 'limpio.ts'), 'export const ok = 1;\n');
      fs.writeFileSync(path.join(dir, 'lib', 'sucio.test.ts'), Buffer.concat([Buffer.from('line1\nline2\nconst x = "a', 'utf8'), Buffer.from([0]), Buffer.from('b";\n', 'utf8')]));
      const offenders: string[] = [];
      for (const file of walk(dir)) {
        const raw = fs.readFileSync(file).toString('latin1');
        const m = CONTROL_BYTE.exec(raw);
        if (m) offenders.push(`${path.relative(dir, file).replace(/\\/g, '/')}:${raw.slice(0, m.index).split('\n').length} (0x${raw.charCodeAt(m.index).toString(16).padStart(2, '0')})`);
      }
      expect(offenders).toEqual(['lib/sucio.test.ts:3 (0x00)']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('caso 21 · estado real del árbol', () => {
  test('barrido independiente: ningún .ts/.tsx bajo src/ (tests incluidos) lleva bytes de control', () => {
    const CONTROL_BYTE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;
    const offenders = walk(SRC_ROOT).filter((f) => CONTROL_BYTE.test(fs.readFileSync(f).toString('latin1'))).map((f) => path.relative(SRC_ROOT, f).replace(/\\/g, '/'));
    expect(offenders).toEqual([]);
  });

  test('el test del tester r3 que llevaba el NUL es texto: contiene la secuencia \\u0000 y ningún 0x00', () => {
    const file = path.join(SRC_ROOT, 'lib', 'services', 'integrations', 'whatsapp', '__tests__', 'testerR3.f0sec.test.ts');
    const buf = fs.readFileSync(file);
    expect(buf.includes(0)).toBe(false);
    expect(buf.toString('utf8')).toContain("'pn-a\\u0000'");
  });

  test('guardrails.test.ts: el regex de cron strings del caso JOBS lleva \\1 (retrorreferencia), no 0x01, y CASA con un cron string real', () => {
    const src = fs.readFileSync(GUARDRAILS, 'utf8');
    expect(src.includes('\u0001')).toBe(false);
    const line = src.split('\n').find((l) => l.includes("(['\"`])(\\*\\/\\d+|\\d+ \\d+|\\*) \\* \\* \\* \\*\\1"));
    expect(line).toBeDefined();
    const CRON = /(['"`])(\*\/\d+|\d+ \d+|\*) \* \* \* \*\1/;
    expect(CRON.test("schedule('*/5 * * * *', run)")).toBe(true);
    expect(CRON.test("const c = '* * * * *';")).toBe(true);
    // ANOTADO (bajo, ajeno a r4): la alternativa `\d+ \d+` exige SEIS campos ("0 3 * * * *"); un cron
    // de cinco campos con hora fija ("0 3 * * *") no casa. La guarda cubre `*/N` y `*`, no `M H`.
    expect(CRON.test('const c = "0 3 * * *";')).toBe(false);
    expect(CRON.test('const c = "0 3 * * * *";')).toBe(true);
    expect(CRON.test("const c = '*/5 * * * *\";")).toBe(false); // comillas desparejadas: la retrorreferencia exige la misma
    expect(CRON.test('const c = CRON_EXPRESSIONS.cada5;')).toBe(false);
  });
});
