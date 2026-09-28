#!/usr/bin/env node
// ============================================================================
// Inventario de CURRENT_DATE en Postgres, contra la BASE VIVA
// ============================================================================
// Falla si el conjunto de funciones de `public` cuyo cuerpo contiene
// CURRENT_DATE no es EXACTAMENTE la lista blanca de scripts/lista-blanca-current-date.json
// (la que justifica una por una el ADR-004).
//
// Por que contra la base y no contra los `.sql` del repositorio: un test que
// lee `supabase/migrations/` NO ve una funcion que otra sesion aplica por MCP.
// Asi se colo `fn_emitir_acciones` durante la fase D. Ver
// docs/adr/ADR-005-inventario-de-current-date-contra-la-base-viva.md.
//
// Uso en local:
//
//   node scripts/verificar-current-date-en-postgres.mjs
//
// Lee `.env.local` si existe (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
// En CI las credenciales llegan por variables de entorno desde `secrets`.
//
// Codigos de salida:
//   0  la base coincide con la lista blanca, o FALTAN CREDENCIALES (se salta).
//   1  hay una funcion intrusa, o falta una de la lista, o la RPC no responde.
//
// Que NO hace: no escribe nada. La RPC que consulta es `stable` y solo lee
// catalogos de Postgres.
// ============================================================================

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const RPC = 'fn_inventario_current_date';

/** Lee `.env.local` sin depender de dotenv ni volcar nada por pantalla. */
function cargarEnvLocal() {
  const archivo = join(RAIZ, '.env.local');
  if (!existsSync(archivo)) return;
  for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(linea);
    if (!m) continue;
    const clave = m[1];
    if (process.env[clave] !== undefined) continue;
    let valor = m[2].trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    process.env[clave] = valor;
  }
}

function listaBlanca() {
  const json = JSON.parse(readFileSync(join(RAIZ, 'scripts/lista-blanca-current-date.json'), 'utf8'));
  return { firmas: json.firmas, adr: json.adr };
}

/** Normaliza una firma `nombre(tipo,tipo)` para poder compararlas sin ruido. */
function normaliza(firma) {
  return String(firma).replace(/\s+/g, '').toLowerCase();
}

function salta(motivo) {
  console.log('');
  console.log('  Inventario CURRENT_DATE: SALTADO');
  console.log(`  ${motivo}`);
  console.log('  No es un fallo. Un fork no tiene los secretos del proyecto y no');
  console.log('  puede consultar la base; la comprobacion la hace el CI del repositorio');
  console.log('  principal. Para correrlo en local, pon NEXT_PUBLIC_SUPABASE_URL y');
  console.log('  SUPABASE_SERVICE_ROLE_KEY en .env.local.');
  console.log('');
  process.exit(0);
}

function falla(lineas) {
  console.error('');
  console.error('  Inventario CURRENT_DATE: FALLA');
  for (const l of lineas) console.error(`  ${l}`);
  console.error('');
  process.exit(1);
}

async function main() {
  cargarEnvLocal();

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !clave) {
    const faltan = [!url && 'SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL)', !clave && 'SUPABASE_SERVICE_ROLE_KEY']
      .filter(Boolean)
      .join(' y ');
    salta(`Faltan credenciales: ${faltan}.`);
  }

  const supabase = createClient(url, clave, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc(RPC);

  if (error) {
    falla([
      `La RPC public.${RPC}() no respondio: ${error.message}`,
      '',
      'Si el mensaje dice que la funcion no existe, falta aplicar la migracion',
      'supabase/migrations/20260923234000_fn_inventario_current_date.sql.',
      'Si dice que no tiene permiso, la clave usada no es la de service_role:',
      `public.${RPC}() solo concede execute a service_role.`,
    ]);
  }

  const enLaBase = (data ?? []).map((f) => f.firma);
  const { firmas: esperadas, adr } = listaBlanca();

  const mapaBase = new Map(enLaBase.map((f) => [normaliza(f), f]));
  const mapaEsperada = new Map(esperadas.map((f) => [normaliza(f), f]));

  const intrusas = [...mapaBase].filter(([k]) => !mapaEsperada.has(k)).map(([, f]) => f);
  const desaparecidas = [...mapaEsperada].filter(([k]) => !mapaBase.has(k)).map(([, f]) => f);

  if (intrusas.length === 0 && desaparecidas.length === 0) {
    console.log('');
    if (enLaBase.length === 0) {
      // Desde 2026-09-23 este es el estado normal: la lista blanca esta vacia y
      // el inventario afirma algo mas fuerte que antes. Ver el ADR-004 reescrito.
      console.log('  Inventario CURRENT_DATE: OK — 0 funciones.');
      console.log('  Ninguna funcion de public decide un dia calendario con CURRENT_DATE.');
      console.log('  La lista blanca esta vacia a proposito.');
    } else {
      console.log(
        `  Inventario CURRENT_DATE: OK — ${enLaBase.length} funciones, las ${esperadas.length} del ADR-004.`,
      );
      for (const f of enLaBase) console.log(`    · ${f}`);
    }
    console.log('');
    return;
  }

  const lineas = [];

  if (intrusas.length > 0) {
    lineas.push(
      `Hay ${intrusas.length} funcion(es) de public que deciden un dia con CURRENT_DATE`,
      'y NO estan en la lista blanca del ADR-004:',
      '',
    );
    for (const f of intrusas) lineas.push(`    public.${f}`);
    lineas.push(
      '',
      'CURRENT_DATE es el dia del servidor, y este servidor esta en UTC: no es el',
      'dia de ninguna organizacion. Arreglo:',
      '',
      '  1. Si la funcion tiene la organizacion a mano (parametro, NEW.organization_id,',
      '     o una tabla padre que la lleve), sustituye CURRENT_DATE por',
      '       public.fn_today_for_org(<org>)',
      '     o, si el dato tiene sucursal, por',
      '       public.fn_today_for(<org>, <sucursal>)',
      '     en una migracion aditiva (CREATE OR REPLACE, misma firma) con su',
      '     reversion en supabase/rollbacks/.',
      '',
      '  2. Si de verdad NO hay organizacion a la que preguntarle la zona (dato de',
      '     catalogo global), escribe primero el porque en',
      `     ${adr}`,
      '     y solo entonces anade su firma a scripts/lista-blanca-current-date.json.',
      '     La lista es cerrada a proposito: ampliarla es una decision, no un tramite.',
    );
  }

  if (desaparecidas.length > 0) {
    if (lineas.length > 0) lineas.push('', '---', '');
    lineas.push(
      `La lista blanca nombra ${desaparecidas.length} funcion(es) que ya NO estan en la base`,
      'con CURRENT_DATE:',
      '',
    );
    for (const f of desaparecidas) lineas.push(`    public.${f}`);
    lineas.push(
      '',
      'O se arreglaron (bien: quitalas de scripts/lista-blanca-current-date.json y',
      `anotalo en ${adr}), o se borraron, o cambiaron de firma. Una lista blanca`,
      'con entradas muertas deja de proteger: manana alguien recrea esa funcion con',
      'CURRENT_DATE y el inventario la da por justificada.',
    );
  }

  lineas.push(
    '',
    `En la base viva hay ${enLaBase.length}; la lista blanca tiene ${esperadas.length}.`,
  );

  falla(lineas);
}

main().catch((e) => {
  falla([`Error inesperado: ${e?.message ?? e}`]);
});
