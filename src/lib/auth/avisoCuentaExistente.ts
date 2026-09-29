/**
 * Correo «ya tienes una cuenta» (decisión v2-6, docs/design/AUTH-ACCESO-V2.md §9-6).
 *
 * El registro ya no dice en pantalla si un correo existe (era un oráculo de
 * enumeración). Si alguien se registra con un correo que ya tiene cuenta, la
 * pantalla responde lo mismo que siempre («revisa tu correo») y al dueño del
 * correo le llega este aviso con enlaces para entrar o recuperar la contraseña.
 *
 * SOLO servidor. Remitente global de la plataforma (Resend).
 */
import { getMasterResend, getMasterResendKey } from '@/lib/services/crm/email/resendClient';

type Idioma = 'es' | 'en' | 'fr' | 'pt';

const TEXTOS: Record<Idioma, { asunto: string; hola: string; cuerpo: string; entrar: string; recuperar: string; ignorar: string }> = {
  es: {
    asunto: 'Ya tienes una cuenta en GO Admin',
    hola: 'Hola:',
    cuerpo: 'Alguien intentó crear una cuenta nueva con este correo, pero ya tienes una. No se creó nada nuevo.',
    entrar: 'Entrar a GO Admin',
    recuperar: '¿No recuerdas la contraseña? Recupérala aquí',
    ignorar: 'Si no fuiste tú, puedes ignorar este mensaje: tu cuenta sigue igual.',
  },
  en: {
    asunto: 'You already have a GO Admin account',
    hola: 'Hello,',
    cuerpo: 'Someone tried to create a new account with this email, but you already have one. Nothing new was created.',
    entrar: 'Sign in to GO Admin',
    recuperar: "Don't remember your password? Recover it here",
    ignorar: "If it wasn't you, you can ignore this message: your account is unchanged.",
  },
  fr: {
    asunto: 'Vous avez déjà un compte GO Admin',
    hola: 'Bonjour,',
    cuerpo: "Quelqu'un a essayé de créer un nouveau compte avec cette adresse, mais vous en avez déjà un. Rien n'a été créé.",
    entrar: 'Se connecter à GO Admin',
    recuperar: 'Mot de passe oublié ? Récupérez-le ici',
    ignorar: "Si ce n'était pas vous, ignorez ce message : votre compte n'a pas changé.",
  },
  pt: {
    asunto: 'Você já tem uma conta no GO Admin',
    hola: 'Olá,',
    cuerpo: 'Alguém tentou criar uma conta nova com este e-mail, mas você já tem uma. Nada novo foi criado.',
    entrar: 'Entrar no GO Admin',
    recuperar: 'Não lembra a senha? Recupere aqui',
    ignorar: 'Se não foi você, pode ignorar esta mensagem: sua conta continua igual.',
  },
};

export function textosAvisoCuentaExistente(idioma: string | null | undefined) {
  return TEXTOS[(['es', 'en', 'fr', 'pt'].includes(String(idioma)) ? idioma : 'es') as Idioma];
}

/** Envía el aviso. Nunca lanza: devuelve si se envió (solo para los logs). */
export async function enviarAvisoCuentaExistente(correo: string, origin: string, idioma?: string | null): Promise<boolean> {
  if (!getMasterResendKey()) {
    console.warn('[registro] RESEND_API_KEY no configurada: no se envía el aviso de cuenta existente');
    return false;
  }
  const t = textosAvisoCuentaExistente(idioma);
  const remitente = `${process.env.EMAIL_FROM_NAME || 'GO Admin'} <${process.env.EMAIL_FROM_ADDRESS || 'notificaciones@goadmin.io'}>`;
  const login = `${origin}/auth/login`;
  const recuperar = `${origin}/auth/forgot-password`;
  const html = `<p>${t.hola}</p><p>${t.cuerpo}</p><p><a href="${login}">${t.entrar}</a></p><p><a href="${recuperar}">${t.recuperar}</a></p><p style="color:#64748b">${t.ignorar}</p>`;
  const text = `${t.hola}\n\n${t.cuerpo}\n\n${t.entrar}: ${login}\n${t.recuperar}: ${recuperar}\n\n${t.ignorar}`;
  try {
    const { error } = await getMasterResend().emails.send({ from: remitente, to: correo, subject: t.asunto, html, text });
    if (error) {
      console.warn('[registro] Resend no envió el aviso de cuenta existente:', error.name);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[registro] Error enviando el aviso de cuenta existente:', e instanceof Error ? e.message : e);
    return false;
  }
}
