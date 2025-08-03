import { signInWithGoogle } from '@/lib/supabase/config';
import { supabase } from '@/lib/supabase/config';
import { registerUserDevice } from '@/lib/auth/organizationAuth';

export interface GoogleLoginParams {
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export interface GoogleUser {
  id: string;
  email: string;
  user_metadata: {
    full_name?: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
    picture?: string;
  };
}

// Función para extraer nombres del usuario de Google
export const extractGoogleUserNames = (user: GoogleUser) => {
  const metadata = user.user_metadata;
  
  // Intentar obtener first_name y last_name directamente
  if (metadata.first_name && metadata.last_name) {
    return {
      firstName: metadata.first_name,
      lastName: metadata.last_name
    };
  }
  
  // Si no están disponibles, intentar dividir full_name
  if (metadata.full_name) {
    const nameParts = metadata.full_name.trim().split(' ');
    return {
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || ''
    };
  }
  
  // Fallback: usar email como base
  const emailName = user.email.split('@')[0];
  return {
    firstName: emailName,
    lastName: ''
  };
};

// Función para verificar si el usuario necesita completar su perfil
export const checkGoogleUserProfile = async (userId: string) => {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, last_org_id')
      .eq('id', userId)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    
    return {
      exists: !!profile,
      needsCompletion: !profile || !profile.first_name || !profile.last_name,
      profile
    };
  } catch (error) {
    console.error('Error checking Google user profile:', error);
    return {
      exists: false,
      needsCompletion: true,
      profile: null
    };
  }
};

// Función para crear perfil de usuario de Google
export const createGoogleUserProfile = async (user: GoogleUser) => {
  try {
    const { firstName, lastName } = extractGoogleUserNames(user);
    const avatarUrl = user.user_metadata.avatar_url || user.user_metadata.picture;
    
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        email: user.email,
        first_name: firstName,
        last_name: lastName,
        avatar_url: avatarUrl,
        status: 'active'
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return { data, error: null };
  } catch (error) {
    console.error('Error creating Google user profile:', error);
    return { data: null, error };
  }
};

// Función principal para manejar login con Google
export const handleGoogleLogin = async ({
  setLoading,
  setError
}: GoogleLoginParams) => {
  setLoading(true);
  setError(null);
  
  try {
    // Guardar la URL actual para redirección después del login
    const currentUrl = window.location.href;
    const redirectTo = currentUrl.includes('/auth/login') 
      ? `${window.location.origin}/auth/callback?next=/app/inicio`
      : `${window.location.origin}/auth/callback?next=${encodeURIComponent(currentUrl)}`;

    console.log('Redirect to:', redirectTo);
    
    // Iniciar flujo OAuth con Google
    const { error } = await signInWithGoogle();
    if (error) {
      throw error;
    }
    
    // El redirect sucede automáticamente via OAuth
    // El callback manejará el resto del flujo
    
  } catch (err: any) {
    console.error('Google login error:', err);
    setError(err.message || 'Error al iniciar sesión con Google');
    setLoading(false);
  }
};

// Función para manejar el callback de Google OAuth
export const handleGoogleCallback = async (user: GoogleUser) => {
  try {
    // Verificar si el usuario ya tiene un perfil
    const profileCheck = await checkGoogleUserProfile(user.id);
    
    // Si no existe el perfil, crearlo
    if (!profileCheck.exists) {
      const createResult = await createGoogleUserProfile(user);
      if (createResult.error) {
        throw createResult.error;
      }
    }
    
    // Registrar el dispositivo del usuario
    try {
      await registerUserDevice(user.id);
    } catch (deviceError) {
      console.warn('Error registering device for Google user:', deviceError);
      // No fallar el login por error de dispositivo
    }
    
    return {
      success: true,
      needsOrganization: !profileCheck.profile?.last_org_id,
      profile: profileCheck.profile
    };
    
  } catch (error) {
    console.error('Error in Google callback handling:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error procesando login con Google'
    };
  }
};
