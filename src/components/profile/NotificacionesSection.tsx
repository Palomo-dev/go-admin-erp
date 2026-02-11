'use client';

import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { Bell, Moon, Clock, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { PreferenciasService } from '@/components/notificaciones/preferencias/PreferenciasService';
import type { UserNotificationPreference } from '@/components/notificaciones/preferencias/types';

interface NotificacionesSectionProps {
  user: User | null;
  preferences?: any;
  onPreferencesUpdated?: (preferences: any) => void;
}

export default function NotificacionesSection({ 
  user, 
}: NotificacionesSectionProps) {
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [dndEnabled, setDndEnabled] = useState(false);
  const [dndStart, setDndStart] = useState('22:00');
  const [dndEnd, setDndEnd] = useState('08:00');

  // Cargar preferencias reales desde la tabla user_notification_preferences
  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      setInitialLoading(true);
      try {
        const prefs = await PreferenciasService.ensureAllChannels(user.id);
        const find = (ch: string) => prefs.find(p => p.channel === ch);
        setEmailEnabled(!find('email')?.mute);
        setPushEnabled(!find('push')?.mute);
        setWhatsappEnabled(!find('whatsapp')?.mute);
        // DND: tomar del primer canal que tenga valores
        const withDnd = prefs.find(p => p.dnd_start && p.dnd_end);
        if (withDnd) {
          setDndEnabled(true);
          setDndStart(withDnd.dnd_start || '22:00');
          setDndEnd(withDnd.dnd_end || '08:00');
        }
      } catch (e) {
        console.error('Error cargando preferencias:', e);
      } finally {
        setInitialLoading(false);
      }
    };
    load();
  }, [user?.id]);
  
  // Convierte horarios de 24 horas a formato 12 horas para mostrar
  const formatTime12h = (time24h: string) => {
    if (!time24h) return '';
    
    const [hours, minutes] = time24h.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const handleSavePreferences = async () => {
    if (!user) {
      toast.error('No hay un usuario autenticado');
      return;
    }
    
    setLoading(true);
    
    try {
      // Actualizar mute por canal
      await Promise.all([
        PreferenciasService.updatePreference(user.id, 'email', { mute: !emailEnabled }),
        PreferenciasService.updatePreference(user.id, 'push', { mute: !pushEnabled }),
        PreferenciasService.updatePreference(user.id, 'whatsapp', { mute: !whatsappEnabled }),
      ]);

      // Actualizar DND global
      await PreferenciasService.setGlobalDND(
        user.id,
        dndEnabled ? dndStart : null,
        dndEnabled ? dndEnd : null,
      );

      toast.success('Preferencias de notificación actualizadas correctamente');
    } catch (error) {
      console.error('Error al guardar preferencias de notificación:', error);
      toast.error('Error al guardar las preferencias de notificación');
    } finally {
      setLoading(false);
    }
  };

  // Toggle para opciones booleanas
  const Toggle = ({ 
    checked, 
    onChange, 
    disabled = false 
  }: { 
    checked: boolean; 
    onChange: (val: boolean) => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      className={`${
        checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
      } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <span
        className={`${
          checked ? 'translate-x-6' : 'translate-x-1'
        } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
      />
    </button>
  );

  if (initialLoading) {
    return (
      <div>
        <div className="mb-6">
          <div className="h-7 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
          <div className="h-4 w-96 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>
        <div className="space-y-6">
          <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-4" />
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between py-3">
                <div>
                  <div className="h-4 w-36 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1" />
                  <div className="h-3 w-56 bg-gray-100 dark:bg-gray-700/50 rounded animate-pulse" />
                </div>
                <div className="h-6 w-11 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
          Preferencias de notificación
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Configure cómo y cuándo desea recibir notificaciones de la plataforma
        </p>
      </div>

      <div className="space-y-6">
        {/* Canales de notificación */}
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800/50">
          <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-4 flex items-center">
            <Bell className="w-5 h-5 mr-2 text-gray-500 dark:text-gray-400" />
            Canales de notificación
          </h3>
          
          <div className="space-y-4">
            {/* Email */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-700 dark:text-gray-300">Correo electrónico</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Recibir notificaciones por correo electrónico
                </p>
              </div>
              <Toggle checked={emailEnabled} onChange={setEmailEnabled} />
            </div>
            
            {/* Push */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-700 dark:text-gray-300">Notificaciones push</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Notificaciones en el navegador o aplicación
                </p>
              </div>
              <Toggle checked={pushEnabled} onChange={setPushEnabled} />
            </div>
            
            {/* WhatsApp */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-700 dark:text-gray-300">WhatsApp</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Recibir notificaciones importantes por WhatsApp
                </p>
              </div>
              <Toggle checked={whatsappEnabled} onChange={setWhatsappEnabled} />
            </div>
          </div>
        </div>
        
        {/* Modo No molestar */}
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800/50">
          <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-4 flex items-center">
            <Moon className="w-5 h-5 mr-2 text-gray-500 dark:text-gray-400" />
            Modo No molestar
          </h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-gray-700 dark:text-gray-300">Activar modo No molestar</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Pausar notificaciones durante horarios específicos
                </p>
              </div>
              <Toggle checked={dndEnabled} onChange={setDndEnabled} />
            </div>
            
            {dndEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="dndStart" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Hora de inicio
                  </label>
                  <div className="flex items-center">
                    <Clock className="w-5 h-5 mr-2 text-gray-500 dark:text-gray-400" />
                    <input
                      id="dndStart"
                      type="time"
                      value={dndStart}
                      onChange={(e) => setDndStart(e.target.value)}
                      className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {formatTime12h(dndStart)}
                  </p>
                </div>
                
                <div>
                  <label htmlFor="dndEnd" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Hora de fin
                  </label>
                  <div className="flex items-center">
                    <Clock className="w-5 h-5 mr-2 text-gray-500 dark:text-gray-400" />
                    <input
                      id="dndEnd"
                      type="time"
                      value={dndEnd}
                      onChange={(e) => setDndEnd(e.target.value)}
                      className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {formatTime12h(dndEnd)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Botón Guardar */}
        <div className="flex justify-end">
          <button
            onClick={handleSavePreferences}
            className="flex items-center px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center">
                <span className="animate-spin h-4 w-4 mr-2 border-t-2 border-b-2 border-white rounded-full"></span>
                Guardando...
              </span>
            ) : (
              <>
                <Save size={16} className="mr-1.5" />
                Guardar preferencias
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
