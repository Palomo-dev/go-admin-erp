/**
 * Plantillas de correo para el flujo de eliminación de cuenta
 * 
 * Cumplimiento Ley 1581 de 2012: textos proporcionados por Legal
 */

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail = process.env.RESEND_FROM_EMAIL || 'GO Admin <noreply@goadmin.io>';

const LEGAL_TEXT = 'Eliminaremos tus datos personales en un plazo máximo de 15 días hábiles. Conservaremos solo lo que la ley nos obliga a guardar, como la facturación y la contabilidad, por 10 años.';

/**
 * Envía el correo cuando el usuario solicita la eliminación de su cuenta
 */
export async function sendAccountDeletionRequestEmail(
  to: string,
  userName: string
): Promise<void> {
  const subject = 'Solicitud de eliminación de cuenta recibida';
  
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
        .header {
          background: #1a56db;
          color: white;
          padding: 20px;
          border-radius: 8px 8px 0 0;
        }
        .content {
          background: #f9fafb;
          padding: 30px;
          border: 1px solid #e5e7eb;
          border-top: none;
          border-radius: 0 0 8px 8px;
        }
        .notice {
          background: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 15px;
          margin: 20px 0;
        }
        .legal {
          background: white;
          border: 1px solid #e5e7eb;
          padding: 15px;
          margin: 20px 0;
          font-weight: 500;
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
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1 style="margin: 0; font-size: 24px;">Solicitud de eliminación de cuenta</h1>
      </div>
      
      <div class="content">
        <p>Hola${userName ? ` ${userName}` : ''},</p>
        
        <p>Hemos recibido tu solicitud para eliminar tu cuenta de GO Admin ERP.</p>
        
        <div class="legal">
          <strong>📋 Qué sucederá con tus datos:</strong>
          <p style="margin: 10px 0 0 0;">${LEGAL_TEXT}</p>
        </div>
        
        <div class="notice">
          <strong>⏰ Plazo de procesamiento</strong>
          <p style="margin: 5px 0 0 0;">
            Tu solicitud será procesada en un plazo máximo de 15 días hábiles.
            Recibirás un correo de confirmación cuando se complete el proceso.
          </p>
        </div>
        
        <p><strong>¿Cambiaste de opinión?</strong></p>
        <p>
          Si deseas cancelar esta solicitud, por favor contacta con nuestro equipo de soporte 
          lo antes posible en <a href="mailto:soporte@goadmin.io">soporte@goadmin.io</a>.
        </p>
        
        <div class="footer">
          <p>Este correo se envió automáticamente. Por favor no respondas a este mensaje.</p>
          <p>GO Admin ERP - Sistema de Gestión Empresarial</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  const text = `
Solicitud de eliminación de cuenta recibida

Hola${userName ? ` ${userName}` : ''},

Hemos recibido tu solicitud para eliminar tu cuenta de GO Admin ERP.

QUÉ SUCEDERÁ CON TUS DATOS:
${LEGAL_TEXT}

PLAZO DE PROCESAMIENTO:
Tu solicitud será procesada en un plazo máximo de 15 días hábiles.
Recibirás un correo de confirmación cuando se complete el proceso.

¿CAMBIASTE DE OPINIÓN?
Si deseas cancelar esta solicitud, por favor contacta con nuestro equipo de soporte 
lo antes posible en soporte@goadmin.io.

---
Este correo se envió automáticamente. Por favor no respondas a este mensaje.
GO Admin ERP - Sistema de Gestión Empresarial
  `;
  
  try {
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
  to: string
): Promise<void> {
  const subject = 'Tu cuenta ha sido eliminada';
  
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
        .header {
          background: #059669;
          color: white;
          padding: 20px;
          border-radius: 8px 8px 0 0;
        }
        .content {
          background: #f9fafb;
          padding: 30px;
          border: 1px solid #e5e7eb;
          border-top: none;
          border-radius: 0 0 8px 8px;
        }
        .check {
          text-align: center;
          font-size: 48px;
          margin: 20px 0;
        }
        .legal {
          background: white;
          border: 1px solid #e5e7eb;
          padding: 15px;
          margin: 20px 0;
        }
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          font-size: 12px;
          color: #6b7280;
        }
        a {
          color: #059669;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1 style="margin: 0; font-size: 24px;">Eliminación de cuenta completada</h1>
      </div>
      
      <div class="content">
        <div class="check">✓</div>
        
        <p>Tu solicitud de eliminación de cuenta ha sido procesada exitosamente.</p>
        
        <div class="legal">
          <strong>📋 Tus datos personales han sido eliminados</strong>
          <p style="margin: 10px 0 0 0;">${LEGAL_TEXT}</p>
        </div>
        
        <p><strong>¿Qué significa esto?</strong></p>
        <ul>
          <li>Tu perfil y datos personales han sido eliminados o anonimizados</li>
          <li>Ya no tienes acceso a ninguna organización</li>
          <li>Tu cuenta de usuario ha sido deshabilitada</li>
          <li>Los registros de facturación y contabilidad se conservan por obligación legal durante 10 años</li>
        </ul>
        
        <p>
          Si tienes alguna pregunta sobre este proceso, puedes contactarnos en 
          <a href="mailto:privacidad@goadmin.io">privacidad@goadmin.io</a>.
        </p>
        
        <div class="footer">
          <p>Este correo se envió automáticamente. Por favor no respondas a este mensaje.</p>
          <p>GO Admin ERP - Sistema de Gestión Empresarial</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  const text = `
Eliminación de cuenta completada

Tu solicitud de eliminación de cuenta ha sido procesada exitosamente.

TUS DATOS PERSONALES HAN SIDO ELIMINADOS:
${LEGAL_TEXT}

¿QUÉ SIGNIFICA ESTO?
- Tu perfil y datos personales han sido eliminados o anonimizados
- Ya no tienes acceso a ninguna organización
- Tu cuenta de usuario ha sido deshabilitada
- Los registros de facturación y contabilidad se conservan por obligación legal durante 10 años

Si tienes alguna pregunta sobre este proceso, puedes contactarnos en privacidad@goadmin.io.

---
Este correo se envió automáticamente. Por favor no respondas a este mensaje.
GO Admin ERP - Sistema de Gestión Empresarial
  `;
  
  try {
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
