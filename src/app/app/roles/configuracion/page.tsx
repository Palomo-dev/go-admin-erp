'use client';

import { useState } from 'react';
import { usePermissionContext } from '@/hooks/usePermissionContext';
import PermissionGuard from '@/components/auth/PermissionGuard';
import { PERMISSIONS, MODULES } from '@/lib/middleware/permissions';
import { Settings, Save, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function ConfiguracionPage() {
  const { context, loading } = usePermissionContext();
  const [saving, setSaving] = useState(false);

  if (loading || !context) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      // Simulación de guardado
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toast.success('Configuración guardada correctamente');
    } catch (error) {
      console.error('Error al guardar configuración:', error);
      toast.error('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Settings className="h-8 w-8 text-indigo-600" />
                <h1 className="text-2xl font-bold text-gray-900">Configuración del Sistema</h1>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PermissionGuard
          permissions={[PERMISSIONS.ADMIN_FULL_ACCESS]}
          moduleCode={MODULES.ADMIN}
          organizationId={context.organizationId}
        >
          <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">Configuración General</h2>
              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Guardar Cambios
                  </>
                )}
              </button>
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded-md p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-amber-800">Sección en desarrollo</h3>
                  <div className="mt-2 text-sm text-amber-700">
                    <p>
                      Esta sección está actualmente en desarrollo. Próximamente se habilitarán las opciones de configuración del sistema.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="space-y-6">
              <div>
                <label htmlFor="system-name" className="block text-sm font-medium text-gray-700">
                  Nombre del Sistema
                </label>
                <input
                  type="text"
                  id="system-name"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="GO Admin ERP"
                  disabled
                />
              </div>
              
              <div>
                <label htmlFor="timezone" className="block text-sm font-medium text-gray-700">
                  Zona Horaria
                </label>
                <select
                  id="timezone"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  disabled
                >
                  <option>America/Mexico_City</option>
                  <option>America/New_York</option>
                  <option>Europe/London</option>
                  <option>Asia/Tokyo</option>
                </select>
              </div>
              
              <div>
                <label htmlFor="date-format" className="block text-sm font-medium text-gray-700">
                  Formato de Fecha
                </label>
                <select
                  id="date-format"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  disabled
                >
                  <option>DD/MM/YYYY</option>
                  <option>MM/DD/YYYY</option>
                  <option>YYYY-MM-DD</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Opciones Avanzadas
                </label>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center">
                    <input
                      id="enable-audit"
                      type="checkbox"
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      disabled
                    />
                    <label htmlFor="enable-audit" className="ml-2 block text-sm text-gray-700">
                      Habilitar registro de auditoría
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      id="enable-notifications"
                      type="checkbox"
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      disabled
                    />
                    <label htmlFor="enable-notifications" className="ml-2 block text-sm text-gray-700">
                      Habilitar notificaciones del sistema
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      id="enable-analytics"
                      type="checkbox"
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      disabled
                    />
                    <label htmlFor="enable-analytics" className="ml-2 block text-sm text-gray-700">
                      Recopilar datos de uso anónimos
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </PermissionGuard>
      </div>
    </div>
  );
}
