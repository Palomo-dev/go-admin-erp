import { supabase } from '@/lib/supabase/config';

// Define Organization type
export interface Organization {
  id: number;
  name: string;
  type_id: {
    name: string;
  };
  role_id?: number;
}

export interface SelectOrganizationParams {
  organization: Organization;
  email: string;
  setShowOrgPopup: (show: boolean) => void;
  proceedWithLogin: (data: any) => void;
}

export const selectOrganizationFromPopup = async ({
  organization,
  email,
  setShowOrgPopup,
  proceedWithLogin
}: SelectOrganizationParams) => {

    setShowOrgPopup(false);
  
  // Get user profile for the selected organization
  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', email)
    .eq('organization_id', organization.id)
    .single();
  
  // Save organization info to localStorage
  localStorage.setItem('currentOrganizationId', organization.id.toString());
  localStorage.setItem('currentOrganizationName', organization.name);
  localStorage.setItem('userRole', profileData?.role || 'user');
  
  // Continue with login process
  const { data } = await supabase.auth.getSession();
  proceedWithLogin(data);
};

export const proceedWithLogin = (data: any, rememberMe: boolean = false, email: string = '') => {
  // Set remember me preference in local storage if checked
  if (rememberMe) {
    localStorage.setItem('rememberMe', 'true');
    localStorage.setItem('userEmail', email);
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
      // Guardar token de sesión en localStorage manualmente para garantizar disponibilidad
      if (sessionData.session) {
        localStorage.setItem('supabase.auth.token', JSON.stringify({
          access_token: sessionData.session.access_token,
          refresh_token: sessionData.session.refresh_token,
          expires_at: sessionData.session.expires_at
        }));
      }
      
      // Establecer una cookie para ayudar al middleware a detectar la sesión
      document.cookie = `sb-auth-token=${sessionData.session?.access_token || ''}; path=/; max-age=3600; SameSite=Lax`;
      
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
