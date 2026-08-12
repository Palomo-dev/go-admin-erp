'use client';

import { useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';
import { AlertTriangle, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

interface OrgSimple {
  id: string | number;
  name: string;
}

interface EliminarCuentaSectionProps {
  user: User | null;
  organizations?: OrgSimple[];
  profileName?: string;
}

export default function EliminarCuentaSection({ user, organizations = [], profileName: profileNameProp }: EliminarCuentaSectionProps) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [orgNameConfirm, setOrgNameConfirm] = useState('');
  const [profileNameConfirm, setProfileNameConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const router = useRouter();

  const profileName = profileNameProp
    || user?.user_metadata?.full_name
    || user?.user_metadata?.name
    || user?.email?.split('@')[0]
    || '';

  const primaryOrgName = organizations[0]?.name ?? '';

  const resetForm = () => {
    setPassword('');
    setConfirmText('');
    setOrgNameConfirm('');
    setProfileNameConfirm('');
    setError('');
  };

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (!value) resetForm();
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

    if (profileNameConfirm.trim() !== profileName) {
      setError(`Debe escribir "${profileName}" exactamente como aparece en su perfil`);
      return;
    }

    if (primaryOrgName && orgNameConfirm.trim() !== primaryOrgName) {
      setError(`Debe escribir "${primaryOrgName}" exactamente como aparece en su organización`);
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
    } catch (err) {
      console.error('Error al eliminar cuenta:', err);
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
              <AlertDialog open={open} onOpenChange={handleOpenChange}>
                <AlertDialogTrigger asChild>
                  <button
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:focus:ring-offset-gray-900"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Eliminar mi cuenta
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent className="max-w-md">
                  <AlertDialogHeader>
                    <div className="flex items-center text-red-600 dark:text-red-400">
                      <AlertTriangle className="w-6 h-6 mr-2" />
                      <AlertDialogTitle>Confirmar eliminación de cuenta</AlertDialogTitle>
                    </div>
                    <AlertDialogDescription className="text-gray-600 dark:text-gray-300">
                      Esta acción es irreversible. Para confirmar debe ingresar su contraseña, escribir el nombre de su perfil, el nombre de su organización y la palabra <strong>ELIMINAR</strong>.
                    </AlertDialogDescription>
                  </AlertDialogHeader>

                  <div className="space-y-4">
                    <div>
                      <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Contraseña
                      </label>
                      <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100"
                      />
                    </div>

                    <div>
                      <label htmlFor="profileNameConfirm" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Escriba el nombre de su perfil: <span className="font-bold text-gray-900 dark:text-gray-100">{profileName}</span>
                      </label>
                      <input
                        id="profileNameConfirm"
                        type="text"
                        value={profileNameConfirm}
                        onChange={(e) => setProfileNameConfirm(e.target.value)}
                        className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100"
                      />
                    </div>

                    {primaryOrgName && (
                      <div>
                        <label htmlFor="orgNameConfirm" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Escriba el nombre de su organización: <span className="font-bold text-gray-900 dark:text-gray-100">{primaryOrgName}</span>
                        </label>
                        <input
                          id="orgNameConfirm"
                          type="text"
                          value={orgNameConfirm}
                          onChange={(e) => setOrgNameConfirm(e.target.value)}
                          className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                    )}

                    <div>
                      <label htmlFor="confirmText" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Escriba &quot;ELIMINAR&quot; para confirmar
                      </label>
                      <input
                        id="confirmText"
                        type="text"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100"
                      />
                    </div>

                    {error && (
                      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                    )}
                  </div>

                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => {
                        e.preventDefault();
                        handleDeleteAccount();
                      }}
                      className="bg-red-600 text-white hover:bg-red-700 disabled:bg-red-400"
                      disabled={loading || !password || confirmText !== 'ELIMINAR' || profileNameConfirm.trim() !== profileName || (!!primaryOrgName && orgNameConfirm.trim() !== primaryOrgName)}
                    >
                      {loading ? (
                        <span className="flex items-center">
                          <span className="animate-spin h-4 w-4 mr-2 border-t-2 border-b-2 border-white rounded-full" />
                          Procesando...
                        </span>
                      ) : 'Eliminar permanentemente'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
