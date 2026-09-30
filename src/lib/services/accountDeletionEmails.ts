/**
 * Plantillas de correo para el flujo de eliminación de cuenta
 * 
 * Cumplimiento Ley 1581 de 2012: textos proporcionados por el departamento legal
 */

import { Resend } from 'resend';
import crypto from 'crypto';

let resendInstance: Resend | null = null;

function getResend(): Resend {
  if (!resendInstance) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    resendInstance = new Resend(apiKey);
  }
  return resendInstance;
}

const fromEmail = process.env.RESEND_FROM_EMAIL || 'GO Admin <noreply@goadmin.io>';

/**
 * Formatea una fecha en español con zona horaria de Colombia
 * @param date Fecha a formatear
 * @returns Fecha formateada en español, ej: "30 de septiembre de 2026"
 */
function formatearFechaEspanol(date: Date): string {
  const opciones: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  };
  return new Intl.DateTimeFormat('es-CO', opciones).format(date);
}

/**
 * Calcula el hash SHA-256 de un email (para registro de auditoría sin PII)
 */
export function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

/**
 * Envía el correo cuando el usuario solicita la eliminación de su cuenta
 */
export async function sendAccountDeletionRequestEmail(
  to: string,
  userName: string,
  requestDate: Date,
  scheduledDate: Date
): Promise<void> {
  const fechaSolicitud = formatearFechaEspanol(requestDate);
  const fechaProgramada = formatearFechaEspanol(scheduledDate);
  const saludo = userName ? `Hola ${userName}:` : 'Hola:';
  
  const subject = 'Recibimos tu solicitud para eliminar tu cuenta';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .content {
          background: #f9fafb;
          padding: 30px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
        }
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          font-size: 12px;
          color: #6b7280;
        }
        a {
          color: #1a56db;
          text-decoration: none;
        }
        .company-info {
          margin-top: 10px;
          font-size: 11px;
          color: #9ca3af;
        }
      </style>
    </head>
    <body>
      <div class="content">
        <p>${saludo}</p>
        
        <p>Recibimos tu solicitud para eliminar tu cuenta de GO Admin el ${fechaSolicitud}.</p>
        
        <p>Eliminaremos tus datos personales en un plazo máximo de 15 días hábiles. Conservaremos solo lo que la ley nos obliga a guardar, como la facturación y la contabilidad, por 10 años.</p>
        
        <p>Te escribiremos otra vez cuando el proceso termine.</p>
        
        <p>Si cambiaste de opinión, escríbenos a <a href="mailto:servicio@goadmin.io">servicio@goadmin.io</a> antes del ${fechaProgramada} y cancelamos la solicitud.</p>
        
        <p>Si no hiciste esta solicitud, avísanos cuanto antes a <a href="mailto:servicio@goadmin.io">servicio@goadmin.io</a>.</p>
        
        <p>Equipo GO Admin</p>
        
        <div class="footer">
          <p>Go Admin S.A.S. · NIT 901.479.683-5 · Carrera 87 B # 45 B - 8, Medellín</p>
          <div class="company-info">
            <p>Este correo se envía de forma automática. Si tienes preguntas, escríbenos a <a href="mailto:servicio@goadmin.io">servicio@goadmin.io</a>.</p>
            <p>Política de Tratamiento de Datos Personales: <a href="https://goadmin.io/privacidad">https://goadmin.io/privacidad</a></p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
  
  const text = `
${saludo}

Recibimos tu solicitud para eliminar tu cuenta de GO Admin el ${fechaSolicitud}.

Eliminaremos tus datos personales en un plazo máximo de 15 días hábiles. Conservaremos solo lo que la ley nos obliga a guardar, como la facturación y la contabilidad, por 10 años.

Te escribiremos otra vez cuando el proceso termine.

Si cambiaste de opinión, escríbenos a servicio@goadmin.io antes del ${fechaProgramada} y cancelamos la solicitud.

Si no hiciste esta solicitud, avísanos cuanto antes a servicio@goadmin.io.

Equipo GO Admin

—
Go Admin S.A.S. · NIT 901.479.683-5 · Carrera 87 B # 45 B - 8, Medellín
Este correo se envía de forma automática. Si tienes preguntas, escríbenos a servicio@goadmin.io. Política de Tratamiento de Datos Personales: https://goadmin.io/privacidad
  `.trim();
  
  try {
    const resend = getResend();
    await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
      text,
    });
  } catch (error) {
    console.error('[Account Deletion Email] Error enviando correo de solicitud:', error);
    throw error;
  }
}

/**
 * Envía el correo cuando se completa la eliminación de la cuenta
 */
