import { signInWithGoogle } from '@/lib/supabase/config';

export interface GoogleLoginParams {
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const handleGoogleLogin = async ({
  setLoading,
  setError
}: GoogleLoginParams) => {
  setLoading(true);
  setError(null);
  
  try {
    const { error } = await signInWithGoogle();
    if (error) throw error;
    // Redirect happens automatically via OAuth
  } catch (err: any) {
    setError(err.message || 'Error al iniciar sesión con Google');
    setLoading(false);
  }
};
