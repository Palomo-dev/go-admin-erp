import { createClient, type Provider } from '@supabase/supabase-js'

// Extrae la referencia del proyecto de la URL de Supabase
export const getProjectRef = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  return supabaseUrl.split('.')[0].replace('https://', '');
}

// Función para obtener el valor de una cookie
const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [cookieName, cookieValue] = cookie.trim().split('=');
    if (cookieName === name) {
      return decodeURIComponent(cookieValue);
    }
  }
  return null;
}

// Función para establecer una cookie
const setCookie = (name: string, value: string, maxAge: number = 604800) => {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${maxAge};SameSite=Strict${process.env.NODE_ENV === 'production' ? ';Secure' : ''}`;
}

// Función para eliminar una cookie
const removeCookie = (name: string) => {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=;path=/;expires=Thu, 01 Jan 1970 00:00:01 GMT;SameSite=Strict${process.env.NODE_ENV === 'production' ? ';Secure' : ''}`;
}

// Creación del cliente de Supabase
export const createSupabaseClient = () => {
  // Verificamos que existan las variables de entorno necesarias
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials')
  }
  
  const projectRef = getProjectRef();
  const storageKey = projectRef ? `sb-${projectRef}-auth-token` : 'sb-auth-token';
  
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: true, // Permitimos renovación automática con la configuración optimizada
      persistSession: true,
      detectSessionInUrl: true,
      storage: {
        getItem: (key: string) => {
          return getCookie(key);
        },
        setItem: (key: string, value: string) => {
          setCookie(key, value, 86400); // 24 horas para todos los tokens
          // Eliminamos cualquier token del localStorage para mantener la seguridad
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(key);
          }
        },
        removeItem: (key: string) => {
          removeCookie(key);
          // Eliminamos cualquier token del localStorage para mantener la seguridad
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(key);
          }
        }
      }
    },
    global: {
      headers: {
        'x-application-name': 'GoAdminERP'
      },
      // Configurar reintentos con backoff exponencial para manejar límites de solicitudes (429)
      fetch: (url: string | URL | Request, options?: RequestInit) => {
        const MAX_RETRIES = 3;
        const BASE_DELAY = 1000; // 1 segundo
        
        return new Promise((resolve, reject) => {
          const attemptFetch = async (retriesLeft: number, delay: number) => {
            try {
              const response = await fetch(url, options);
              
              // Si recibimos un 429 (Too Many Requests) y aún tenemos reintentos
              if (response.status === 429 && retriesLeft > 0) {
                console.log(`Límite de solicitudes alcanzado, reintentando en ${delay}ms (${retriesLeft} intentos restantes)`);
                
                // Esperar antes de reintentar con backoff exponencial
                await new Promise(res => setTimeout(res, delay));
                return attemptFetch(retriesLeft - 1, delay * 2);
              }
              
              resolve(response);
            } catch (error) {
              if (retriesLeft > 0) {
                console.log(`Error en solicitud, reintentando en ${delay}ms (${retriesLeft} intentos restantes)`);
                await new Promise(res => setTimeout(res, delay));
                return attemptFetch(retriesLeft - 1, delay * 2);
              }
              reject(error);
            }
          };
          
          attemptFetch(MAX_RETRIES, BASE_DELAY);
        });
      }
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
  // Eliminar todas las cookies  // Extraer referencia del proyecto dinámicamente desde la URL de Supabase
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? process.env.NEXT_PUBLIC_SUPABASE_URL.split('.')[0].replace('https://', '')
    : '';
    
  // Limpiar cookies de autenticación
  document.cookie = 'go-admin-erp-session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
  document.cookie = 'sb-auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
  document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
  document.cookie = 'sb-refresh-token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
  
  // Limpiar cookie específica del proyecto usando la referencia dinámica
  if (projectRef) {
    document.cookie = `sb-${projectRef}-auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax`;
  }
  
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

export const getUserOrganization = async (userId: string, requestedOrgId?: string) => {
  try {
    if (!userId) {
      console.error('Error: Se requiere un ID de usuario válido');
      return { organization: null, role: null, error: 'Se requiere un ID de usuario válido', branches: [] };
    }
    
    // Obtenemos todas las membresías activas del usuario desde organization_members
    const { data: allMemberData, error: memberError } = await supabase
      .from('organization_members')
      .select('id, organization_id, role, role_id, is_active')
      .eq('user_id', userId)
      .eq('is_active', true);
      
    // Verificamos si hay error en la consulta
    if (memberError) {
      console.error('Error obteniendo datos de membresías:', memberError);
      return { organization: null, role: null, error: memberError?.message || 'Error al consultar las membresías', branches: [] };
    }
    
    // Si no hay datos de membresía, devolver información clara
    if (!allMemberData || allMemberData.length === 0) {
      console.log('No se encontró membresía activa para el usuario:', userId);
      return { 
        organization: null, 
        role: null, 
        error: 'No se encontró membresía activa para este usuario', 
        branches: [],
        needsOrganization: true // Flag para indicar que el usuario necesita ser asignado a una organización
      };
    }
    
    // Seleccionamos la membresía a utilizar: si se especificó un ID, usamos esa, si no, la primera
    let memberData;
    
    // Si hay un ID de organización solicitado, buscamos esa membresía
    if (requestedOrgId) {
      memberData = allMemberData.find(m => m.organization_id === requestedOrgId);
      if (!memberData) {
        return { 
          organization: null, 
          role: null, 
          error: 'No tiene acceso a la organización solicitada',
          branches: [],
          availableOrganizations: allMemberData.map(m => m.organization_id)
        };
      }
    } else {
      // Si no hay organización solicitada, tomamos la primera
      memberData = allMemberData[0];
    }
    
    // Ya manejamos los errores y verificación de existencia de membresías arriba
    
    // Si tenemos la organización, continuamos
    const organizationId = memberData.organization_id;
    
    // Inicializamos variables para el rol
    let userRoleName = null;
    
    // Obtenemos el rol del usuario en la organización usando role_id de organization_members
    if (memberData.role_id) {
      const { data: roleFromId, error: roleFromIdError } = await supabase
        .from('roles')
        .select('id, name, description')
        .eq('id', memberData.role_id)
        .maybeSingle();
      
      if (!roleFromIdError && roleFromId) {
        userRoleName = roleFromId.name;
      } else if (roleFromIdError) {
        console.error('Error obteniendo rol desde role_id:', roleFromIdError);
      }
    }
    
    // Ahora obtenemos la información de la organización
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, status, type_id, organization_types!fk_organizations_organization_type(name)')
      .eq('id', organizationId)
      .maybeSingle(); // Usar maybeSingle para manejo seguro
    
    if (orgError) {
      console.error('Error consultando organización:', orgError);
      return { organization: null, role: null, error: orgError?.message || 'Error al consultar la organización', branches: [] };
    }
    
    // Si no se encuentra la organización
    if (!orgData) {
      console.log(`Organización no encontrada. ID: ${organizationId}`);
      return { 
        organization: null, 
        role: null, 
        error: 'La organización asignada no existe o fue eliminada', 
        branches: [],
        invalidOrganization: true
      };
    }
    
    // Obtenemos las sucursales
    const { data: branchData, error: branchesError } = await supabase
      .from('branches')
      .select('id, name, address, city, state, country, latitude, longitude, is_main, branch_code')
      .eq('organization_id', organizationId)
      .eq('is_active', true);
    
    if (branchesError) {
      console.error('Error obteniendo sucursales:', branchesError);
      // Continuamos a pesar del error
    }
    
    // Aseguramos que branches siempre sea un array
    const branchesData = branchData || [];
    
    // Determinamos la sucursal predeterminada
    let defaultBranchId = null;
    
    if (branchesData.length > 0) {
      defaultBranchId = branchesData[0].id;
    } else {
      console.log(`La organización ${orgData.id} no tiene sucursales activas`);
    }
    
    // Si aún no tenemos un rol, intentamos obtenerlo de user_roles
    if (!userRoleName) {
      try {
        const { data: userRoleData, error: userRoleError } = await supabase
          .from('user_roles')
          .select('roles(name)')
          .eq('user_id', userId)
          .maybeSingle();
        
        if (!userRoleError && userRoleData) {
          // Utilizamos type assertion para manejar la estructura de datos
          // ya que la respuesta puede variar dependiendo del query
          const roleData = userRoleData as any;
          if (roleData && roleData.roles) {
            if (Array.isArray(roleData.roles)) {
              // Verificamos que exista al menos un elemento y que tenga la propiedad name
              if (roleData.roles.length > 0 && roleData.roles[0] && 'name' in roleData.roles[0]) {
                userRoleName = roleData.roles[0].name;
              }
            } else if (roleData.roles && typeof roleData.roles === 'object') {
              // Verificamos explícitamente que el objeto tenga la propiedad name
              if ('name' in roleData.roles) {
                userRoleName = roleData.roles.name;
              }
            }
          }
        } else if (userRoleError) {
          console.error('Error obteniendo rol del usuario:', userRoleError);
        }
      } catch (roleErr) {
        console.error('Error inesperado al obtener rol:', roleErr);
      }
    }
    
    // Como último recurso, usamos el rol almacenado en memberData si existe
    if (!userRoleName && memberData.role) {
      userRoleName = memberData.role;
    }
    
    return { 
      organization: {
        id: orgData.id,
        name: orgData.name,
        status: orgData.status,
        type_id: orgData.type_id,
        organization_type: orgData.organization_types && orgData.organization_types.length > 0 ? orgData.organization_types[0].name : null,
        branch_id: defaultBranchId // Añadimos la sucursal predeterminada para compatibilidad
      },
      branch_id: defaultBranchId, // También lo dejamos en la raíz para el nuevo código
      branches: branchesData,
      role: userRoleName,
      hasBranches: branchesData.length > 0
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
// Obtener organizaciones disponibles
export const getOrganizations = async () => {
  const { data, error } = await supabase
    .from('organizations')
    .select(`
      id, 
      name, 
      status, 
      logo_url,
      type_id (
        id, 
        name
      ),
      plan_id (
        id,
        name
      )
    `)
    .order('name');

  console.log("data", data);
  
  if (error) {
    console.error('Error al obtener organizaciones:', error);
    return [];
  }
  
  // Return organizations without plan information if plans couldn't be fetched
  return data?.map(org => ({
    id: org.id,
    name: org.name,
    status: org.status,
    logo_url: org.logo_url,
    type_id: org.type_id,
    plan_id: org.plan_id
  })) || [];
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