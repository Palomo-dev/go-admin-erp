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
}

export const handleEmailLogin = async ({
  email,
  password,
  rememberMe,
  setLoading,
  setError,
  setUserOrganizations,
  setShowOrgPopup,
  proceedWithLogin
}: EmailLoginParams) => {
  setLoading(true);
  setError(null);

  try {
    const { data, error } = await signInWithEmail(email, password);
    
    if (error) {
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
    if (organizations.length > 1) {
      setUserOrganizations(organizations);
      setShowOrgPopup(true);
      setLoading(false);
      return;
    }
    
    // If user has exactly one organization, automatically select it
    if (organizations.length === 1) {
      const organization = organizations[0];
      
      // Save organization info to localStorage
      localStorage.setItem('currentOrganizationId', organization.id.toString());
      localStorage.setItem('currentOrganizationName', organization.name);
      
      // Get the main branch for this organization
      const { data: branchData, error: branchError } = await supabase
        .from('branches')
        .select('id, name')
        .eq('organization_id', organization.id)
        .eq('is_main', true)
        .single();
      
      if (!branchError && branchData) {
        // Save branch info to localStorage
        localStorage.setItem('currentBranchId', branchData.id.toString());
        localStorage.setItem('currentBranchName', branchData.name);
        console.log('Automatically selected branch:', branchData.name);
      } else {
        console.error('Error fetching main branch:', branchError);
      }
      
      console.log('Automatically selected organization:', organization.name);
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
