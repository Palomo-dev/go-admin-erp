/**
 * Textos de Finanzas en el servidor (asunto y cuerpo de los correos de factura,
 * estado de cuenta y recordatorio). Mismo criterio que el motor de documentos:
 * idioma pedido → idioma del perfil → español, y el traductor del motor
 * (`crearTraductor`) sobre el namespace pedido de `messages/<idioma>.json`.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { crearTraductor, type Traductor } from '@/lib/documents/textos';
import { esIdiomaDocumento, type IdiomaDocumento } from '@/lib/documents/tipos';

type Mensajes = Record<string, unknown>;

async function mensajes(idioma: IdiomaDocumento): Promise<Mensajes> {
  let modulo: { default?: Mensajes } & Mensajes;
  switch (idioma) {
    case 'en':
      modulo = await import('../../../messages/en.json');
      break;
    case 'fr':
      modulo = await import('../../../messages/fr.json');
      break;
    case 'pt':
      modulo = await import('../../../messages/pt.json');
      break;
    default:
      modulo = await import('../../../messages/es.json');
  }
  return (modulo.default ?? modulo) as Mensajes;
}

export async function idiomaDelUsuario(ctx: Pick<ServerOrgContext, 'supabase' | 'userId'>, pedido?: string | null): Promise<IdiomaDocumento> {
  if (esIdiomaDocumento(pedido)) return pedido;
  try {
    const { data } = await ctx.supabase.from('profiles').select('preferred_language').eq('id', ctx.userId).maybeSingle();
    const preferido = String((data as { preferred_language?: string | null } | null)?.preferred_language ?? '').slice(0, 2).toLowerCase();
    if (esIdiomaDocumento(preferido)) return preferido;
  } catch {
    /* sin perfil legible: español */
  }
  return 'es';
}

export async function traductorFinanzas(namespace: 'facturasVenta' | 'cartera' | 'documentosVenta', idioma: IdiomaDocumento): Promise<Traductor> {
  const [pedido, respaldo] = await Promise.all([mensajes(idioma), idioma === 'es' ? Promise.resolve(null) : mensajes('es')]);
  return crearTraductor(pedido[namespace] as Mensajes | undefined, (respaldo?.[namespace] as Mensajes | undefined) ?? undefined);
}
