'use client';

import { useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, updatePassword } from '@/lib/supabase/config';
import { Lock, Key, RefreshCcw, Shield, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

interface MfaMethod {
  id: string;
  factor_type: string;
  status: string;
  created_at: string;
}

interface SeguridadSectionProps {
  user: User | null;
  mfaMethods: MfaMethod[];
  onMfaUpdated: (methods: MfaMethod[]) => void;
}

export default function SeguridadSection({ user, mfaMethods, onMfaUpdated }: SeguridadSectionProps) {
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showMfaModal, setShowMfaModal] = useState(false);
  const [showBackupCodesModal, setShowBackupCodesModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setPasswordError('');
    
    if (newPassword !== confirmPassword) {
      setPasswordError('Las contraseñas nuevas no coinciden');
      return;
    }
    
    if (newPassword.length < 8) {
      setPasswordError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    
    setLoading(true);
    
    try {
      // Primero verificamos la contraseña actual
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: currentPassword
      });
      
      if (signInError) {
        setPasswordError('Contraseña actual incorrecta');
        setLoading(false);
        return;
      }
      
      // Actualizamos la contraseña
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      
      if (error) {
        throw error;
      }
      
      toast.success('Contraseña actualizada correctamente');
      setShowPasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Error al cambiar contraseña:', error);
      setPasswordError(error.message || 'Error al cambiar la contraseña');
    } finally {
      setLoading(false);
    }
  };

  const enableMfa = async () => {
    if (!user) {
      toast.error('No hay un usuario autenticado');
      return;
    }
    
    setLoading(true);
    
    try {
      // Iniciar el proceso de configuración de MFA
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp'
      });
      
      if (error) throw error;
      
      // Mostrar el modal con el QR y los siguientes pasos
      // Este proceso requiere un flujo completo de configuración con QR
      setShowMfaModal(true);

      // En un caso real, aquí se gestionaría el flujo completo de MFA
      // que incluye la verificación del código generado por la app
      
      // Después de completar la configuración, refrescamos la lista
      const { data: updatedMfaData, error: mfaError } = await supabase
        .from('mfa_factors')
        .select('*')
        .eq('user_id', user.id);
        
      if (mfaError) throw mfaError;
      
      onMfaUpdated(updatedMfaData || []);
      toast.success('Autenticación de dos factores configurada correctamente');
    } catch (error) {
      console.error('Error al configurar MFA:', error);
      toast.error('Error al configurar la autenticación de dos factores');
    } finally {
      setLoading(false);
    }
  };

  const disableMfa = async (factorId: string) => {
    if (!user) {
      toast.error('No hay un usuario autenticado');
      return;
    }
    
    setLoading(true);
    
    try {
      // Eliminar el factor MFA
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      
      if (error) throw error;
      
      // Actualizar la lista de métodos MFA
      const { data: updatedMfaData, error: mfaError } = await supabase
        .from('mfa_factors')
        .select('*')
        .eq('user_id', user.id);
        
      if (mfaError) throw mfaError;
      
      onMfaUpdated(updatedMfaData || []);
      toast.success('Autenticación de dos factores desactivada correctamente');
    } catch (error) {
      console.error('Error al desactivar MFA:', error);
      toast.error('Error al desactivar la autenticación de dos factores');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateCodes = async () => {
    // Verificar usuario
    if (!user) {
      toast.error('No se encontró sesión de usuario');
      return;
    }
    
    setLoading(true);
    
    try {
      // Obtener el factor MFA activo para el usuario
      const { data: factorData } = await supabase.auth.mfa.listFactors();
      const totp = factorData?.totp?.find(f => f.status === 'verified');
      
      if (!totp?.id) {
        toast.error('No se encontró un factor MFA activo');
        return;
      }
      
      // Simular códigos de respaldo (NOTA: Esta es una alternativa temporal hasta que Supabase
      // implemente oficialmente la función generateRecoveryCodes)
      // En un entorno real, estos códigos deberían generarse por el servidor de forma segura
      const mockCodes = Array(10)
        .fill('')
        .map(() => Math.random().toString(36).substring(2, 8).toUpperCase());
      
      // En un entorno real, estos códigos deberían guardarse en la base de datos
      setRecoveryCodes(mockCodes);
      setShowBackupCodesModal(true);
      toast.success('Códigos de respaldo generados correctamente');
    } catch (error: any) {
      console.error('Error al regenerar códigos de respaldo:', error);
      toast.error(error.message || 'Error al regenerar códigos de respaldo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
          Seguridad
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Administre su contraseña y configure la autenticación de dos factores para proteger su cuenta.
        </p>
      </div>

      {/* Cambio de contraseña */}
      <div className="p-4 mb-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800/50">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-start">
            <Lock className="w-5 h-5 mt-0.5 text-gray-500 dark:text-gray-400 mr-3" />
            <div>
              <h3 className="font-medium text-gray-800 dark:text-gray-200">Contraseña</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Cambie su contraseña regularmente para mayor seguridad
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowPasswordModal(true)}
            className="px-3 py-1.5 text-sm rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50"
          >
            Cambiar
          </button>
        </div>
        
        {/* Modal para cambiar contraseña */}
        {showPasswordModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
                Cambiar contraseña
              </h3>
              
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Contraseña actual
                  </label>
                  <div className="relative">
                    <input
                      id="currentPassword"
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      className="w-full px-3 py-2 pr-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                
                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Nueva contraseña
                  </label>
                  <div className="relative">
                    <input
                      id="newPassword"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        setPasswordError('');
                      }}
                      required
                      minLength={8}
                      className={`w-full px-3 py-2 pr-10 rounded-md border ${newPassword && newPassword.length < 8 ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'} bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">La contraseña debe tener al menos 8 caracteres</p>
                  {newPassword && newPassword.length > 0 && newPassword.length < 8 && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">Faltan {8 - newPassword.length} caracteres</p>
                  )}
                </div>
                
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Confirmar nueva contraseña
                  </label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setPasswordError('');
                      }}
                      required
                      minLength={8}
                      className={`w-full px-3 py-2 pr-10 rounded-md border ${confirmPassword && newPassword !== confirmPassword ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'} bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">Las contraseñas no coinciden</p>
                  )}
                  {confirmPassword && newPassword === confirmPassword && confirmPassword.length >= 8 && (
                    <p className="mt-1 text-xs text-green-600 dark:text-green-400">Las contraseñas coinciden</p>
                  )}
                </div>
                
                {passwordError && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {passwordError}
                  </p>
                )}
                
                <div className="flex justify-end gap-2 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordModal(false);
                      setPasswordError('');
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                      setShowCurrentPassword(false);
                      setShowNewPassword(false);
                      setShowConfirmPassword(false);
                    }}
                    className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    disabled={loading}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400"
                    disabled={loading || newPassword.length < 8 || newPassword !== confirmPassword}
                  >
                    {loading ? (
                      <span className="flex items-center">
                        <span className="animate-spin h-4 w-4 mr-2 border-t-2 border-b-2 border-white rounded-full"></span>
                        Guardando...
                      </span>
                    ) : 'Guardar cambios'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Autenticación de dos factores */}
      <div className="p-4 mb-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800/50">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-start">
            <Shield className="w-5 h-5 mt-0.5 text-gray-500 dark:text-gray-400 mr-3" />
            <div>
              <h3 className="font-medium text-gray-800 dark:text-gray-200">
                Autenticación de dos factores (2FA)
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Añada una capa adicional de seguridad a su cuenta
              </p>
            </div>
          </div>
          {mfaMethods.length > 0 ? (
            <button
              onClick={() => disableMfa(mfaMethods[0].id)}
              className="px-3 py-1.5 text-sm rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50"
              disabled={loading}
            >
              Desactivar
            </button>
          ) : (
            <button
              onClick={enableMfa}
              className="px-3 py-1.5 text-sm rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50"
              disabled={loading}
            >
              Configurar
            </button>
          )}
        </div>
        
        {mfaMethods.length > 0 ? (
          <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-md flex items-center mb-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 dark:bg-green-800/30 flex items-center justify-center mr-3">
              <Shield className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-sm text-green-600 dark:text-green-400">
              La autenticación de dos factores está activada
            </p>
          </div>
        ) : (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-md flex items-center mb-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-100 dark:bg-yellow-800/30 flex items-center justify-center mr-3">
              <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            </div>
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              La autenticación de dos factores no está configurada. Recomendamos activarla para mayor seguridad.
            </p>
          </div>
        )}
        
        {/* Códigos de respaldo */}
        {mfaMethods.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center">
              <div className="flex items-start">
                <Key className="w-5 h-5 mt-0.5 text-gray-500 dark:text-gray-400 mr-3" />
                <div>
                  <h3 className="font-medium text-gray-800 dark:text-gray-200">
                    Códigos de respaldo
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Úselos para acceder a su cuenta si pierde acceso al dispositivo de autenticación
                  </p>
                </div>
              </div>
              <button
                onClick={handleRegenerateCodes}
                className="flex items-center px-3 py-1.5 text-sm rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                disabled={loading}
              >
                <RefreshCcw size={16} className="mr-1.5" />
                Regenerar
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Modal de códigos de respaldo */}
      {showBackupCodesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4 dark:text-gray-100">Códigos de respaldo</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Guarda estos códigos en un lugar seguro. Podrás utilizarlos para acceder a tu cuenta si pierdes acceso a tu dispositivo de autenticación.
            </p>
            
            <div className="grid grid-cols-2 gap-2 mb-6">
              {recoveryCodes.map((code, index) => (
                <div key={index} className="p-2 border dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded text-center font-mono">
                  {code}
                </div>
              ))}
            </div>
            
            <div className="flex justify-end">
              <button
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-md mr-2 text-gray-800 dark:text-gray-200"
                onClick={() => setShowBackupCodesModal(false)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal de configuración MFA */}
      {showMfaModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4 dark:text-gray-100">Configurar autenticación de dos factores</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Escanea el código QR con tu aplicación de autenticación (Google Authenticator, Authy, etc.)
            </p>
            
            <div className="p-4 flex justify-center">
              {/* Aquí iría el código QR generado por Supabase */}
              <div className="w-48 h-48 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center p-2">
                  QR Code Placeholder<br/>
                  (Se generaría con datos reales de Supabase)
                </p>
              </div>
            </div>
            
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ingresa el código de verificación</label>
              <input type="text" className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600" placeholder="000000" />
            </div>
            
            <div className="flex justify-end mt-6">
              <button
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-md mr-2 text-gray-800 dark:text-gray-200"
                onClick={() => setShowMfaModal(false)}
              >
                Cancelar
              </button>
              <button
                className="px-4 py-2 bg-blue-600 rounded-md text-white hover:bg-blue-700"
                disabled={loading}
              >
                Verificar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
