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

export const signOut = async () => {
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