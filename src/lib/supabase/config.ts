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
  try {
    if (!userId) {
      console.error('Error: Se requiere un ID de usuario válido');
      return { organization: null, role: null, error: 'Se requiere un ID de usuario válido', branches: [] };
    }
    
    // Primero obtenemos el perfil del usuario con su organization_id
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id, branch_id')
      .eq('id', userId)
      .maybeSingle(); // Usar maybeSingle en lugar de single para evitar errores
    
    if (profileError) {
      console.error('Error obteniendo perfil de usuario:', profileError);
      return { organization: null, role: null, error: profileError?.message || 'Error al consultar el perfil', branches: [] };
    }
    
    // Si no hay datos de perfil, devolver información clara
    if (!profileData) {
      console.log('No se encontró perfil para el usuario:', userId);
      return { 
        organization: null, 
        role: null, 
        error: 'No se encontró perfil para este usuario', 
        branches: [],
        needsProfile: true // Flag para indicar que el usuario necesita crear un perfil
      };
    }
    
    // Si no hay organization_id, devolver información específica
    if (!profileData.organization_id) {
      console.log('El usuario no tiene organización asignada:', userId);
      return { 
        organization: null, 
        role: null, 
        error: 'Usuario sin organización asignada', 
        branches: [],
        needsOrganization: true // Flag para indicar que el usuario necesita seleccionar organización
      };
    }
    
    // Ahora obtenemos la información de la organización
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, status, types')
      .eq('id', profileData.organization_id)
      .maybeSingle(); // Usar maybeSingle para manejo seguro
    
    if (orgError) {
      console.error('Error consultando organización:', orgError);
      return { organization: null, role: null, error: orgError?.message || 'Error al consultar la organización', branches: [] };
    }
    
    // Si no se encuentra la organización
    if (!orgData) {
      console.log(`Organización no encontrada. ID: ${profileData.organization_id}`);
      return { 
        organization: null, 
        role: null, 
        error: 'La organización asignada no existe o fue eliminada', 
        branches: [],
        invalidOrganization: true
      };
    }
    
    // Obtenemos todas las sucursales de la organización
    const { data: branchesData, error: branchesError } = await supabase
      .from('branches')
      .select('*')
      .eq('organization_id', orgData.id)
      .eq('is_active', true);
    
    if (branchesError) {
      console.error('Error obteniendo sucursales:', branchesError);
      // Continuamos a pesar del error, con branchesData como array vacío
    }
    
    const branches = branchesData || [];
    
    // Determinamos la sucursal activa del usuario
    let activeBranchId = profileData.branch_id;
    
    // Si el usuario no tiene sucursal asignada, usamos la principal
    if (!activeBranchId && branches.length > 0) {
      const mainBranch = branches.find(branch => branch.is_main === true);
      activeBranchId = mainBranch ? mainBranch.id : branches[0].id;
    }
    
    // Si no hay sucursales disponibles
    if (branches.length === 0) {
      console.log(`La organización ${orgData.id} no tiene sucursales activas`);
    }
    
    // Obtenemos el rol del usuario - si falla, no bloqueamos el flujo
    let roleData = null;
    try {
      const { data: roleResult, error: roleError } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (!roleError && roleResult) {
        roleData = roleResult;
      } else if (roleError) {
        console.error('Error obteniendo rol del usuario:', roleError);
      }
    } catch (roleErr) {
      console.error('Error inesperado al obtener rol:', roleErr);
    }
    
    // Extraer el nombre del rol de manera segura
    let roleName = null;
    if (roleData && roleData.roles) {
      // Manejar tanto si roles es un objeto como si es un array
      if (Array.isArray(roleData.roles)) {
        roleName = roleData.roles.length > 0 ? roleData.roles[0].name : null;
      } else if (roleData.roles && typeof roleData.roles === 'object') {
        // Verificar que roles es un objeto y que tiene la propiedad name
        roleName = roleData.roles.name || null;
      }
    }
    
    return { 
      organization: {
        id: orgData.id,
        name: orgData.name,
        status: orgData.status,
        types: orgData.types,
        branch_id: activeBranchId // Mantenemos branch_id dentro de organization para compatibilidad
      },
      branch_id: activeBranchId, // También lo dejamos en la raíz para el nuevo código
      branches,
      role: roleName,
      hasBranches: branches.length > 0
    };
  } catch (error) {
    console.error('Error general obteniendo organización:', error);
    return { 
      organization: null, 
      role: null, 
      error: 'Error inesperado al obtener datos de organización',
      branches: [],
      unexpectedError: true
    };
  }
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
  // Check if email already exists
  console.log('Verificando correo electrónico...');
  console.log('Email:', email); 
  const { data: existingUsers } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existingUsers) {
    return {
      data: { user: null },
      error: { message: 'Este correo electrónico ya está registrado' }
    };
  }

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
      organizations(name)
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

  // Handle organization data safely
  if (data.organizations) {
    // Supabase returns this as an object with name property
    const org = data.organizations as unknown;
    if (org && typeof org === 'object' && 'name' in org) {
      organizationName = (org as {name: string}).name || '';
    }
  }

  // Handle roles data safely
  if (data.roles) {
    // Supabase returns this as an object with name property
    const role = data.roles as unknown;
    if (role && typeof role === 'object' && 'name' in role) {
      roleName = (role as {name: string}).name || '';
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

    // Obtenemos información de la sucursal principal
    const { data: branchData } = await supabase
      .from('branches')
      .select('id')
      .eq('organization_id', inviteData.organization_id)
      .eq('is_main', true)
      .single();

    const branchId = branchData?.id || null;

    // Agregamos el usuario a la tabla profiles con todos los campos requeridos
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: authData.user.id,
        email: inviteData.email,
        first_name: userData.firstName || userData.first_name,
        last_name: userData.lastName || userData.last_name,
        phone: userData.phoneNumber || userData.phone,
        organization_id: inviteData.organization_id,
        role_id: inviteData.role_id,
        branch_id: branchId,
        status: 'active',
        is_owner: false,
        metadata: {},
        preferred_language: 'es',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    
    if (profileError) {
      console.error('Error al crear perfil:', profileError);
      return { error: profileError };
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
      console.error('Error al actualizar invitación:', updateInviteError);
      return { error: updateInviteError };
    }
    
    return { data: authData, error: null };
  } catch (error: any) {
    console.error('Error en acceptInvitation:', error);
    return { 
      data: null, 
      error: { 
        message: error.message || 'Error al aceptar la invitación' 
      } 
    };
  }
}