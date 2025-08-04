import { supabase, signInWithEmail } from '@/lib/supabase/config';
import type { AuthError, Session, User } from '@supabase/supabase-js';

// Interfaces para tipos de datos
interface OrganizationType {
  name: string;
}

interface Plan {
  id: number;
  name: string;
}

interface Organization {
  id: number;
  name: string;
  type_id: {
    name: string;
  };
  role_id?: number;
  plan_id: Plan;
  status?: string;
}

interface LoginResult {
  success: boolean;
  error?: string;
  requiresEmailVerification?: boolean;
}

export interface EmailLoginParams {
  email: string;
  password: string;
  rememberMe: boolean;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setUserOrganizations: (orgs: Organization[]) => void;
  setShowOrgPopup: (show: boolean) => void;
  proceedWithLogin: (rememberMe: boolean, email: string) => void;
  setEmailNotConfirmed?: (confirmed: boolean) => void;
  setResendingEmail?: (resending: boolean) => void;
}

/**
 * Maneja el proceso de login con email y contraseña
 * Incluye validación de errores, reenvío de emails y obtención de organizaciones
 */
export const handleEmailLogin = async (params: EmailLoginParams): Promise<void> => {
  const {
    email,
    password,
    rememberMe,
    setLoading,
    setError,
    setUserOrganizations,
    setShowOrgPopup,
    proceedWithLogin,
    setEmailNotConfirmed,
    setResendingEmail
  } = params;

  setLoading(true);
  setError(null);

  try {
    // Intentar login
    const loginResult = await performLogin(email, password);
    
    if (!loginResult.success) {
      if (loginResult.requiresEmailVerification) {
        await handleEmailVerification(email, setEmailNotConfirmed, setResendingEmail);
      }
      throw new Error(loginResult.error || 'Error en el login');
    }

    // Obtener usuario actual
    console.log('🔍 [EMAIL AUTH] Obteniendo datos del usuario...');
    
    // Primero verificar la sesión actual
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    console.log('🔍 [EMAIL AUTH] Sesión actual:', {
      hasSession: !!sessionData.session,
      hasUser: !!sessionData.session?.user,
      userId: sessionData.session?.user?.id,
      sessionError
    });
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    console.log('🔍 [EMAIL AUTH] getUser resultado:', {
      hasUser: !!user,
      userId: user?.id,
      userEmail: user?.email,
      userError
    });
    
    if (userError || !user) {
      console.error('❌ [EMAIL AUTH] Error obteniendo usuario:', { userError, user });
      
      // Si getUser falla pero tenemos sesión, usar el usuario de la sesión
      if (sessionData.session?.user) {
        console.log('✅ [EMAIL AUTH] Usando usuario de sesión como fallback');
        const sessionUser = sessionData.session.user;
        // Continuar con el usuario de la sesión
        
        // Obtener organizaciones del usuario
        console.log('📈 [EMAIL AUTH] Obteniendo organizaciones para usuario:', sessionUser.id);
        const organizations = await getUserOrganizations(sessionUser.id);
        
        console.log('🏢 [EMAIL AUTH] Organizaciones encontradas:', {
          count: organizations.length,
          organizations: organizations.map(org => ({ id: org.id, name: org.name }))
        });

        // Mostrar selector de organización si hay múltiples
        if (organizations.length >= 1) {
          console.log('📱 [EMAIL AUTH] Mostrando popup de selección de organización');
          setUserOrganizations(organizations);
          setShowOrgPopup(true);
        } else {
          console.log('🚀 [EMAIL AUTH] Login directo - no hay organizaciones');
          // Login directo si no hay organizaciones
          proceedWithLogin(rememberMe, email);
        }
        return;
      }
      
      throw new Error('No se pudo obtener la información del usuario');
    }

    // Obtener organizaciones del usuario
    console.log('📈 [EMAIL AUTH] Obteniendo organizaciones para usuario:', user.id);
    const organizations = await getUserOrganizations(user.id);
    
    console.log('🏢 [EMAIL AUTH] Organizaciones encontradas:', {
      count: organizations.length,
      organizations: organizations.map(org => ({ id: org.id, name: org.name }))
    });

    // Mostrar selector de organización si hay múltiples
    if (organizations.length >= 1) {
      console.log('📱 [EMAIL AUTH] Mostrando popup de selección de organización');
      setUserOrganizations(organizations);
      setShowOrgPopup(true);
    } else {
      console.log('🚀 [EMAIL AUTH] Login directo - no hay organizaciones');
      // Login directo si no hay organizaciones
      proceedWithLogin(rememberMe, email);
    }
    
  } catch (error: any) {
    setError(error.message || 'Error al iniciar sesión');
  } finally {
    setLoading(false);
  }
};

/**
 * Realiza el login con email y contraseña
 */
