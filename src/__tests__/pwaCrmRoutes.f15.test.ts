/// <reference types="jest" />
/**
 * F15 — PWA y el CRM. El service worker sigue la estrategia «no interceptar
 * navegaciones» (comentario de cabecera de `public/sw.js`, por los bugs de
 * Safari con redirecciones y los bucles a `/`). Este test lo convierte en
 * guardarraíl: `/app/crm/*` nunca se sirve desde caché como navegación, y el
 * manifest sigue siendo instalable (scope `/`, iconos existentes).
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const sw = fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/manifest.json'), 'utf8')) as {
  start_url: string;
  scope: string;
  display: string;
  icons: Array<{ src: string; sizes: string; purpose?: string }>;
};

describe('public/sw.js no cachea navegaciones del CRM', () => {
  it('no responde a request.mode === navigate ni precachea rutas de /app', () => {
    expect(sw).not.toMatch(/mode\s*===\s*['"]navigate['"]/);
    expect(sw).not.toMatch(/['"]\/app\b/);
    expect(sw).not.toMatch(/['"]\/offline['"]/);
  });

  it('solo intercepta estáticos: _next/static, iconos, manifest, favicon y apple-touch-icon', () => {
    const fetchHandler = sw.slice(sw.indexOf("addEventListener('fetch'"), sw.indexOf("addEventListener('push'"));
    expect(fetchHandler).toMatch(/url\.pathname\.startsWith\('\/_next\/static\/'\)/);
    expect(fetchHandler).toMatch(/url\.origin !== self\.location\.origin\) return/);
    expect(fetchHandler).toMatch(/request\.method !== 'GET'\) return/);
    const respondWithCount = (fetchHandler.match(/respondWith\(/g) ?? []).length;
    expect(respondWithCount).toBe(1);
    expect(fetchHandler).not.toMatch(/crm|\/api\//);
  });

  it('un cambio de estrategia obliga a subir CACHE_NAME (hoy v4)', () => {
    expect(sw).toMatch(/const CACHE_NAME = 'goadmin-erp-v\d+'/);
  });
});

describe('public/manifest.json instalable y compatible con /app/crm', () => {
  it('scope raíz, arranque en /, standalone', () => {
    expect(manifest.scope).toBe('/');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
  });

  it('todos los iconos existen en public/ y hay 192 y 512 con purpose maskable', () => {
    for (const icon of manifest.icons) {
      expect(fs.existsSync(path.join(ROOT, 'public', icon.src))).toBe(true);
    }
    const maskable = manifest.icons.filter((i) => i.purpose === 'maskable').map((i) => i.sizes);
    expect(maskable).toEqual(expect.arrayContaining(['192x192', '512x512']));
  });
});
