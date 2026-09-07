import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { completeSignupAfterEmailConfirmation } from '@/app/auth/callback/route';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get('token');
  const type = requestUrl.searchParams.get('type');
  const completeSignup = requestUrl.searchParams.get('complete_signup') === 'true';
  // email: añadido por el template "Magic Link" modificado en Supabase dashboard
  // (parámetro &email={{ .Email }}). Permite reenviar automáticamente el magic link
  // cuando el token original fue consumido por email prefetch de Gmail/Outlook.
  const emailParam = requestUrl.searchParams.get('email');

  console.log('Verify endpoint called:', {
    token: token ? token.substring(0, 20) + '...' : null,
    type,
    completeSignup,
    hasEmailParam: !!emailParam,
    fullUrl: requestUrl.toString()
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

        // Si el token falló para magiclink o invite (típicamente por email prefetch
        // de Gmail/Outlook que consume el token antes de que el usuario haga clic),
        // intentar reenviar automáticamente un nuevo magic link.
        // Anti-bucle: usar cookie para limitar a 1 reenvío automático cada 10 min.
        if ((type === 'magiclink' || type === 'invite') && emailParam) {
          const resendCookieName = `ml_resent_${emailParam.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
          const alreadyResent = cookieStore.get(resendCookieName)?.value === '1';

          if (!alreadyResent) {
            const resendResult = await tryResendMagicLink(emailParam, requestUrl.origin);
            if (resendResult.success) {
              // Setear cookie anti-bucle (10 min de expiración)
              const response = redirectWithCookies(`/auth/verify/resent?email=${encodeURIComponent(emailParam)}`);
              response.cookies.set(resendCookieName, '1', {
                httpOnly: false,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/',
                maxAge: 600, // 10 minutos
              });
              return response;
            }
          } else {
            console.log('Reenvío automático ya realizado recientemente para', emailParam, '→ fallback a failed');
          }
          // Si el reenvío falló o ya se reenvió recientemente, caer al fallback.
          return redirectWithCookies(`/auth/verify/failed?type=${type}`);
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

      // signup: completar registro (crear perfil, organización, etc.) y redirigir
      if (type === 'signup') {
        if (completeSignup) {
          console.log('Completando registro tras verificación de email...');
          const { alreadyExisted } = await completeSignupAfterEmailConfirmation(supabase, user);

          if (alreadyExisted) {
            // El perfil ya existía (signup con sesión inmediata, sin bloqueo por
            // confirmación). Este correo solo confirma el email; la sesión sigue
            // activa, así que se manda directo a la app sin re-loguear.
            return redirectWithCookies('/app/inicio?email_confirmed=true');
          }

          // Caso legado: el perfil se creó apenas ahora, se pide login limpio.
          await supabase.auth.signOut();
          return redirectWithCookies(
            '/auth/login?success=email-confirmed&message=' + encodeURIComponent('Tu cuenta ha sido confirmada exitosamente. Por favor, inicia sesión con tu email y contraseña.')
          );
        }
        return redirectWithCookies('/app/inicio');
      }

      // recovery: la sesión ya queda establecida (cookies); redirigir a reset-password
      // para que el usuario defina su nueva contraseña.
      // Pero si el recovery viene de una invitación (hay invitación pendiente para
      // este email en la tabla invitations), redirigir a /auth/invite.
      if (type === 'recovery') {
        // Buscar invitación pendiente por email
        const { data: pendingInvite } = await supabase
          .from('invitations')
          .select('code')
          .eq('email', user.email)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (pendingInvite?.code) {
          return redirectWithCookies(`/auth/invite?invite_code=${pendingInvite.code}`);
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
        const { data: pendingInvite, error: inviteQueryError } = await supabase
          .from('invitations')
          .select('code')
          .eq('email', user.email)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (inviteQueryError) {
          console.error('Error buscando invitación pendiente para magiclink:', inviteQueryError, 'email:', user.email);
        }

        if (pendingInvite?.code) {
          console.log('✅ Invitación pendiente encontrada para', user.email, '→ /auth/invite');
          return redirectWithCookies(`/auth/invite?invite_code=${pendingInvite.code}`);
        }
        console.log('No se encontró invitación pendiente para', user.email, '→ /app/inicio');
        return redirectWithCookies('/app/inicio');
      }

      // invite: verifyOtp establece sesión; redirigir a /auth/invite con el código
      // de invitación para que el usuario complete su perfil y defina su contraseña
      if (type === 'invite') {
        const inviteCode = user.user_metadata?.invitation_code;
        if (inviteCode) {
          return redirectWithCookies(`/auth/invite?invite_code=${inviteCode}`);
        }
        // Si no hay código de invitación en metadata, redirigir a reset-password
        return redirectWithCookies('/auth/reset-password');
      }
    } catch (error: any) {
      console.error('Email verification error:', error);
      return redirectWithCookies(
        '/auth/login?error=email-verification-error&details=' + encodeURIComponent(error.message || 'Unknown error')
      );
    }
  }

  // Si no hay token válido, redirigir a login
  console.log('No valid token found, redirecting to login');
  return redirectWithCookies('/auth/login?error=invalid-verification-link');
}

/**
 * Reenvía un magic link a un usuario con invitación pendiente.
 * Se usa cuando el token original fue consumido por email prefetch.
 * Reutiliza la misma lógica de /api/auth/invite/route.ts para usuarios existentes.
 *
 * @returns { success: boolean } - true si se reenvió, false si no hay invitación o falló.
 */
async function tryResendMagicLink(email: string, origin: string): Promise<{ success: boolean }> {
  try {
    const admin = getSupabaseAdmin();
    const normalizedEmail = email.toLowerCase().trim();

    // Verificar que haya invitación pendiente para este email
    const { data: pendingInvite, error: inviteError } = await admin
      .from('invitations')
      .select('code, organization_id, organization_name')
      .eq('email', normalizedEmail)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inviteError || !pendingInvite) {
      console.log('Reenvío: no hay invitación pendiente para', normalizedEmail);
      return { success: false };
    }

    const inviteUrl = `${origin}/auth/invite?invite_code=${pendingInvite.code}`;

    // Reenviar magic link (mismo flujo que invite/route.ts)
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { error: otpError } = await anonClient.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: inviteUrl,
        data: {
          invitation_code: pendingInvite.code,
          organization_id: pendingInvite.organization_id,
          organization_name: pendingInvite.organization_name,
        },
      },
    });

    if (otpError) {
      console.error('Reenvío: error enviando Magic Link:', otpError);
      return { success: false };
    }

    console.log('📧 Magic Link reenviado automáticamente a:', normalizedEmail, 'para invitación:', pendingInvite.code);
    return { success: true };
  } catch (error) {
    console.error('Reenvío: error inesperado:', error);
    return { success: false };
  }
}
