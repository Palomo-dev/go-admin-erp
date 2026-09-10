import { NextRequest, NextResponse } from 'next/server';
import { applyUnsubscribe, verifyUnsubscribeToken } from '@/lib/services/crm/email/unsubscribe';
import { publicPageHeaders, publicPageHtml } from '@/lib/services/crm/email/publicPage';
import { getServiceClient } from '@/lib/supabase/server-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Página pública de baja (FASE-07 C17). Sin auth, sin layout de app.
 *  GET  /u/[token] → HTML con un único botón (form nativo, sin JS)
 *  POST /u/[token] → aplica la baja (también Gmail One-Click:
 *                    `List-Unsubscribe-Post: List-Unsubscribe=One-Click`)
 * Responde igual para tokens repetidos; nunca expone email ni nombre.
 * Nota: se implementa como route handler (GET+POST en la misma URL) en vez de
 * page.tsx + server action para que el POST One-Click funcione sin acción de Next.
 *
 * SEGURIDAD (ronda 2): el HTML lo construye `publicPage.ts`, que escapa
 * SIEMPRE title/body/button y añade CSP (`default-src 'none'`, el <style> por
 * hash) + `X-Content-Type-Options: nosniff`. Antes, `organizations.name` — texto
 * libre editable por cualquier admin de org — se interpolaba crudo aquí: XSS
 * almacenada en una página pública sin sesión (tester r1 #1).
 */

function page(title: string, body: string, button?: string): NextResponse {
  return new NextResponse(publicPageHtml({ title, body, button }), { status: 200, headers: publicPageHeaders() });
}

async function orgName(token: string): Promise<string> {
  const v = verifyUnsubscribeToken(token);
  if (!v) return '';
  const { data } = await getServiceClient().from('email_messages').select('organization_id').eq('id', v.email_message_id).maybeSingle();
  const orgId = (data as { organization_id?: number } | null)?.organization_id;
  if (!orgId) return '';
  const { data: org } = await getServiceClient().from('organizations').select('name').eq('id', orgId).maybeSingle();
  // Se corta a 120 caracteres: el nombre solo decora el mensaje.
  return ((org as { name?: string } | null)?.name ?? '').slice(0, 120);
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!verifyUnsubscribeToken(token)) return page('Enlace no válido', 'Este enlace de baja no es válido o ha caducado.');
  const name = await orgName(token);
  return page('Cancelar suscripción', `¿Deseas dejar de recibir correos${name ? ` de ${name}` : ''}? Podrás volver a suscribirte contactando directamente con ellos.`, 'Sí, darme de baja');
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await applyUnsubscribe(token, 'one_click', getServiceClient());
  if (!r.ok) return page('Enlace no válido', 'Este enlace de baja no es válido o ha caducado.');
  const name = (r.org_name ?? '').slice(0, 120);
  return page('Listo', `No volverás a recibir correos${name ? ` de ${name}` : ''}. Gracias.`);
}
