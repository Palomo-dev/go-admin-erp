/**
 * Integraciones (2026-11-09): Eventos, Llaves de API y Webhooks salientes viven en las pestañas de
 * Conexiones. Las páginas viejas redirigen a `?tab=…`, salieron del catálogo de navegación (menú,
 * permisos, buscador) y nadie enlaza ya a sus rutas. Trabajos y Mapeos NO se tocaron: siguen vivas
 * por URL, fuera del menú, hasta que el dueño decida.
 */
import * as fs from 'fs';
import * as path from 'path';
import { CATALOGO_NAV } from '@/lib/navigation/catalog';
import { RUTAS_MODULOS } from '@/lib/navigation/rutasModulos';

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf-8');

const REDIRECCIONES: Record<string, string> = {
  'src/app/app/integraciones/api-keys/page.tsx': "redirect('/app/integraciones/conexiones?tab=desarrolladores')",
  'src/app/app/integraciones/webhooks-salientes/page.tsx': "redirect('/app/integraciones/conexiones?tab=desarrolladores')",
  'src/app/app/integraciones/eventos/page.tsx': "redirect('/app/integraciones/conexiones?tab=actividad')",
  'src/app/app/integraciones/eventos/[id]/page.tsx': 'redirect(`/app/integraciones/conexiones?tab=actividad&evento=${encodeURIComponent(id)}`)',
};
const RUTAS_VIEJAS = ['/app/integraciones/eventos', '/app/integraciones/api-keys', '/app/integraciones/webhooks-salientes'];

function archivos(dir: string): string[] {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : archivos(rel);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [rel] : [];
  });
}

describe('páginas viejas → pestañas de Conexiones', () => {
  test.each(Object.entries(REDIRECCIONES))('%s redirige', (archivo, esperado) => {
    const fuente = leer(archivo);
    expect(fuente).toContain("from 'next/navigation'");
    expect(fuente).toContain(esperado);
    // Es solo una redirección: no monta la pantalla vieja.
    expect(fuente).not.toMatch(/integrationsService|components\/integraciones\/(api-keys|webhooks-salientes|eventos)/);
  });

  test('los componentes viejos ya no existen', () => {
    for (const dir of ['src/components/integraciones/api-keys', 'src/components/integraciones/webhooks-salientes', 'src/components/integraciones/eventos']) {
      expect([dir, fs.existsSync(path.join(RAIZ, dir))]).toEqual([dir, false]);
    }
  });
});

describe('catálogo de navegación', () => {
  const integraciones = CATALOGO_NAV.find((m) => m.codigo === 'integrations');

  test('Eventos, Llaves de API y Webhooks salieron del catálogo; Conexiones, Trabajos y Mapeos siguen', () => {
    const hrefs = integraciones?.paginas.map((p) => p.href) ?? [];
    expect(hrefs).toEqual(['/app/integraciones/conexiones', '/app/integraciones/jobs', '/app/integraciones/mapeos']);
    expect(RUTAS_MODULOS.find((m) => m.codigo === 'integrations')?.paginas).toEqual(hrefs);
  });

  test('las traducciones del menú ya no llevan esas páginas', () => {
    for (const idioma of ['es', 'en', 'fr', 'pt']) {
      const nav = JSON.parse(leer(`messages/${idioma}.json`)).nav.paginas as Record<string, string>;
      expect(Object.keys(nav).filter((k) => /^integraciones_(eventos|api-keys|webhooks-salientes)$/.test(k))).toEqual([]);
    }
  });

  test('ningún archivo de src enlaza a las rutas viejas (salvo las propias redirecciones)', () => {
    const propias = new Set(Object.keys(REDIRECCIONES));
    const infractores = archivos('src')
      .filter((f) => !propias.has(f))
      .filter((f) => {
        const fuente = leer(f);
        return RUTAS_VIEJAS.some((r) => fuente.includes(`'${r}`) || fuente.includes(`"${r}`) || fuente.includes(`\`${r}`));
      });
    expect(infractores).toEqual([]);
  });
});
