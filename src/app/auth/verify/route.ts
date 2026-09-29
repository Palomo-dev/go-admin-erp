import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { completeSignupAfterEmailConfirmation } from '@/app/auth/callback/route';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimits, getClientIp } from '@/lib/security/rateLimit';
import { getRateLimitStore } from '@/lib/security/rateLimitStore';
import { buscarInvitacionVigentePorCorreo, reenviarEnlaceInvitacion } from '@/lib/auth/invitaciones';

/**
 * Rate limit del auto-reenvío del enlace (bombardeo de correo).
 * Esta ruta es pública y, con `?type=magiclink|invite&email=...` y un token
 * inválido, dispara un envío por petición. La cookie anti-bucle no sirve como
 * freno: basta con no mandarla. Límites por IP y por correo destino.
 */
const RESEND_IP_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };
const RESEND_EMAIL_LIMIT = { limit: 3, windowMs: 15 * 60 * 1000 };

/**
 * Código de la invitación vigente de un correo YA PROBADO por `verifyOtp`
 * (el token del correo demuestra que quien abre el enlace controla el buzón).
 * Nunca se llama con un correo que solo venga de la URL.
 */
async function codigoInvitacionDelCorreoVerificado(email: string | undefined | null): Promise<string | null> {
  if (!email) return null;
  try {
    const invitacion = await buscarInvitacionVigentePorCorreo(getSupabaseAdmin(), email);
    return invitacion?.code ?? null;
  } catch (err) {
    console.error('Error buscando invitación vigente del correo verificado:', err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get('token');
  const type = requestUrl.searchParams.get('type');
  const completeSignup = requestUrl.searchParams.get('complete_signup') === 'true';
  // email: añadido por el template "Magic Link" modificado en Supabase dashboard
  // (parámetro &email={{ .Email }}). Permite reenviar automáticamente el magic link
  // cuando el token original fue consumido por email prefetch de Gmail/Outlook.
  const emailParam = requestUrl.searchParams.get('email');

  // Sin la URL completa: lleva el token del correo.
  console.log('Verify endpoint called:', {
    hasToken: !!token,
    type,
    completeSignup,
    hasEmailParam: !!emailParam,
  });

  // Crear cliente Supabase para server-side
  const cookieStore = await cookies();

  // Almacenar cookies pendientes para aplicar al redirect response.
  // CRÍTICO: En Next.js App Router, cookieStore.set() modifica la respuesta
  // subyacente, pero si retornamos NextResponse.redirect() se crea una NUEVA
  // respuesta que NO incluye esas cookies. Esto causaba que las sesiones
  // establecidas por verifyOtp se perdieran en el redirect a /auth/invite,
  // rompiendo el flujo de invitaciones. Patrón tomado de callback/route.ts.
  const pendingCookies = new Map<string, string | null>();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: 'pkce',
        storage: {
          getItem: (key: string) => {
            // Primero buscar en cookies pendientes (guardadas por verifyOtp)
            if (pendingCookies.has(key)) {
              return pendingCookies.get(key) ?? null;
            }
            return cookieStore.get(key)?.value ?? null;
          },
          setItem: (key: string, value: string) => {
            // NO codificar aquí: Next.js ResponseCookies ya hace encodeURIComponent
            // del valor al serializar el Set-Cookie header. Si codificamos aquí,
            // el resultado es doble-encoded y el cliente (que hace un solo
            // decodeURIComponent) no puede parsear el JSON de la sesión.
            pendingCookies.set(key, value);
          },
          removeItem: (key: string) => {
            pendingCookies.set(key, null);
          }
        },
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  // Helper: crear redirect con cookies de sesión aplicadas.
  // Sin esto, las cookies seteadas por verifyOtp se pierden al retornar
  // un NextResponse.redirect() que es una respuesta nueva.
  // Incluye chunking para cookies grandes: el navegador limita cada cookie
  // a ~4096 bytes. Si la sesión es grande (ej. user_metadata con signup_data),
  // una sola cookie excede el límite y el navegador la descarta silenciosamente.
  // El cliente (config.ts) ya lee cookies chunked (name.0, name.1, ...).
  //
  // IMPORTANTE: Next.js ResponseCookies hace encodeURIComponent del valor al
  // serializar el Set-Cookie header. Si dividimos el valor RAW en chunks y
  // dejamos que Next.js los codifique, cada chunk de 3500 raw chars se convierte
  // en ~7000+ bytes codificados (JSON tiene muchos chars especiales que se
  // expanden 3x: { → %7B, " → %22, etc.), excediendo el límite de 4096 bytes.
  // Por eso codificamos nosotros mismos y dividimos el valor YA CODIFICADO,
  // seteando los Set-Cookie headers directamente para evitar la doble
  // codificación de Next.js.
  function redirectWithCookies(url: string) {
    const response = NextResponse.redirect(new URL(url, request.url));
    const isProduction = process.env.NODE_ENV === 'production';
    const flags = `Path=/; Max-Age=604800; SameSite=Lax${isProduction ? '; Secure' : ''}`;
    const deleteFlags = `Path=/; Max-Age=0; SameSite=Lax${isProduction ? '; Secure' : ''}`;

    pendingCookies.forEach((value, name) => {
      if (value !== null) {
        // Primero, borrar cookie simple y chunks anteriores (en orden,
        // antes de setear los nuevos, para que el browser los procese primero)
        response.headers.append('Set-Cookie', `${name}=; ${deleteFlags}`);
        for (let i = 0; i < 10; i++) {
          response.headers.append('Set-Cookie', `${name}.${i}=; ${deleteFlags}`);
        }

        // Codificar el valor nosotros mismos
        const encodedValue = encodeURIComponent(value);

        if (encodedValue.length < 3600) {
          // Cookie simple: setear directamente (ya codificado, sin doble codificación)
          response.headers.append('Set-Cookie', `${name}=${encodedValue}; ${flags}`);
        } else {
          // Dividir el valor CODIFICADO en chunks de 3500 bytes.
          // Cuidar no dividir una secuencia %XX (3 chars) entre chunks.
          const CHUNK_SIZE = 3500;
          let chunkIndex = 0;
          let offset = 0;
          while (offset < encodedValue.length) {
            let end = Math.min(offset + CHUNK_SIZE, encodedValue.length);
            if (end < encodedValue.length) {
              if (encodedValue[end - 2] === '%') end -= 2;
              else if (encodedValue[end - 1] === '%') end -= 1;
            }
            const chunk = encodedValue.substring(offset, end);
            response.headers.append('Set-Cookie', `${name}.${chunkIndex}=${chunk}; ${flags}`);
            offset = end;
            chunkIndex++;
          }
          console.log(`🍪 [VERIFY] Cookie chunked: ${name} (${chunkIndex} chunks, ${encodedValue.length} bytes encoded)`);
        }
      } else {
        // Borrar cookie simple y chunks
        response.headers.append('Set-Cookie', `${name}=; ${deleteFlags}`);
        for (let i = 0; i < 10; i++) {
          response.headers.append('Set-Cookie', `${name}.${i}=; ${deleteFlags}`);
        }
      }
    });
    return response;
  }

  // Tipos de OTP soportados por verifyOtp para links de email (sin PKCE, funcionan cross-device)
  const supportedTypes = ['signup', 'recovery', 'email_change', 'invite', 'magiclink'];

  if (token && type && supportedTypes.includes(type)) {
    try {
      console.log('Verifying email token, type:', type);
      
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: type as 'signup' | 'recovery' | 'email_change' | 'invite' | 'magiclink'
      });
      
      if (verifyError) {
        console.error('Token verification error:', verifyError);

        // invite / magiclink con token fallido (lo normal: el prefetch de
        // Gmail/Outlook lo consumió). El `email` de la URL NO prueba nada: lo
        // puede escribir cualquiera. Antes, con type=invite, se buscaba la
        // invitación de ese correo y se redirigía con su código real al
        // asistente, donde se creaba la cuenta con contraseña propia
        // (AUTH-ACCESO-V2 §4.1). Ahora solo se REENVÍA el enlace a ese buzón,
        // y la respuesta es la misma haya o no invitación (sin oráculo).
        if ((type === 'invite' || type === 'magiclink') && emailParam) {
          const correo = emailParam.toLowerCase().trim();
          const resendCookieName = `ml_resent_${correo.replace(/[^a-z0-9]/g, '')}`;
          const alreadyResent = cookieStore.get(resendCookieName)?.value === '1';

          if (alreadyResent) {
            console.log('Reenvío automático ya realizado recientemente → failed');
            return redirectWithCookies(`/auth/verify/failed?type=${type}`);
          }

          // El límite depende de la IP y del correo, no de que exista la
          // invitación: bloquear no revela nada sobre el destinatario.
          const ip = getClientIp(request);
          const rl = await checkRateLimits([
            { key: `verify:resend:ip:${ip}`, opts: RESEND_IP_LIMIT },
            { key: `verify:resend:email:${correo}`, opts: RESEND_EMAIL_LIMIT },
          ], { store: getRateLimitStore() });
          if (!rl.allowed) {
            console.warn('Reenvío automático bloqueado por rate limit:', rl.blockedKey, 'ip:', ip);
            return redirectWithCookies(`/auth/verify/failed?type=${type}`);
          }

          try {
            const { enviado } = await reenviarEnlaceInvitacion(getSupabaseAdmin(), correo, requestUrl.origin);
            console.log('Reenvío automático del enlace de invitación:', enviado ? 'enviado' : 'sin invitación vigente o fallido');
          } catch (err) {
            console.error('Reenvío automático: error inesperado:', err);
          }

          // Misma respuesta en todos los casos; cookie anti-bucle de 10 min.
          const response = redirectWithCookies(`/auth/verify/failed?type=${type}&estado=reenviado&email=${encodeURIComponent(correo)}`);
          response.cookies.set(resendCookieName, '1', {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 600,
          });
          return response;
        }

        // Para otros tipos (signup, recovery, email_change) o sin email en URL,
        // redirigir a la página que pide el email si es magiclink/invite,
        // o al login con error si es otro tipo.
        if (type === 'magiclink' || type === 'invite') {
          return redirectWithCookies(`/auth/verify/failed?type=${type}`);
        }

        return redirectWithCookies(
          '/auth/login?error=email-verification-failed&details=' + encodeURIComponent(verifyError.message)
        );
      }
      
      if (!data.user || !data.session) {
        console.error('Verification did not return user or session');
        return redirectWithCookies('/auth/login?error=verification-failed');
      }

      const user = data.user;
      console.log('Email verification successful for user:', user.id, 'type:', type);

      // signup (acceso v3, R5 opción B): el correo quedó confirmado y la sesión
      // abierta. Se crea el perfil si falta (y, para altas antiguas con
      // `signup_data`, la organización que ya traían) y se sigue: sin
      // organización, al asistente de alta; con ella, a la app. Ya no se cierra
      // la sesión para pedir otra vez la contraseña.
      if (type === 'signup') {
        await completeSignupAfterEmailConfirmation(supabase, user);
        const { data: miembros } = await getSupabaseAdmin()
          .from('organization_members')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .limit(1);
        const tieneOrganizacion = Array.isArray(miembros) && miembros.length > 0;
        if (completeSignup || !tieneOrganizacion) {
          return redirectWithCookies(tieneOrganizacion ? '/app/inicio?email_confirmed=true' : '/auth/signup/organizacion');
        }
        return redirectWithCookies('/app/inicio');
      }

      // recovery: la sesión ya queda establecida (cookies); redirigir a reset-password
      // para que el usuario defina su nueva contraseña.
      // Pero si el recovery viene de una invitación (hay invitación pendiente para
      // este email en la tabla invitations), redirigir a /auth/invite.
      if (type === 'recovery') {
        // verifyOtp probó el buzón: ya se puede buscar su invitación vigente.
        const inviteCode = await codigoInvitacionDelCorreoVerificado(user.email);
        if (inviteCode) {
          return redirectWithCookies(`/auth/invite?invite_code=${encodeURIComponent(inviteCode)}`);
        }
        return redirectWithCookies('/auth/reset-password');
      }

      // email_change: el correo ya fue actualizado por verifyOtp en auth.users.
      // Sincronizar el nuevo email en profiles e invitations (pendientes) para que
      // el usuario siga siendo encontrable por su nuevo correo en toda la app.
      // Luego cerrar sesión y pedir que inicie sesión con el nuevo correo.
      if (type === 'email_change') {
        const newEmail = user.email?.toLowerCase() || '';
        const oldEmail = user.user_metadata?.email_change_current_email?.toLowerCase() || '';

        if (newEmail) {
          const admin = getSupabaseAdmin();
          // 1. Actualizar profiles.email
          const { error: profileError } = await admin
            .from('profiles')
            .update({ email: newEmail, updated_at: new Date().toISOString() })
            .eq('id', user.id);
          if (profileError) {
            console.error('Error sincronizando profiles.email:', profileError);
          } else {
            console.log('✅ profiles.email actualizado a:', newEmail);
          }

          // 2. Actualizar invitations.email (solo pendientes) del correo viejo al nuevo
          if (oldEmail) {
            const { error: inviteError } = await admin
              .from('invitations')
              .update({ email: newEmail })
              .eq('email', oldEmail)
              .eq('status', 'pending');
            if (inviteError) {
              console.error('Error sincronizando invitations.email:', inviteError);
            } else {
              console.log('✅ invitations.email (pendientes) actualizado a:', newEmail);
            }
          }
        }

        await supabase.auth.signOut();
        return redirectWithCookies(
          '/auth/login?success=email-changed&message=' + encodeURIComponent('Tu correo electrónico ha sido actualizado exitosamente. Por favor, inicia sesión con tu nuevo correo.')
        );
      }

      // magiclink: la sesión ya queda establecida (cookies). Si hay invitación
      // pendiente, redirigir a /auth/invite para aceptarla. Si no, a la app.
      if (type === 'magiclink') {
        const inviteCode = await codigoInvitacionDelCorreoVerificado(user.email);
        if (inviteCode) {
          console.log('✅ Invitación pendiente del correo verificado → /auth/invite');
          return redirectWithCookies(`/auth/invite?invite_code=${encodeURIComponent(inviteCode)}`);
        }
        return redirectWithCookies('/app/inicio');
      }

      // invite: verifyOtp establece sesión; redirigir a /auth/invite con el código
      // de la invitación VIGENTE de ese correo (se busca en la tabla y no en
      // user_metadata: el código rota al reenviar la invitación).
      if (type === 'invite') {
        const inviteCode = await codigoInvitacionDelCorreoVerificado(user.email);
        if (inviteCode) {
          return redirectWithCookies(`/auth/invite?invite_code=${encodeURIComponent(inviteCode)}`);
        }
        // Sin invitación vigente: que defina su contraseña.
        return redirectWithCookies('/auth/reset-password');
      }
    } catch (error: unknown) {
      console.error('Email verification error:', error);
      const detalle = error instanceof Error && error.message ? error.message : 'Unknown error';
      return redirectWithCookies(
        '/auth/login?error=email-verification-error&details=' + encodeURIComponent(detalle)
      );
    }
  }

  // Si no hay token válido, redirigir a login
  console.log('No valid token found, redirecting to login');
  return redirectWithCookies('/auth/login?error=invalid-verification-link');
}
