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

  test('/api/modules y /api/modules/pages: cada handler pasa por el resolutor, y la organización solo sale de él', () => {
    const problemas: string[] = [];
    for (const rel of ['route.ts', 'pages/route.ts']) {
      const codigo = sinComentarios(fs.readFileSync(path.join(RAIZ, rel), 'utf8'));
      // Cada handler exportado, por su texto: desde su `export async function`
      // hasta el siguiente `export` (o el final del archivo).
      const trozos = codigo.split(/(?=export\s+async\s+function\s+)/);
      for (const metodo of ['GET', 'POST']) {
        const cuerpo = trozos.find((t) => new RegExp('^export\\s+async\\s+function\\s+' + metodo + '\\b').test(t));
        if (!cuerpo) { problemas.push(`${rel}: no exporta ${metodo}`); continue; }
        if (!/\bresolverObjetivoModulos\s*[<(]/.test(cuerpo)) problemas.push(`${rel} ${metodo}: no pasa por resolverObjetivoModulos`);
        const esperado = metodo === 'POST' ? /escritura:\s*true\b/ : /escritura:\s*false\b/;
        if (!esperado.test(cuerpo)) problemas.push(`${rel} ${metodo}: debería declarar escritura: ${metodo === 'POST'}`);
      }
      // La organización nunca se toma del body ni del query: la ÚNICA forma de
      // nombrarla en estas rutas es `objetivo.organizationId`, que el resolutor
      // valida. Se escribe así —y no como una lista de patrones de lectura—
      // porque un `Number(body.organizationId) || objetivo.organizationId`
      // esquivaría cualquier patrón basado en desestructuración (mutación M2).
      for (const m of codigo.matchAll(/\borganizationId\b/g)) {
        const indice = m.index ?? 0;
        if (codigo.slice(Math.max(0, indice - 9), indice) !== 'objetivo.') {
          const contexto = codigo.slice(Math.max(0, indice - 40), indice + 20).replace(/\s+/g, ' ').trim();
          problemas.push(`${rel}: nombra organizationId fuera de objetivo.organizationId → «…${contexto}…»`);
        }
      }
      if (/\bsearchParams\b/.test(codigo)) problemas.push(`${rel}: lee el query string por su cuenta`);
      // El cliente de servicio solo existe como `objetivo.service`, entregado
      // por el resolutor DESPUÉS de validar la organización.
      if (/\bgetServiceClient\s*\(/.test(codigo)) problemas.push(`${rel}: pide el cliente de servicio por su cuenta, sin pasar por el resolutor`);
      if (/\bctx\.supabase\b/.test(codigo)) problemas.push(`${rel}: vuelve al cliente de la sesión (la regresión del plan null)`);
    }
    expect(problemas).toEqual([]);
  });

  test('el resolutor: sesión primero, plataforma por la RPC, 403 por el punto único y service role al final', () => {
    const codigo = sinComentarios(fs.readFileSync(path.join(RAIZ, '..', '..', '..', 'lib', 'security', 'modulosObjetivo.ts'), 'utf8'));
    const problemas: string[] = [];
    if (!/\bgetServerOrgContext\s*\(/.test(codigo)) problemas.push('no resuelve la sesión con getServerOrgContext');
    if (!/\brequireOrgAdminOrPermission\s*\(/.test(codigo)) problemas.push('la escritura del miembro no exige administrador por el catálogo');
    if (!/\bisPlatformAdmin\s*\(/.test(codigo)) problemas.push('la plataforma no se decide con isPlatformAdmin (fn_is_platform_admin)');
    if (/platform_admins/.test(codigo)) problemas.push('consulta platform_admins directamente: la única puerta es fn_is_platform_admin');
    if (!/\breadOrgBody\s*\(/.test(codigo)) problemas.push('el 403 por organización ajena no pasa por readOrgBody');
    if (/\bcreateClient\s*\(|SUPABASE_SERVICE_ROLE_KEY/.test(codigo)) problemas.push('construye su propio cliente de servicio');
    if (/roleName|role_name|nombreRol|\.name\s*===\s*['"]/.test(codigo)) problemas.push('decide algo por el nombre de un rol');
    // Cada entrega del cliente de servicio va después de la resolución de la sesión.
    const sesion = codigo.search(/\bgetServerOrgContext\s*\(/);
    for (const m of codigo.matchAll(/\bgetServiceClient\s*\(/g)) {
      if ((m.index ?? 0) < sesion) problemas.push('entrega el cliente de servicio antes de resolver la sesión');
    }
    expect(problemas).toEqual([]);
  });
});
