import { useEffect, useState } from "react";
import { supabase } from "../supabase/config";
import { Session } from "@supabase/supabase-js";

/**
 * Hook personalizado para gestionar la sesión del usuario
 * @returns Objeto con la sesión actual, estado de carga y error si existe
 */
export const useSession = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Obtener la sesión actual al montar el componente
    const fetchSession = async () => {
      try {
        setLoading(true);
        
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          throw error;
        }
        
        setSession(data.session);
      } catch (err) {
        console.error("Error al obtener la sesión:", err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchSession();

    // Suscribirse a cambios en la sesión
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession);
      }
    );

    // Limpieza al desmontar
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  return { session, loading, error };
};
