#!/usr/bin/env node
// Lista filas de subscriptions cuyo stripe_subscription_id no existe en la
// cuenta de STRIPE_SECRET_KEY. Solo lectura: no actualiza la base ni Stripe.
//
//   node scripts/conciliar-suscripciones-stripe.mjs
//
// Imprime organization_id, el id de la fila, status y livemode. No imprime
// la clave ni el cuerpo de error de Stripe (ahí a veces viene el prefijo).
// Sale 0 aunque haya ausentes. Sale 1 si faltan credenciales o la API falla
// por algo distinto de resource_missing.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

function cargarEnvLocal() {
  const archivo = join(RAIZ, '.env.local');
  if (!existsSync(archivo)) return;
  for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(linea);
    if (!m || process.env[m[1]] !== undefined) continue;
    let valor = m[2].trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    process.env[m[1]] = valor;
  }
}

function modoDeClave(clave) {
  if (clave.startsWith('sk_live_')) return 'live';
  if (clave.startsWith('sk_test_')) return 'test';
  return 'desconocido';
}

function falla(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

async function consultar(clave, stripeSubscriptionId) {
  const respuesta = await fetch(
    `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(stripeSubscriptionId)}`,
    { headers: { Authorization: `Bearer ${clave}` } },
  );
  if (respuesta.status === 200) return 'existe';
  let code = '';
  try {
    const cuerpo = await respuesta.json();
    code = typeof cuerpo?.error?.code === 'string' ? cuerpo.error.code : '';
  } catch {
    code = '';
  }
  if (respuesta.status === 404 && code === 'resource_missing') return 'ausente';
  if (respuesta.status === 401) falla('Stripe rechazó la clave (401). No se imprime el cuerpo.');
  falla(`Stripe respondió ${respuesta.status}${code ? ` (${code})` : ''} al consultar una suscripción.`);
}

async function main() {
  cargarEnvLocal();
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!url || !serviceKey || !stripeKey) {
    falla('Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o STRIPE_SECRET_KEY.');
  }

  const modo = modoDeClave(stripeKey);
  console.log(`Cuenta Stripe: ${modo}. Solo lectura.`);
  if (modo === 'test') {
    console.log('Con una clave de prueba, los id creados en live salen ausentes.');
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const ausentes = [];
  let revisadas = 0;
  let desde = 0;
  const lote = 200;

  for (;;) {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('id, organization_id, status, livemode, stripe_subscription_id')
      .not('stripe_subscription_id', 'is', null)
      .order('organization_id', { ascending: true })
      .range(desde, desde + lote - 1);
    if (error) falla(`No se pudo leer subscriptions: ${error.message}`);
    const filas = data ?? [];
    for (const fila of filas) {
      revisadas += 1;
      const resultado = await consultar(stripeKey, fila.stripe_subscription_id);
      if (resultado === 'ausente') {
        ausentes.push({
          organization_id: fila.organization_id,
          id: fila.id,
          status: fila.status,
          livemode: fila.livemode,
        });
        console.log(
          `ausente organization_id=${fila.organization_id} id=${fila.id} status=${fila.status} livemode=${fila.livemode}`,
        );
      }
    }
    if (filas.length < lote) break;
    desde += lote;
  }

  console.log(`Revisadas: ${revisadas}. Ausentes en esta cuenta: ${ausentes.length}. No se escribió nada.`);
}

main().catch((error) => {
  falla(error instanceof Error ? error.message : 'Falló la conciliación.');
});
