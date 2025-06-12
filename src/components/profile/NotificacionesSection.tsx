'use client';

import { useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';
import { Bell, Moon, Clock, Save } from 'lucide-react';
import toast from 'react-hot-toast';

interface NotificationPreferences {
  id: string;
  user_id: string;
  email_enabled: boolean;
  push_enabled: boolean;
  whatsapp_enabled: boolean;
  do_not_disturb_start?: string;
  do_not_disturb_end?: string;
  do_not_disturb_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface NotificacionesSectionProps {
  user: User | null;
  preferences: NotificationPreferences | null;
  onPreferencesUpdated: (preferences: NotificationPreferences) => void;
}

export default function NotificacionesSection({ 
  user, 
  preferences, 
  onPreferencesUpdated 
}: NotificacionesSectionProps) {
  const [loading, setLoading] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(preferences?.email_enabled ?? true);
  const [pushEnabled, setPushEnabled] = useState(preferences?.push_enabled ?? true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(preferences?.whatsapp_enabled ?? false);
  const [dndEnabled, setDndEnabled] = useState(preferences?.do_not_disturb_enabled ?? false);
  const [dndStart, setDndStart] = useState(preferences?.do_not_disturb_start ?? '22:00');
  const [dndEnd, setDndEnd] = useState(preferences?.do_not_disturb_end ?? '08:00');
  
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
      const preferencesData = {
        user_id: user.id,
        email_enabled: emailEnabled,
        push_enabled: pushEnabled,
        whatsapp_enabled: whatsappEnabled,
        do_not_disturb_enabled: dndEnabled,
        do_not_disturb_start: dndStart,
        do_not_disturb_end: dndEnd,
        updated_at: new Date().toISOString()
      };
      
      let result;
      
      if (preferences) {
        // Actualizar preferencias existentes
        const { data, error } = await supabase
          .from('user_notification_preferences')
          .update(preferencesData)
          .eq('user_id', user.id)
          .select('*')
          .single();
          
        if (error) throw error;
        result = data;
      } else {
        // Crear nuevas preferencias
        const { data, error } = await supabase
          .from('user_notification_preferences')
          .insert({
            ...preferencesData,
            created_at: new Date().toISOString()
          })
          .select('*')
          .single();
          
        if (error) throw error;
        result = data;
      }
      
      onPreferencesUpdated(result);
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
        checked ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700'
      } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-600 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
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
            className="flex items-center px-4 py-2 text-sm rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:bg-purple-400"
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
