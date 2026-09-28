/// <reference types="jest" />
/**
 * Guardarraíl de `/api/modules/**` (F-76, 2026-09-24).
 *
 * Las tres rutas construían su propio cliente con `SUPABASE_SERVICE_ROLE_KEY`
 * (`createClient` de `@supabase/supabase-js` dentro del propio `route.ts`), que
 * salta RLS, y lo usaban ANTES de comprobar sesión, pertenencia o permiso. Este
 * archivo impide la reincidencia con tres reglas sobre el texto de las rutas:
 *
 *  1. Ninguna ruta de `/api/modules/**` construye un cliente de Supabase por su
 *     cuenta: nada de `createClient(` ni de `SUPABASE_SERVICE_ROLE_KEY`. Si de
 *     verdad hace falta `service_role`, se pide al punto único
 *     `getServiceClient()` de `@/lib/supabase/server-service`.
 *  2. Una ruta que use `getServiceClient()` tiene que estar cerrada con una
 *     comprobación explícita en el MISMO archivo —`withPlatformAdmin` (admin de
 *     plataforma) o `withOrg` con `{ admin: true }`— y dejar escrito por qué el
 *     `service_role` es necesario. Hoy solo la cumple `audit`, que recorre
 *     organizaciones de las que el admin de plataforma no es miembro.
 *  3. `/api/modules` y `/api/modules/pages` resuelven la organización con
 *     `withOrg` y pasan por `readOrgBody`; sus escrituras exigen
 *     `{ admin: true }`. (La mitad «organización del body» la vigila además el
 *     caso 5 de `src/__tests__/guardrails.test.ts`, de cuya allow-list se
 *     quitaron estas rutas en el mismo cambio.)
 *
 * `/api/modules/public` es la ÚNICA excepción, y está acotada: es el catálogo
 * global de módulos para la pantalla de registro, no tiene organización y se
 * consulta sin sesión, así que el cliente de la sesión (como `anon`) no puede
 * leer `modules` —su política de lectura exige `authenticated`— y la ruta se
 * quedaría vacía. Lo que este archivo sí le exige es que NO tome ninguna
 * organización de la petición: mientras no lo haga no puede cruzar inquilinos.
 * Que además construya el cliente en vez de pedirlo a `getServiceClient()` es
 * deuda anotada en la ficha, fuera de este encargo.
 */

import fs from 'fs';
import path from 'path';

const RAIZ = path.join(__dirname, '..');

function rutasDeModulos(): string[] {
  const encontradas: string[] = [];
  const recorrer = (dir: string) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completa = path.join(dir, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name !== '__tests__') recorrer(completa);
      } else if (entrada.name === 'route.ts') {
        encontradas.push(completa);
      }
    }
  };
  recorrer(RAIZ);
  return encontradas.sort();
}

/** Quita comentarios de bloque y de línea, para no juzgar por lo que explica un comentario. */
function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const relativo = (f: string) => path.relative(RAIZ, f).split(path.sep).join('/');

const ficheros = rutasDeModulos();

describe('Guardarraíl /api/modules: sin service role sin justificación', () => {
  test('el barrido encuentra las rutas esperadas', () => {
    expect(ficheros.length).toBeGreaterThanOrEqual(4);
    expect(ficheros.map(relativo)).toEqual(expect.arrayContaining([
      'route.ts', 'pages/route.ts', 'audit/route.ts', 'public/route.ts',
    ]));
  });

  test('ninguna ruta de /api/modules construye su propio cliente ni nombra la clave de service role (salvo `public`)', () => {
    const ofensores: string[] = [];
    for (const f of ficheros) {
      if (relativo(f) === 'public/route.ts') continue; // excepción acotada; ver cabecera
      const codigo = sinComentarios(fs.readFileSync(f, 'utf8'));
      if (/\bcreateClient\s*\(/.test(codigo) || /SUPABASE_SERVICE_ROLE_KEY/.test(codigo)) {
        ofensores.push(relativo(f));
      }
    }
    expect(ofensores).toEqual([]);
  });

  test('la excepción `public` sigue siendo un catálogo sin organización: no la toma de la petición', () => {
    const codigo = sinComentarios(fs.readFileSync(path.join(RAIZ, 'public', 'route.ts'), 'utf8'));
    expect(codigo).not.toMatch(/organizationId|organization_id|orgId/);
    // Y sigue siendo la única ruta de /api/modules que se construye el cliente.
    const conCliente = ficheros
      .filter((f) => /\bcreateClient\s*\(/.test(sinComentarios(fs.readFileSync(f, 'utf8'))))
      .map(relativo);
    expect(conCliente).toEqual(['public/route.ts']);
  });

  test('quien use getServiceClient() lo hace tras una comprobación explícita en el mismo archivo y lo justifica', () => {
    const problemas: string[] = [];
    for (const f of ficheros) {
      const bruto = fs.readFileSync(f, 'utf8');
      const codigo = sinComentarios(bruto);
      if (!/\bgetServiceClient\s*\(/.test(codigo)) continue;
      const cerrada = /\bwithPlatformAdmin\s*\(/.test(codigo) || /\{\s*admin:\s*true\s*\}/.test(codigo);
      if (!cerrada) problemas.push(`${relativo(f)}: usa getServiceClient sin withPlatformAdmin ni { admin: true }`);
      // La justificación vive en el comentario de cabecera (por eso se lee el bruto).
      if (!/service[ _-]?role/i.test(bruto.slice(0, codigo.indexOf('import') + 4000))) {
        problemas.push(`${relativo(f)}: usa getServiceClient sin justificar por qué`);
      }
    }
    expect(problemas).toEqual([]);
  });

  test('/api/modules y /api/modules/pages: organización por sesión, readOrgBody y escrituras solo de administrador', () => {
    const problemas: string[] = [];
    for (const rel of ['route.ts', 'pages/route.ts']) {
      const codigo = sinComentarios(fs.readFileSync(path.join(RAIZ, rel), 'utf8'));
      if (!/\bwithOrg\s*\(/.test(codigo)) problemas.push(`${rel}: no resuelve la organización con withOrg`);
      if (!/\breadOrgBody\s*[<(]/.test(codigo)) problemas.push(`${rel}: no pasa por readOrgBody`);
      if (!/\{\s*admin:\s*true\s*\}/.test(codigo)) problemas.push(`${rel}: su escritura no exige administrador`);
      // La organización nunca se toma del body ni del query: la ÚNICA forma de
      // nombrarla en estas dos rutas es `ctx.organizationId`. La regla se
      // escribe así —y no como una lista de patrones de lectura— porque un
      // `Number((body as …).organizationId) || ctx.organizationId` esquivaba
      // cualquier patrón basado en desestructuración (mutación M2).
      for (const m of codigo.matchAll(/\borganizationId\b/g)) {
        const indice = m.index ?? 0;
        if (codigo.slice(Math.max(0, indice - 4), indice) !== 'ctx.') {
          const contexto = codigo.slice(Math.max(0, indice - 40), indice + 20).replace(/\s+/g, ' ').trim();
          problemas.push(`${rel}: nombra organizationId fuera de ctx.organizationId → «…${contexto}…»`);
        }
      }
      if (/\bsearchParams\.get\s*\(/.test(codigo)) problemas.push(`${rel}: lee la organización (o cualquier otra cosa) del query string`);
    }
    expect(problemas).toEqual([]);
  });
});
