'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { isAuthenticated } from '@/lib/supabase/auth-manager';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { UserData } from './types';

interface ProfileManagerProps {
  onUserDataChange: (userData: UserData | null) => void;
  onLoadingChange: (loading: boolean) => void;
}

/**
 * Componente ProfileManager - Gestiona la carga y actualización de datos del usuario
 * 
 * Utiliza la configuración centralizada de Supabase y los hooks personalizados
 * para obtener y mantener actualizada la información del perfil de usuario.
 */
export const ProfileManager = ({ onUserDataChange, onLoadingChange }: ProfileManagerProps) => {
  // Cargar datos del usuario actual
  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        onLoadingChange(true);
        
        // Usar el gestor optimizado para verificar autenticación
        const { isAuthenticated: isAuth, session } = await isAuthenticated();
        if (!isAuth || !session?.user) {
          console.log('No hay usuario autenticado');
          onUserDataChange(null);
          return;
        }
        
        const user = session.user;
        
        // Obtener datos del perfil del usuario usando el cliente de Supabase configurado
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
          
        if (profileError) {
          console.error('Error al obtener perfil:', profileError);
          throw profileError;
        }
        
        // Obtener organización activa usando la función existente
        const organizacion = obtenerOrganizacionActiva();
        const organizationId = organizacion.id;
        
        // Si no hay organización, registrar pero continuar
        if (!organizationId) {
          console.log('No se encontró organización activa');
        }
        
        // Obtener datos del rol del usuario con manejo adecuado de errores
        const { data: userRoleData, error: roleError } = await supabase
          .from('organization_members')
          .select('role')
          .eq('user_id', user.id)
          .eq('organization_id', organizationId)
          .single();
          
        if (roleError) {
          console.error('Error al obtener rol:', roleError);
          // Continuar aunque no tengamos el rol
        }
        
        // Actualizar el estado del userData usando el formato definido en types.ts
        onUserDataChange({
          name: profileData?.full_name || `${profileData?.first_name || ''} ${profileData?.last_name || ''}`.trim() || 'Usuario',
          email: user.email || '',
          role: userRoleData?.role || localStorage.getItem('userRole') || 'Usuario',
          avatar: profileData?.avatar_url || user.user_metadata?.avatar_url
        });
      } catch (error) {
        console.error('Error al cargar datos del perfil:', error);
        onUserDataChange(null);
      } finally {
        onLoadingChange(false);
      }
    };
    
    loadUserProfile();
    
    // Configurar un canal de suscripción para escuchar cambios en el perfil
    const profileSubscription = supabase
      .channel('public:profiles')
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          // Verificar si el cambio corresponde al usuario actual
          supabase.auth.getSession().then(({ data }) => {
            const userId = data.session?.user.id;
            if (userId && payload.new && payload.new.id === userId) {
              loadUserProfile();
            }
          });
        }
      )
      .subscribe();
      
    return () => {
      // Limpiar la suscripción cuando el componente se desmonta
      supabase.removeChannel(profileSubscription);
    };
  }, [onUserDataChange, onLoadingChange]);
  
  // Este componente no renderiza nada
  return null;
};

export default ProfileManager;
