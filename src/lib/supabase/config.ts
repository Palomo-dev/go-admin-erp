import { createClient, type Provider } from '@supabase/supabase-js'

// Creación del cliente de Supabase
export const createSupabaseClient = () => {
  // Usamos una URL por defecto para modo desarrollo cuando no hay variables de entorno configuradas
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  // Creamos el cliente con los valores reales o los de demostración
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials')
  }
  
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'go-admin-erp-auth'
    }
  })
}

// Cliente para uso en el lado del cliente
export const supabase = createSupabaseClient()

// Funciones de autenticación
export const signInWithEmail = async (email: string, password: string) => {
  return await supabase.auth.signInWithPassword({
    email,
    password
  })
}

export const signInWithGoogle = async () => {
  return await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`
    }
  })
}

export const signInWithMicrosoft = async () => {
  return await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`
    }
  })
}

export const  signOut = async () => {
  // Eliminar todas las cookies relacionadas con la autenticación
  document.cookie = 'sb-auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
  document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
  document.cookie = 'sb-refresh-token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
  document.cookie = 'go-admin-erp-session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
  document.cookie = 'sb-jgmgphmzusbluqhuqihj-auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
  
  // Limpiar localStorage de tokens relacionados con la autenticación
  localStorage.removeItem('supabase.auth.token');
  localStorage.removeItem('sb-access-token');
  localStorage.removeItem('sb-refresh-token');
  localStorage.removeItem('go-admin-erp-auth');
  
  // Cerrar sesión en Supabase
  return await supabase.auth.signOut()
}

// Get session with simplified response format for components that need the session object directly
export const getSession = async () => {
  const { data, error } = await supabase.auth.getSession()
  return { session: data.session, error }
}

export const getUserProfile = async (userId: string) => {
  return await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
}

export const getUserRole = async (userId: string) => {
  return await supabase
    .from('user_roles')
    .select('roles(name, permissions)')
    .eq('user_id', userId)
    .single()
}

export const getUserOrganization = async (userId: string) => {
  return await supabase
    .from('profiles')
    .select('organizations(id, name, type, status)')
    .eq('id', userId)
    .single()
}

// Obtener todas las organizaciones a las que pertenece un usuario
export const getUserOrganizations = async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('organization_id, organizations(id, name, type, status)')
    .eq('user_id', userId);
  
  if (error) {
    console.error('Error al obtener organizaciones del usuario:', error);
    return [];
  }
  
  // Extraer y formatear las organizaciones
  const orgs = data?.map(item => ({
    id: item.organizations?.id || '',
    name: item.organizations?.name || '',
    type: item.organizations?.type || '',
    status: item.organizations?.status || ''
  })).filter(org => org.id) || [];
  
  return orgs;
}

export const getBranches = async (organizationId: string) => {
  return await supabase
    .from('branches')
    .select('*')
    .eq('organization_id', organizationId)
}

export const resetPassword = async (email: string) => {
  return await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  })
}

export const updatePassword = async (newPassword: string) => {
  return await supabase.auth.updateUser({
    password: newPassword
  })
}

// Obtener organizaciones disponibles
export const getOrganizations = async () => {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, status')
    .order('name');
  
  if (error) {
    console.error('Error al obtener organizaciones:', error);
    return [];
  }
  
  return data || [];
};

// Función específica para registro con manejo mejorado de verificación
export const signUpWithEmail = async (email: string, password: string, userData: any, redirectUrl: string) => {
  const response = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: userData,
      emailRedirectTo: redirectUrl,
    },
  });
  
  // Si la respuesta es exitosa pero no hay confirmación de envío de correo,
  // intentamos enviar manualmente un correo de verificación
  if (!response.error && response.data.user && 
      !response.data.user.email_confirmed_at && 
      !response.data.user.confirmation_sent_at) {
    
    console.log('Intentando enviar correo de verificación manualmente...');
    
    // Intentar enviar el correo de verificación manualmente
    const resendResponse = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: redirectUrl,
      }
    });
    
    if (resendResponse.error) {
      console.error('Error al reenviar correo de verificación:', resendResponse.error);
    } else {
      console.log('Correo de verificación enviado manualmente con éxito');
    }
  }
  
  return response;
}