export async function sendAccountDeletionCompleteEmail(
  to: string,
  requestDate: Date
): Promise<void> {
  const fechaSolicitud = formatearFechaEspanol(requestDate);
  
  const subject = 'Eliminamos tu cuenta de GO Admin';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .content {
          background: #f9fafb;
          padding: 30px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
        }
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          font-size: 12px;
          color: #6b7280;
        }
        a {
          color: #1a56db;
          text-decoration: none;
        }
        ul {
          margin: 10px 0;
          padding-left: 20px;
        }
        .company-info {
          margin-top: 10px;
          font-size: 11px;
          color: #9ca3af;
        }
      </style>
    </head>
    <body>
      <div class="content">
        <p>Hola:</p>
        
        <p>Terminamos de procesar tu solicitud del ${fechaSolicitud}. Desde hoy:</p>
        
        <ul>
          <li>Eliminamos o anonimizamos tu perfil y tus datos personales.</li>
          <li>Tu usuario quedó deshabilitado y ya no tiene acceso a ninguna organización.</li>
          <li>Conservamos solo lo que la ley nos obliga a guardar, como los registros de facturación y contabilidad, por 10 años. Después los eliminamos.</li>
        </ul>
        
        <p>Si tienes preguntas o quieres presentar un reclamo sobre el tratamiento de tus datos, escríbenos a <a href="mailto:servicio@goadmin.io">servicio@goadmin.io</a>. También puedes acudir a la Superintendencia de Industria y Comercio.</p>
        
        <p>Equipo GO Admin</p>
        
        <div class="footer">
          <p>Go Admin S.A.S. · NIT 901.479.683-5 · Carrera 87 B # 45 B - 8, Medellín</p>
          <div class="company-info">
            <p>Este correo se envía de forma automática. Si tienes preguntas, escríbenos a <a href="mailto:servicio@goadmin.io">servicio@goadmin.io</a>.</p>
            <p>Política de Tratamiento de Datos Personales: <a href="https://goadmin.io/privacidad">https://goadmin.io/privacidad</a></p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
  
  const text = `
Hola:

Terminamos de procesar tu solicitud del ${fechaSolicitud}. Desde hoy:

- Eliminamos o anonimizamos tu perfil y tus datos personales.
- Tu usuario quedó deshabilitado y ya no tiene acceso a ninguna organización.
- Conservamos solo lo que la ley nos obliga a guardar, como los registros de facturación y contabilidad, por 10 años. Después los eliminamos.

Si tienes preguntas o quieres presentar un reclamo sobre el tratamiento de tus datos, escríbenos a servicio@goadmin.io. También puedes acudir a la Superintendencia de Industria y Comercio.

Equipo GO Admin

—
Go Admin S.A.S. · NIT 901.479.683-5 · Carrera 87 B # 45 B - 8, Medellín
Este correo se envía de forma automática. Si tienes preguntas, escríbenos a servicio@goadmin.io. Política de Tratamiento de Datos Personales: https://goadmin.io/privacidad
  `.trim();
  
  try {
    const resend = getResend();
    await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
      text,
    });
  } catch (error) {
    console.error('[Account Deletion Email] Error enviando correo de completado:', error);
    throw error;
  }
}

/**
 * Envía alerta a soporte cuando un usuario único admin solicita eliminación
 */
export async function sendAdminBlockNotification(
  userEmail: string,
  userId: string,
  blockingOrganizations: Array<{ organization_id: number; organization_name: string; subscription_status: string }>
): Promise<void> {
  const subject = `Solicitud de eliminación bloqueada - Usuario único administrador`;
  
  const orgsList = blockingOrganizations
    .map(org => `- Org ${org.organization_id} (${org.organization_name}) - Suscripción: ${org.subscription_status}`)
    .join('\n');
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .content {
          background: #fff3cd;
          padding: 20px;
          border: 1px solid #ffc107;
          border-radius: 8px;
        }
        .code {
          background: #f3f4f6;
          padding: 2px 6px;
          border-radius: 3px;
          font-family: monospace;
          font-size: 90%;
        }
        ul {
          margin: 10px 0;
          padding-left: 20px;
        }
      </style>
    </head>
    <body>
      <div class="content">
        <h2>Solicitud de eliminación bloqueada</h2>
        
        <p><strong>Usuario:</strong> ${userEmail} (ID: <span class="code">${userId}</span>)</p>
        
        <p><strong>Motivo:</strong> El usuario es el único administrador de una o más organizaciones con suscripción activa y otros usuarios.</p>
        
        <p><strong>Organizaciones bloqueantes:</strong></p>
        <ul>
          ${blockingOrganizations.map(org => `<li>Org ${org.organization_id} (${org.organization_name}) - Suscripción: ${org.subscription_status}</li>`).join('\n          ')}
        </ul>
        
        <p><strong>Acción requerida:</strong></p>
        <p>Contactar al usuario para que asigne otro administrador antes de procesar la eliminación, o coordinar la migración de la organización.</p>
      </div>
    </body>
    </html>
  `;
  
  const text = `
Solicitud de eliminación bloqueada

Usuario: ${userEmail} (ID: ${userId})

Motivo: El usuario es el único administrador de una o más organizaciones con suscripción activa y otros usuarios.

Organizaciones bloqueantes:
${orgsList}

Acción requerida:
Contactar al usuario para que asigne otro administrador antes de procesar la eliminación, o coordinar la migración de la organización.
  `.trim();
  
  try {
    const resend = getResend();
    await resend.emails.send({
      from: fromEmail,
      to: 'servicio@goadmin.io',
      subject,
      html,
      text,
    });
  } catch (error) {
    console.error('[Account Deletion] Error enviando alerta a soporte:', error);
    throw error;
  }
}