async function performLogin(email: string, password: string): Promise<LoginResult> {
  try {
    console.log('🚀 [PERFORM LOGIN] Iniciando login para:', email);
    const { data, error } = await signInWithEmail(email, password);
    
    console.log('🔍 [PERFORM LOGIN] Resultado signInWithEmail:', {
      hasData: !!data,
      hasSession: !!data?.session,
      hasUser: !!data?.user,
      userId: data?.user?.id,
      userEmail: data?.user?.email,
      error: error?.message
    });

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        return {
          success: false,
          error: 'El usuario no existe o las credenciales son incorrectas. Por favor verifica tu email y contraseña.'
        };
      }
      
      if (error.message.includes('Email not confirmed')) {
        return {
          success: false,
          error: 'Tu cuenta aún no ha sido verificada.',
          requiresEmailVerification: true
        };
      }
      
      if (error.message.includes('User not found')) {
        return {
          success: false,
          error: 'El usuario no existe. ¿Quieres crear una cuenta nueva?'
        };
      }
      
      return {
        success: false,
        error: error.message
      };
    }

    if (!data?.user || !data?.session) {
      console.error('❌ [PERFORM LOGIN] Datos incompletos:', { hasUser: !!data?.user, hasSession: !!data?.session });
      return {
        success: false,
        error: 'La sesión no se pudo establecer correctamente.'
      };
    }

    // Establecer sesión en el cliente
    console.log('🔄 [PERFORM LOGIN] Estableciendo sesión en cliente...');
    const { data: setSessionData, error: setSessionError } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token
    });
    
    if (setSessionError) {
      console.error('❌ [PERFORM LOGIN] Error estableciendo sesión:', setSessionError);
      return {
        success: false,
        error: 'Error estableciendo la sesión: ' + setSessionError.message
      };
    }
    
    console.log('✅ [PERFORM LOGIN] Sesión establecida exitosamente:', {
      hasSession: !!setSessionData.session,
      userId: setSessionData.session?.user?.id
    });

    return { success: true };
    
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error inesperado durante el login'
    };
  }
}

/**
 * Maneja la verificación de email y reenvío
 */
async function handleEmailVerification(
  email: string,
  setEmailNotConfirmed?: (confirmed: boolean) => void,
  setResendingEmail?: (resending: boolean) => void
): Promise<void> {
  if (setEmailNotConfirmed) setEmailNotConfirmed(true);

  try {
    if (setResendingEmail) setResendingEmail(true);

    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/app/inicio`
      }
    });

    if (setResendingEmail) setResendingEmail(false);

    if (!resendError) {
      throw new Error('Tu cuenta aún no ha sido verificada. Hemos reenviado el correo de verificación a tu bandeja de entrada. Por favor revisa tu email y haz clic en el enlace de verificación.');
    } else {
      throw new Error('Tu cuenta aún no ha sido verificada. Por favor revisa tu correo electrónico y haz clic en el enlace de verificación.');
    }
  } catch (error: any) {
    if (setResendingEmail) setResendingEmail(false);
    throw new Error('Tu cuenta aún no ha sido verificada. Por favor revisa tu correo electrónico y haz clic en el enlace de verificación.');
  }
}

/**
 * Obtiene las organizaciones del usuario
 */
async function getUserOrganizations(userId: string): Promise<Organization[]> {
  const { data: ownedOrgs, error: ownedError } = await supabase
    .from('organization_members')
    .select(`
      user_id,
      organization_id,
      role_id,
      is_active,
      organizations!inner(
        id,
        name,
        type_id,
        status,
        plan_id,
        organization_types(
          name
        ),
        plans(
          id,
          name
        )
      )
    `)
    .eq('user_id', userId)
    .eq('is_active', true);

  if (ownedError) {
    console.error('Error obteniendo organizaciones:', ownedError);
    throw new Error('Error al obtener las organizaciones del usuario');
  }

  return (ownedOrgs || []).map((member: any) => ({
    id: member.organizations?.id || member.organization_id,
    name: member.organizations?.name || 'Unknown',
    type_id: { name: member.organizations?.organization_types?.name || 'Unknown' },
    role_id: member.role_id,
    plan_id: {
      id: member.organizations?.plans?.id || 0,
      name: member.organizations?.plans?.name || 'Unknown'
    },
    status: member.organizations?.status || 'active'
  }));
}

// Función para reenviar email de verificación manualmente
export const resendVerificationEmail = async (email: string): Promise<{ success: boolean; message: string }> => {
  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/app/inicio`
      }
    });
    
    if (error) {
      console.error('Error al reenviar email:', error);
      return {
        success: false,
        message: 'Error al reenviar el correo de verificación. Por favor intenta más tarde.'
      };
    }
    
    return {
      success: true,
      message: 'Correo de verificación reenviado correctamente. Revisa tu bandeja de entrada.'
    };
  } catch (err: any) {
    console.error('Error inesperado al reenviar email:', err);
    return {
      success: false,
      message: 'Error inesperado. Por favor intenta más tarde.'
    };
  }
};
