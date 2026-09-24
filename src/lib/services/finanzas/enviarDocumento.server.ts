/**
 * Enviar un documento de Finanzas por correo (factura, estado de cuenta,
 * recordatorio de cobro): el PDF lo arma el motor único de documentos
 * (`armarDocumento` + `generarPdf`, desde la base y con la organización de la
 * sesión) y el correo sale por el canal transaccional del CRM (`sendEmail`, que
 * guarda `email_messages` con `related_type/related_id`). Nada se duplica: si el
 * PDF no se puede generar en este momento, el correo sale sin adjunto y se dice.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { sendEmail } from '@/lib/services/crm/email/sendService';
import { EmailError } from '@/lib/services/crm/email/types';
import { armarDocumento } from '@/lib/documents/server/motor';
import { generarPdf } from '@/lib/documents/server/pdf';
import type { IdiomaDocumento, TipoDocumento } from '@/lib/documents/tipos';

export type ErrorEnvio = 'correo_no_configurado' | 'cliente_sin_consentimiento' | 'correo_invalido' | 'proveedor_correo' | 'error_desconocido';

export class ErrorEnvioServidor extends Error {
  constructor(public readonly codigo: ErrorEnvio) {
    super(codigo);
  }
}

export function codigoErrorEnvio(err: unknown): ErrorEnvio {
  if (err instanceof EmailError) {
    switch (err.code) {
      case 'NO_SENDER':
        return 'correo_no_configurado';
      case 'CONTACT_OPTED_OUT':
        return 'cliente_sin_consentimiento';
      case 'VALIDATION':
      case 'TOO_MANY_RECIPIENTS':
        return 'correo_invalido';
      case 'PROVIDER':
        return 'proveedor_correo';
      default:
        return 'error_desconocido';
    }
  }
  return 'error_desconocido';
}

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'userEmail' | 'organizationName' | 'supabase' | 'roleId' | 'isSuperAdmin'>;

export interface EnvioDocumento {
  tipo: TipoDocumento;
  id: string;
  para: string;
  customerId?: string | null;
  asunto: string;
  html: string;
  texto?: string;
  relatedType: string;
  relatedId: string;
  idioma?: IdiomaDocumento;
  desde?: string | null;
  hasta?: string | null;
  /** Clave para no mandar dos veces el mismo envío (reintento del navegador). */
  claveCliente?: string | null;
  /** Sin PDF adjunto (recordatorio corto). */
  sinAdjunto?: boolean;
}

export async function enviarDocumentoPorCorreo(ctx: Ctx, envio: EnvioDocumento): Promise<{ emailMessageId: string; adjunto: boolean }> {
  let adjunto: { filename: string; content_base64: string; content_type: string } | null = null;
  if (!envio.sinAdjunto) {
    try {
      const { html, payload, papel } = await armarDocumento(ctx, {
        tipo: envio.tipo,
        id: envio.id,
        papel: 'carta',
        idioma: envio.idioma ?? 'es',
        desde: envio.desde ?? null,
        hasta: envio.hasta ?? null,
      });
      const pdf = await generarPdf(html, papel);
      adjunto = {
        filename: `${payload.nombreArchivo || envio.tipo}.pdf`,
        content_base64: Buffer.from(pdf).toString('base64'),
        content_type: 'application/pdf',
      };
    } catch (err) {
      console.warn('[finanzas/enviar] sin PDF adjunto', { tipo: envio.tipo, message: err instanceof Error ? err.message : String(err) });
      adjunto = null;
    }
  }

  try {
    const r = await sendEmail(
      ctx.organizationId,
      { userId: ctx.userId, userEmail: ctx.userEmail, orgName: ctx.organizationName },
      {
        to: [envio.para],
        to_customer_id: envio.customerId ?? null,
        subject: envio.asunto,
        content: { html: envio.html, text: envio.texto },
        related_type: envio.relatedType,
        related_id: envio.relatedId,
        kind: 'transactional',
        client_request_id: envio.claveCliente ?? null,
        attachments: adjunto ? [adjunto] : undefined,
      },
      ctx.supabase,
    );
    return { emailMessageId: r.message.id, adjunto: adjunto !== null };
  } catch (err) {
    const codigo = codigoErrorEnvio(err);
    if (codigo === 'error_desconocido') {
      console.error('[finanzas/enviar] sendEmail', { organizationId: ctx.organizationId, message: err instanceof Error ? err.message : String(err) });
    }
    throw new ErrorEnvioServidor(codigo);
  }
}

/** Escapa texto para meterlo en el HTML del correo. */
export function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
