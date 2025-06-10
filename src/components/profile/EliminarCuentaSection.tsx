'use client';

import { useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';
import { AlertTriangle, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

interface EliminarCuentaSectionProps {
  user: User | null;
}

export default function EliminarCuentaSection({ user }: EliminarCuentaSectionProps) {
  const [showModal, setShowModal] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const router = useRouter();
  
  const handleOpenModal = () => {
    setShowModal(true);
    setPassword('');
    setConfirmText('');
    setError('');
  };
  
  const handleCloseModal = () => {
    setShowModal(false);
    setPassword('');
    setConfirmText('');
    setError('');
  };
  
  const handleDeleteAccount = async () => {
    if (!user) {
      toast.error('No hay un usuario autenticado');
      return;
    }
    
    // Validaciones básicas
    if (!password) {
      setError('Debe ingresar su contraseña para confirmar');
      return;
    }
    
    if (confirmText !== 'ELIMINAR') {
      setError('Debe escribir ELIMINAR para confirmar la acción');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // Paso 1: Verificar la contraseña intentando iniciar sesión
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email || '',
        password: password
      });
      
      if (signInError) {
        setError('Contraseña incorrecta');
        setLoading(false);
        return;
      }
      
      // Paso 2: Marcar la cuenta para eliminación en nuestra base de datos
      // En lugar de eliminar directamente, normalmente se marca para eliminación diferida
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          status: 'pending_deletion',
          updated_at: new Date().toISOString(),
          deletion_requested_at: new Date().toISOString()
        })
        .eq('id', user.id);
      
      if (updateError) throw updateError;
      
      // Paso 3: Cerrar sesión del usuario
      await supabase.auth.signOut();
      
      // Paso 4: Redirigir al usuario a la página de inicio con un mensaje
      toast.success('Su solicitud de eliminación de cuenta ha sido registrada. Su cuenta será eliminada en los próximos días.');
      router.push('/');
    } catch (error) {
      console.error('Error al eliminar cuenta:', error);
      setError('Ha ocurrido un error al procesar su solicitud. Por favor, intente nuevamente.');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
          Eliminar cuenta
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Una vez eliminada su cuenta, todos sus datos personales serán eliminados permanentemente
        </p>
      </div>
      
      <div className="p-4 border border-red-200 dark:border-red-900/50 rounded-lg bg-red-50 dark:bg-red-900/10">
        <div className="flex items-start">
          <div className="flex-shrink-0 mt-0.5">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800 dark:text-red-300">
              Zona de peligro
            </h3>
            <div className="mt-2 text-sm text-red-700 dark:text-red-300">
              <p>
                Eliminar su cuenta es una acción permanente y no se puede deshacer. Se eliminarán:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>Su información personal y perfil</li>
                <li>Su acceso a todas las organizaciones</li>
                <li>Los roles asignados y permisos asociados</li>
                <li>Configuraciones y preferencias personales</li>
              </ul>
            </div>
            <div className="mt-4">
              <button
                onClick={handleOpenModal}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:focus:ring-offset-gray-900"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Eliminar mi cuenta
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Modal de confirmación */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center text-red-600 dark:text-red-400 mb-4">
              <AlertTriangle className="w-6 h-6 mr-2" />
              <h3 className="text-lg font-semibold">Confirmar eliminación de cuenta</h3>
            </div>
            
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Esta acción es irreversible. Por favor, confirme que desea eliminar permanentemente su cuenta ingresando su contraseña y escribiendo <strong>ELIMINAR</strong> en el campo de confirmación.
            </p>
            
            <div className="space-y-4 mb-6">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100"
                />
              </div>
              
              <div>
                <label htmlFor="confirmText" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Escriba &quot;ELIMINAR&quot; para confirmar
                </label>
                <input
                  id="confirmText"
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100"
                />
              </div>
              
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
            </div>
            
            <div className="flex justify-end gap-2">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteAccount}
                className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:bg-red-400"
                disabled={loading || password === '' || confirmText !== 'ELIMINAR'}
              >
                {loading ? (
                  <span className="flex items-center">
                    <span className="animate-spin h-4 w-4 mr-2 border-t-2 border-b-2 border-white rounded-full"></span>
                    Procesando...
                  </span>
                ) : 'Eliminar permanentemente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
