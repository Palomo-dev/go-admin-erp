import { supabase } from '@/lib/supabase/config';

// Define Organization type
export interface Organization {
  id: number;
  name: string;
  type_id: {
    name: string;
  };
  role_id?: number;
  logo_url?: string;
  plan?: {
    id: number;
    name: string
  };
  plan_id?: {
    name: string;
  };
}

export interface SelectOrganizationParams {
  organization: Organization;
  email?: string;
  setShowOrgPopup: (show: boolean) => void;
  proceedWithLogin: (rememberMe: boolean, email: string) => void;
}

export const selectOrganizationFromPopup = async ({
  organization,
  email = '',
  setShowOrgPopup,
  proceedWithLogin
}: SelectOrganizationParams) => {
  setShowOrgPopup(false);
  
  // Save organization info to localStorage
  localStorage.setItem('currentOrganizationId', organization.id.toString());
  localStorage.setItem('currentOrganizationName', organization.name);
  
  // Continue with login process
  proceedWithLogin(false, email);
};


export const proceedWithLogin = async (rememberMe: boolean = false, email: string = '') => {
  // Set remember me preference in local storage if checked
  const { data: sessionData } = await supabase.auth.getSession();
  
  // Update user's last organization if we have a current organization ID
  const orgId = localStorage.getItem('currentOrganizationId');
  
  if (orgId && sessionData?.session?.user) {
    try {
      // Update the user's profile with the selected organization
      const { data: updateData, error: profUpdate } = await supabase
        .from('profiles')
        .update({ last_org_id: parseInt(orgId) })
        .eq('id', sessionData.session.user.id);
      
      if (profUpdate) {
        console.error('Error updating user profile with organization:', profUpdate);
      } else {
        console.log('Successfully updated user profile with organization ID:', orgId);
      }
      
      // Also fetch organization details to store in local storage
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('name, type_id, organization_types:organization_types!fk_organizations_organization_type(name)')
        .eq('id', parseInt(orgId))
        .single();
      
      if (!orgError && orgData) {
        // Store additional organization details
        // Access organization type safely with type assertion
        let orgTypeName = 'Unknown';
        
        // Log the structure to help debug
        console.log('Organization data:', orgData);
        
        try {
          // Handle different possible structures of the returned data
          if (orgData.organization_types) {
            const orgTypes = orgData.organization_types as any;
            if (typeof orgTypes === 'object') {
              if (orgTypes.name) {
                orgTypeName = orgTypes.name;
              }
            }
          }
        } catch (e) {
          console.error('Error extracting organization type:', e);
        }
        
        localStorage.setItem('currentOrganizationType', orgTypeName);
      }
    } catch (error) {
      console.error('Error in organization profile update:', error);
    }
  }

  // Simple function to obfuscate email (not true encryption but better than plaintext)
  const obfuscateEmail = (email: string): string => {
    return btoa(email.split('').reverse().join(''));
  };
  
  // Simple function to deobfuscate email
  const deobfuscateEmail = (obfuscated: string): string => {
    try {
      return atob(obfuscated).split('').reverse().join('');
    } catch (e) {
      return '';
    }
  };
  
  // Add to window for use in other components
  if (typeof window !== 'undefined') {
    (window as any).deobfuscateEmail = deobfuscateEmail;
  }
  
  if (rememberMe) {
    localStorage.setItem('rememberMe', 'true');
    // Store email with simple obfuscation instead of plaintext
    localStorage.setItem('userEmail', obfuscateEmail(email));
  } else {
    localStorage.removeItem('rememberMe');
    localStorage.removeItem('userEmail');
  }

  // Check if there's a redirectTo in session storage
  const redirectTo = sessionStorage.getItem('redirectTo');
  
  // Forzar a Supabase a persistir la sesión correctamente
  supabase.auth.refreshSession().then(() => {
    // Verificar que la sesión se haya establecido correctamente
    supabase.auth.getSession().then(({ data: sessionData }) => {
      // No almacenar tokens en localStorage por razones de seguridad
      // En su lugar, usar cookies HTTP-only para los tokens de autenticación
      if (sessionData.session) {
        // Extraer referencia del proyecto dinámicamente desde la URL de Supabase
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const projectRef = supabaseUrl.split('.')[0].replace('https://', '');
        
        // Preparar los datos de sesión completos para la cookie
        // Esto es crucial: Supabase espera el objeto completo, no solo el token
        const sessionValue = JSON.stringify({
          access_token: sessionData.session.access_token,
          refresh_token: sessionData.session.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: sessionData.session.user
        });
        
        // Cookie específica del proyecto usando la referencia dinámica
        // Esta es la cookie principal que usará Supabase para autenticar
        if (projectRef) {
          document.cookie = `sb-${projectRef}-auth-token=${encodeURIComponent(sessionValue)}; path=/; max-age=604800; SameSite=Lax`;
        }
        
        // Para depuración, agregar una cookie con información del usuario
        document.cookie = `go-admin-user-id=${sessionData.session?.user?.id || ''}; path=/; max-age=604800; SameSite=Lax`;
        
        // Registrar en consola para depuración
        console.log('Sesión establecida correctamente', sessionData.session.user?.email);
        console.log('Auth cookie configurada:', `sb-${projectRef}-auth-token`);
        console.log('Expiración de sesión:', new Date((sessionData.session.expires_at || 0) * 1000).toLocaleString());
        
        // Para una implementación completa, se recomienda usar una API del servidor para establecer cookies HTTP-only
        // Ejemplo: await fetch('/api/auth/set-session', { credentials: 'include' });
      }
      
      setTimeout(() => {
        try {
          if (sessionData.session) {
            if (redirectTo) {
              sessionStorage.removeItem('redirectTo');
              window.location.replace(redirectTo);
            } else {
              // Redirect to dashboard on successful login
              window.location.replace('/app/inicio');
            }
          } else {
            console.error('No se pudo establecer la sesión correctamente');
            alert('Error al establecer la sesión. Por favor, intenta nuevamente.');
          }
        } catch (redirectError) {
          console.error('Error al redireccionar:', redirectError);
          alert('Error al redireccionar. Por favor, intenta nuevamente.');
        }
      }, 1000);
    });
  });
};
