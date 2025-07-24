import { supabase, signInWithEmail } from '@/lib/supabase/config';

interface OrganizationType {
  name: string;
}

interface OrganizationResponse {
  id: number;
  name: string;
  type_id: number;
  organization_types: OrganizationType;
}

interface Organization {
  id: number;
  name: string;
  type_id: {
    name: string;
  };
  role_id?: number;
  plan_id: {
    name: string;
  };
  status?: string;
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

export const handleEmailLogin = async ({
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
}: EmailLoginParams) => {
  setLoading(true);
  setError(null);

  try {
    const { data, error } = await signInWithEmail(email, password);
    
    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        throw new Error('El usuario no existe o las credenciales son incorrectas. Por favor verifica tu email y contraseña.');
      } else if (error.message.includes('Email not confirmed')) {
        // Marcar que el email no está confirmado para mostrar UI especial
        if (setEmailNotConfirmed) {
          setEmailNotConfirmed(true);
        }
        
        // Intentar reenviar automáticamente el email de verificación
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
            console.error('Error al reenviar email:', resendError);
            throw new Error('Tu cuenta aún no ha sido verificada. Por favor revisa tu correo electrónico y haz clic en el enlace de verificación.');
          }
        } catch (resendErr: any) {
          if (setResendingEmail) setResendingEmail(false);
          // Si el reenvío falla, mostrar mensaje básico
          throw new Error('Tu cuenta aún no ha sido verificada. Por favor revisa tu correo electrónico y haz clic en el enlace de verificación.');
        }
      } else if (error.message.includes('User not found')) {
        throw new Error('El usuario no existe. ¿Quieres crear una cuenta nueva?');
      } else {
        throw error;
      }
    }
    
    if (!data?.user) {
      throw new Error('No se pudo obtener la información del usuario');
    }

    // Get user's ACTIVE organizations where they are owner
    const { data: ownedOrgs, error: ownedError } = await supabase
      .from('organizations')
      .select(`
        id,
        name,
        type_id,
        organization_types:organization_types!fk_organizations_organization_type(name),
        plan_id (
          id,
          name
        ),
        status
      `)
      .eq('owner_user_id', data.user.id)
      .eq('status', 'active'); // Filtrar para obtener solo organizaciones activas


    if (ownedError) {
      throw ownedError;
    }

    // Transform organizations data
    const organizations = (ownedOrgs || []).map((org: any) => ({
      id: org.id,
      name: org.name,
      type_id: { name: org.organization_types ? org.organization_types.name : 'Unknown' },
      role_id: 2, // Owner role
      plan_id: { name: org.plan_id ? org.plan_id.name : 'Unknown' },
      status: org.status || 'active'
    }));

    // If user has organizations, show selection popup
    if (organizations.length >= 1) {
      setUserOrganizations(organizations);
      setShowOrgPopup(true);
      setLoading(false);
      return;
    }

    // If no organizations or exactly one organization found, proceed with login
    // The user might be invited to join an organization later
    proceedWithLogin(rememberMe, email);

    setLoading(false);
  } catch (err: any) {
    setError(err.message || 'Error al iniciar sesión');
    setLoading(false);
  }
};

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