// Definir tipos para los datos de invitación
type InviteData = {
  id: string;
  email: string;
  organization_id: string;
  organizations: { name: string } | null;
  branch_id: string;
  role_id: string;
  roles: { name: string } | null;
  created_at: string;
  expires_at: string | null;
  used: boolean;
};

// Función para validar invitaciones
export const validateInvitation = async (inviteCode: string) => {
  const { data, error } = await supabase
    .from('invitations')
    .select(`
      id,
      email,
      code,
      role_id,
      organization_id,
      created_at,
      expires_at,
      used_at,
      status,
      roles(name),
      organizations(name, type)
    `)
    .eq('code', inviteCode)
    .single();

  if (error) return { data: null, error };

  // Check if invitation is already used, revoked, or expired
  if (data.status === 'used') {
    return { data: null, error: { message: 'La invitación ya ha sido utilizada' } };
  }

  if (data.status === 'revoked') {
    return { data: null, error: { message: 'La invitación ha sido revocada' } };
  }

  const expired = data.expires_at ? new Date(data.expires_at) < new Date() : false;
  if (expired) {
    return { data: null, error: { message: 'La invitación ha expirado' } };
  }

  // Extract data safely from potentially nested objects or arrays
  let organizationName = '';
  let roleName = '';

  if (data.organizations) {
    if (Array.isArray(data.organizations) && data.organizations.length > 0) {
      organizationName = data.organizations[0].name || '';
    } else if (typeof data.organizations === 'object') {
      organizationName = data.organizations.name || '';
    }
  }

  if (data.roles) {
    if (Array.isArray(data.roles) && data.roles.length > 0) {
      roleName = data.roles[0].name || '';
    } else if (typeof data.roles === 'object') {
      roleName = data.roles.name || '';
    }
  }

  // Format the data for response
  const formattedData = {
    id: data.id,
    code: data.code,
    email: data.email,
    organization_id: data.organization_id,
    organization_name: organizationName,
    role_id: data.role_id,
    role_name: roleName,
    created_at: data.created_at,
    expires_at: data.expires_at
  };

  return { data: formattedData, error: null };
}

// Función para aceptar invitaciones
export const acceptInvitation = async ({ 
  inviteCode, 
  password, 
  userData 
}: { 
  inviteCode: string; 
  password: string; 
  userData: any 
}) => {
  // Validamos la invitación
  const { data: inviteData, error: validateError } = 
    await validateInvitation(inviteCode);
  
  if (validateError) {
    return { error: validateError };
  }

  try {
    // Creamos el usuario
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: inviteData.email,
      password,
      options: {
        data: userData
      }
    });
  
    if (signUpError) {
      return { error: signUpError };
    }

    if (!authData || !authData.user) {
      return { error: { message: 'No se pudo crear el usuario' } };
    }

    // Agregamos el usuario a la tabla profiles
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: authData.user.id,
        email: inviteData.email,
        first_name: userData.firstName || userData.first_name,
        last_name: userData.lastName || userData.last_name,
        organization_id: inviteData.organization_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    
    if (profileError) {
      return { error: profileError };
    }

    // Agregamos el miembro a la organización
    const { error: memberError } = await supabase
      .from('organization_members')
      .upsert({
        user_id: authData.user.id,
        organization_id: inviteData.organization_id,
        role: inviteData.role_name, // Usamos el nombre del rol directamente
        is_active: true,
        created_at: new Date().toISOString()
      });
    
    if (memberError) {
      return { error: memberError };
    }

    // Marcamos la invitación como utilizada
    const { error: updateInviteError } = await supabase
      .from('invitations')
      .update({ 
        status: 'used', 
        used_at: new Date().toISOString() 
      })
      .eq('code', inviteCode);
    
    if (updateInviteError) {
      return { error: updateInviteError };
    }
    
    return { data: authData, error: null };
  } catch (error: any) {
    return { 
      data: null, 
      error: { 
        message: error.message || 'Error al aceptar la invitación' 
      } 
    };
  }
}