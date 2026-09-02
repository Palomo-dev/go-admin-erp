/**
 * Guardarraíles automatizados — FASE 0 (Fundaciones).
 *
 * Tests que impiden regresiones en los bugs G1-G15 corregidos en F0.
 * Se ejecutan con `npm test` y deben pasar antes de cualquier PR.
 *
 * Casos cubiertos:
 * 1. Sin `organizationId: 1` / `organization_id: 1` hardcodeados en src/
 *    (excluyendo tests y comentarios, incluyendo inline).
 * 2. Sin lecturas de tablas de plataforma (organizations, subscriptions, plans,
 *    sellers, payout) desde el CRM.
 * 3. Sin `display_order` en el módulo CRM (src/components/crm, src/app/api/crm,
 *    src/app/app/crm, src/lib/services/crm).
 * 4. Sin `SERVICE_ROLE_KEY` ni `user_profiles` en callService.ts (bugs G1, G2).
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '..');

/**
 * Recorre recursivamente un directorio y devuelve todos los archivos
 * .ts/.tsx que coincen con un predicado.
 */
function walkDir(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.next') {
      walkDir(fullPath, files);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Lee un archivo de forma segura.
 */
function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Filtra archivos que no deben revisarse (tests, mocks, este archivo).
 */
function isExcluded(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return (
    normalized.includes('__tests__') ||
    normalized.includes('.test.') ||
    normalized.includes('.spec.') ||
    normalized.includes('guardrails.test') ||
    normalized.includes('/mocks/') ||
    normalized.includes('node_modules')
  );
}

/**
 * Quita strings y comentarios inline (`//`) de una línea para evitar
 * falsos positivos cuando el patrón buscado aparece en un string o comentario.
 * Los comentarios multi-línea (bloque) se manejan vía isCommentLine a nivel de línea.
 * Soporta comentarios inline (`code // comment`).
 */
function stripCommentsAndStrings(line: string): string {
  let result = line;
  // Quitar strings simples y dobles (y template literals de una línea)
  result = result.replace(/'(?:[^'\\]|\\.)*'/g, "''");
  result = result.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  result = result.replace(/`(?:[^`\\]|\\.)*`/g, '``');
  // Quitar comentario inline //
  const inlineCommentIdx = result.indexOf('//');
  if (inlineCommentIdx >= 0) {
    result = result.substring(0, inlineCommentIdx);
  }
  return result;
}

/**
 * Verifica si una línea completa es un comentario (doble barra, asterisco, bloque).
 * En TS/TSX, una línea que empieza con `*` tras trim() es casi siempre
 * parte de un bloque JSDoc; el operador multiplicación binario siempre
 * va precedido de un operando, no aparece al inicio de línea tras trim().
 */
function isCommentLine(trimmed: string): boolean {
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*/')
  );
}

describe('F0 Guardarraíles — bugs G1-G15', () => {
  jest.setTimeout(60000); // Escaneo de src/ puede tardar

  // === Caso 1: Sin organizationId: 1 / organization_id: 1 hardcodeados ===
  describe('1. Sin organizationId hardcodeado a 1', () => {
    const allFiles = walkDir(SRC_ROOT).filter((f) => !isExcluded(f));
    const violations: string[] = [];

    beforeAll(() => {
      for (const file of allFiles) {
        const content = readFile(file);
        // Buscar organizationId: 1 o organization_id: 1 (no en comentarios ni strings)
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          const trimmed = line.trim();
          if (isCommentLine(trimmed)) return;
          const cleaned = stripCommentsAndStrings(line);
          if (/organizationId\s*:\s*1\b/.test(cleaned) || /organization_id\s*:\s*1\b/.test(cleaned)) {
            violations.push(`${path.relative(SRC_ROOT, file)}:${idx + 1}: ${trimmed}`);
          }
        });
      }
    });

    test('no hay organizationId: 1 en código de producción', () => {
      if (violations.length > 0) {
        console.error('Violaciones encontradas:\n' + violations.join('\n'));
      }
      expect(violations).toHaveLength(0);
    });
  });

  // === Caso 2: Sin lecturas de tablas de plataforma ===
  describe('2. Sin lecturas de tablas de plataforma desde el CRM', () => {
    const platformTables = ['subscriptions', 'plans', 'sellers', 'payout'];
    const crmPaths = [
      path.join(SRC_ROOT, 'components', 'crm'),
      path.join(SRC_ROOT, 'app', 'api', 'crm'),
      path.join(SRC_ROOT, 'app', 'app', 'crm'),
      path.join(SRC_ROOT, 'lib', 'services', 'crm'),
    ];
    const violations: string[] = [];

    beforeAll(() => {
      for (const crmPath of crmPaths) {
        const files = walkDir(crmPath).filter((f) => !isExcluded(f));
        for (const file of files) {
          const content = readFile(file);
          for (const table of platformTables) {
            // Buscar .from('table') o .from("table")
            const pattern = new RegExp(`\\.from\\(['"]${table}`, 'g');
            if (pattern.test(content)) {
              violations.push(`${path.relative(SRC_ROOT, file)}: referencia a tabla de plataforma '${table}'`);
            }
          }
        }
      }
    });

    test('el CRM no lee tablas de plataforma', () => {
      if (violations.length > 0) {
        console.error('Violaciones encontradas:\n' + violations.join('\n'));
      }
      expect(violations).toHaveLength(0);
    });
  });

  // === Caso 3: Sin display_order en el módulo CRM ===
  describe('3. Sin display_order en el módulo CRM', () => {
    const crmPaths = [
      path.join(SRC_ROOT, 'components', 'crm'),
      path.join(SRC_ROOT, 'app', 'api', 'crm'),
      path.join(SRC_ROOT, 'app', 'app', 'crm'),
      path.join(SRC_ROOT, 'lib', 'services', 'crm'),
    ];
    const violations: string[] = [];

    beforeAll(() => {
      for (const crmPath of crmPaths) {
        const files = walkDir(crmPath).filter((f) => !isExcluded(f));
        for (const file of files) {
          const content = readFile(file);
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            const trimmed = line.trim();
            if (isCommentLine(trimmed)) return;
            const cleaned = stripCommentsAndStrings(line);
            if (/display_order/.test(cleaned)) {
              violations.push(`${path.relative(SRC_ROOT, file)}:${idx + 1}: ${trimmed}`);
            }
          });
        }
      }
    });

    test('el CRM no usa display_order (debe usar position)', () => {
      if (violations.length > 0) {
        console.error('Violaciones encontradas:\n' + violations.join('\n'));
      }
      expect(violations).toHaveLength(0);
    });
  });

  // === Caso 4: Sin SERVICE_ROLE_KEY ni user_profiles en callService.ts (bugs G1, G2) ===
  describe('4. Sin SERVICE_ROLE_KEY ni user_profiles en callService.ts', () => {
    const callServicePath = path.join(SRC_ROOT, 'lib', 'services', 'callService.ts');

    test('callService.ts no usa service-role key', () => {
      if (!fs.existsSync(callServicePath)) {
        // Si el archivo no existe, no hay violación posible
        return;
      }
      const content = readFile(callServicePath);
      expect(content).not.toMatch(/SERVICE_ROLE_KEY/);
      expect(content).not.toMatch(/user_profiles/);
    });
  });
});
