/**
 * Verificación de SUSCRIPCIÓN de un webhook (el GET con `verify_token` +
 * `challenge` que mandan Meta, WhatsApp Cloud y TikTok al registrar la URL).
 * GO-sec, 2026-09-24.
 *
 * Fail-closed: si la variable de entorno del token no existe, 403. Antes Meta
 * y TikTok caían a un token por defecto escrito en el código (y el repositorio
 * es público): cualquiera podía completar la verificación. La comparación es
 * en tiempo constante. El `challenge` solo se devuelve con el token correcto.
 *
 * Módulo hoja (solo `crypto` y `next/server`): lo usan rutas cuyos tests no
 * pueden cargar `webhookSignatures` (importa `svix`, ESM puro).
 *
 * Esto NO autentica eventos: los POST de esos webhooks se verifican por firma
 * (HMAC con el secreto de la app o de la conexión).
 */

import crypto from 'crypto';
import { NextResponse } from 'next/server';

export interface OpcionesSuscripcion {
  /** Variable de entorno con el token esperado. */
  variable: string;
  /** Parámetro de la query con el token (`hub.verify_token`, `verify_token`). */
  parametroToken: string;
  /** Parámetro de la query con el desafío (`hub.challenge`, `challenge`). */
  parametroDesafio: string;
  /** Si viene, el parámetro de modo debe valer `subscribe` (`hub.mode`). */
  parametroModo?: string;
  /** Etiqueta para el registro. */
  etiqueta: string;
}

function igualEnTiempoConstante(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Responde el desafío (200, texto) o 403. */
export function verificarSuscripcionWebhook(request: Request, opciones: OpcionesSuscripcion): Response {
  const esperado = process.env[opciones.variable];
  if (!esperado) {
    console.error(`[${opciones.etiqueta}] ${opciones.variable} no configurado: verificación rechazada (fail-closed)`);
    return NextResponse.json({ error: 'Verification not configured' }, { status: 403 });
  }

  let params: URLSearchParams;
  try {
    params = new URL(request.url).searchParams;
  } catch {
    return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
  }
  const token = params.get(opciones.parametroToken) ?? '';
  const desafio = params.get(opciones.parametroDesafio) ?? '';
  const modoValido = !opciones.parametroModo || params.get(opciones.parametroModo) === 'subscribe';

  if (modoValido && desafio && igualEnTiempoConstante(token, esperado)) {
    return new NextResponse(desafio, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  console.warn(`[${opciones.etiqueta}] verificación de suscripción fallida`);
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}
