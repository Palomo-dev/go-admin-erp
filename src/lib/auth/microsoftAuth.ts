import { signInWithMicrosoft } from '@/lib/supabase/config';

export interface MicrosoftLoginParams {
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const handleMicrosoftLogin = async ({
  setLoading,
  setError
}: MicrosoftLoginParams) => {
  setLoading(true);
  setError(null);
  
  try {
    const { error } = await signInWithMicrosoft();
    if (error) throw error;
    // Redirect happens automatically via OAuth
  } catch (err: any) {
    setError(err.message || 'Error al iniciar sesión con Microsoft');
    setLoading(false);
  }
};
