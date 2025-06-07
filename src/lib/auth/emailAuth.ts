import { supabase, signInWithEmail } from '@/lib/supabase/config';

export interface EmailLoginParams {
  email: string;
  password: string;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setUserOrganizations: (orgs: any[]) => void;
  setShowOrgPopup: (show: boolean) => void;
  proceedWithLogin: (data: any) => void;
}

export const handleEmailLogin = async ({
  email,
  password,
  setLoading,
  setError,
  setUserOrganizations,
  setShowOrgPopup,
  proceedWithLogin
}: EmailLoginParams) => {

  setLoading(true);
  setError(null);

  try {
    // Add remember me option to the login
    const { data, error } = await signInWithEmail(email, password);
    
    if (error) {
      // Personalizar mensajes de error para hacerlos más amigables
      if (error.message.includes('Invalid login credentials')) {
        throw new Error('El usuario no existe o las credenciales son incorrectas. Por favor verifica tu email y contraseña.');
      } else if (error.message.includes('Email not confirmed')) {
        throw new Error('Tu cuenta aún no ha sido verificada. Por favor revisa tu correo electrónico y haz clic en el enlace de verificación.');
      } else if (error.message.includes('User not found')) {
        throw new Error('El usuario no existe. ¿Quieres crear una cuenta nueva?');
      } else {
        throw error;
      }
    }
    
    // User authenticated successfully, now check their organizations
    if (data.user) {
      // Obtener el perfil del usuario usando su email
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('role_id, organization_id')
        .eq('email', email);
        
      if (profileError) {
        console.error('Error al obtener perfil:', profileError);
        throw new Error('Error al verificar acceso. Por favor intenta nuevamente.');
      }
      
      if (!profileData || profileData.length === 0) {
        throw new Error('No se encontró un perfil asociado a este usuario.');
      }
      
      // Get all organizations this user belongs to
      const userOrgs = profileData.map(profile => ({
        id: profile.organization_id,
        name: '',
      }));
      
      // If user has organizations, fetch their details
      if (userOrgs.length > 0) {
        const orgIds = userOrgs.map(org => org.id);
        const { data: orgsData, error: orgsError } = await supabase
          .from('organizations')
          .select('id, name')
          .in('id', orgIds);
          
        if (orgsError) {
          console.error('Error al obtener organizaciones del usuario:', orgsError);
          throw new Error('Error al verificar organizaciones. Por favor intenta nuevamente.');
        }
        
        if (orgsData && orgsData.length > 0) {
          
          setUserOrganizations(orgsData);
          
          // If user has only one organization, select it automatically
          if (orgsData.length === 1) {
            const singleOrg = orgsData[0];
            
            // Save organization info to localStorage
            localStorage.setItem('currentOrganizationId', singleOrg.id);
            localStorage.setItem('currentOrganizationName', singleOrg.name);
            localStorage.setItem('userRole', profileData[0].role_id || 'user');
            
            // Continue with login process
            proceedWithLogin(data);
          } else {
            // User has multiple organizations, show popup for selection
            setShowOrgPopup(true);
            setLoading(false);
            return; // Stop here until user selects an organization
          }
        } else {
          throw new Error('No se encontraron organizaciones asociadas a este usuario.');
        }
      } else {
        throw new Error('El usuario no pertenece a ninguna organización.');
      }
    }
  } catch (err: any) {
    setError(err.message || 'Error al iniciar sesión');
    setLoading(false);
  }
};
