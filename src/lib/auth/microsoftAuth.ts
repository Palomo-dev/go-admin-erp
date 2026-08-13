import { signInWithMicrosoft } from '@/lib/supabase/config';
import { isMobile } from '@/lib/utils/mobile';
import { startMobileOAuth } from '@/lib/services/mobileAuthService';

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
    // Flujo móvil (Capacitor): OAuth con deep link via browser externo
    if (isMobile()) {
      const url = await startMobileOAuth('azure');
      if (!url) {
        throw new Error('No se pudo iniciar OAuth con Microsoft en la app móvil');
      }
      // El resultado llega via deep link listener (useMobileAuth)
      return;
    }

    const { error } = await signInWithMicrosoft();
    if (error) throw error;
    // Redirect happens automatically via OAuth
  } catch (err: any) {
    setError(err.message || 'Error al iniciar sesión con Microsoft');
    setLoading(false);
  }
};
