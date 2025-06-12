'use client';

import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';
import { Laptop, Smartphone, Globe, Clock, LogOut, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface Session {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  last_sign_in_at: string;
  is_current: boolean;
  user_agent: string;
  ip: string;
  location?: string;
  device_type: string;
}

interface SesionesSectionProps {
  user: User | null;
  initialSessions: Session[];
}

export default function SesionesSection({ user, initialSessions }: SesionesSectionProps) {
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [loading, setLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  // Detecta el tipo de dispositivo basado en user-agent
  const detectDeviceType = (userAgent: string): { type: string; icon: any } => {
    const ua = userAgent.toLowerCase();
    
    if (ua.includes('iphone') || ua.includes('android') && ua.includes('mobile')) {
      return { type: 'Móvil', icon: Smartphone };
    } else if (ua.includes('ipad') || ua.includes('tablet')) {
      return { type: 'Tablet', icon: Smartphone };
    } else {
      return { type: 'Desktop', icon: Laptop };
    }
  };

  // Formatear fecha relativa
  const formatRelativeTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    
    if (diffDay > 30) {
      return new Intl.DateTimeFormat('es', { 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } else if (diffDay > 0) {
      return `hace ${diffDay} ${diffDay === 1 ? 'día' : 'días'}`;
    } else if (diffHour > 0) {
      return `hace ${diffHour} ${diffHour === 1 ? 'hora' : 'horas'}`;
    } else if (diffMin > 0) {
      return `hace ${diffMin} ${diffMin === 1 ? 'minuto' : 'minutos'}`;
    } else {
      return 'hace unos segundos';
    }
  };

  // Cerrar una sesión específica
  const closeSession = async (sessionId: string) => {
    if (!user) return;
    
    setLoading(true);
    
    try {
      // Llamar a la función RPC para revocar la sesión de manera segura
      const { data, error } = await supabase
        .from('user_devices')
        .select('refresh_token_id')
        .eq('id', sessionId)
        .single();
        
      if (error) throw error;
      
      if (data.refresh_token_id) {
        await supabase.rpc('revoke_session', { token_id: data.refresh_token_id });
      }
      
      // Actualizar lista de sesiones
      setSessions(sessions.filter(session => session.id !== sessionId));
      toast.success('Sesión cerrada correctamente');
      setShowConfirmModal(false);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      toast.error('Error al cerrar la sesión');
    } finally {
      setLoading(false);
    }
  };

  // Cerrar todas las sesiones excepto la actual
  const closeAllOtherSessions = async () => {
    if (!user) return;
    
    setLoading(true);
    
    try {
      // Encontrar sesión actual
      const currentSession = sessions.find(session => session.is_current);
      
      if (!currentSession) {
        throw new Error('No se pudo identificar la sesión actual');
      }
      
      // Llamar a la función RPC para revocar otras sesiones
      await supabase.rpc('revoke_other_sessions', { 
        current_session_id: currentSession.id 
      });
      
      // Mantener solo la sesión actual en la lista
      setSessions(sessions.filter(session => session.is_current));
      toast.success('Todas las otras sesiones han sido cerradas');
    } catch (error) {
      console.error('Error al cerrar sesiones:', error);
      toast.error('Error al cerrar las sesiones');
    } finally {
      setLoading(false);
    }
  };

  // Iniciar cierre de sesión con confirmación
  const handleSessionLogout = (sessionId: string) => {
    setSessionToDelete(sessionId);
    setShowConfirmModal(true);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
          Sesiones y dispositivos
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Estas son sus sesiones activas en diferentes dispositivos. Si no reconoce alguna, ciérrela inmediatamente.
        </p>
      </div>

      {/* Lista de sesiones activas */}
      <div className="space-y-4 mb-6">
        {(sessions && sessions.length > 0) ? (
          sessions.map((session) => {
            const device = detectDeviceType(session.user_agent);
            const DeviceIcon = device.icon;
            
            return (
              <div 
                key={session.id} 
                className={`p-4 border ${session.is_current 
                  ? 'border-purple-200 dark:border-purple-900/50 bg-purple-50 dark:bg-purple-900/10' 
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50'
                } rounded-lg`}
              >
                <div className="flex justify-between">
                  <div className="flex items-start">
                    <div className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 mr-3">
                      <DeviceIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                    </div>
                    <div>
                      <div className="flex items-center">
                        <h3 className="font-medium text-gray-800 dark:text-gray-200">
                          {device.type}
                          {session.is_current && (
                            <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                              Actual
                            </span>
                          )}
                        </h3>
                      </div>
                      
                      <div className="mt-1 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center">
                          <Globe className="w-3.5 h-3.5 mr-1.5" />
                          <span>
                            IP: {session.ip}
                            {session.location && ` · ${session.location}`}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <Clock className="w-3.5 h-3.5 mr-1.5" />
                          <span>Último acceso: {formatRelativeTime(session.last_sign_in_at)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {!session.is_current && (
                    <button
                      onClick={() => handleSessionLogout(session.id)}
                      className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                      disabled={loading}
                    >
                      <LogOut className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/30 text-center">
            <p className="text-gray-500 dark:text-gray-400">No hay sesiones activas para mostrar.</p>
          </div>
        )}
      </div>

      {/* Botón para cerrar todas las sesiones */}
      {(sessions && sessions.length > 1) && (
        <div className="flex justify-end">
          <button
            onClick={closeAllOtherSessions}
            className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:bg-red-400"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center">
                <span className="animate-spin h-4 w-4 mr-2 border-t-2 border-b-2 border-white rounded-full"></span>
                Cerrando...
              </span>
            ) : (
              <span className="flex items-center">
                <LogOut className="w-4 h-4 mr-2" />
                Cerrar todas las otras sesiones
              </span>
            )}
          </button>
        </div>
      )}

      {/* Modal de confirmación */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center text-amber-600 dark:text-amber-400 mb-4">
              <AlertCircle className="w-6 h-6 mr-2" />
              <h3 className="text-lg font-semibold">Confirmar cierre de sesión</h3>
            </div>
            
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              ¿Está seguro de que desea cerrar esta sesión? Si no reconoce esta sesión, también debería considerar cambiar su contraseña.
            </p>
            
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                onClick={() => sessionToDelete && closeSession(sessionToDelete)}
                className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:bg-red-400"
                disabled={loading}
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
