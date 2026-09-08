'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { EyeIcon, EyeSlashIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { PhoneInput } from '@/components/ui/phone-input';
import AuthSceneBackground from '@/components/auth/AuthSceneBackground';

interface InvitationWizardProps {
  inviteData: {
    id: number;
    email: string;
    code: string;
    role_id: number;
    organization_id: number;
    organization_name: string;
    role_name: string;
  };
  onComplete: () => void;
}

interface FormData {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  password: string;
  confirmPassword: string;
}

export default function InvitationWizard({ inviteData, onComplete }: InvitationWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isExistingUser, setIsExistingUser] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    password: '',
    confirmPassword: ''
  });

  const [validationErrors, setValidationErrors] = useState<{
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  const validateStep1 = () => {
    const errors: typeof validationErrors = {};

    if (!formData.firstName.trim()) {
      errors.firstName = 'El nombre es obligatorio';
    }

    if (!formData.lastName.trim()) {
      errors.lastName = 'El apellido es obligatorio';
    }

    if (!formData.phoneNumber.trim()) {
      errors.phoneNumber = 'El teléfono es obligatorio';
    } else if (!/^\+?[\d\s-()]+$/.test(formData.phoneNumber)) {
      errors.phoneNumber = 'Formato de teléfono inválido';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateStep2 = () => {
    const errors: typeof validationErrors = {};

    if (!formData.password) {
      errors.password = 'La contraseña es obligatoria';
    } else if (formData.password.length < 8) {
      errors.password = 'La contraseña debe tener al menos 8 caracteres';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      errors.password = 'La contraseña debe contener al menos una mayúscula, una minúscula y un número';
    }

    if (!formData.confirmPassword) {
      errors.confirmPassword = 'Confirma tu contraseña';
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Las contraseñas no coinciden';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Limpiar errores de validación cuando el usuario empiece a escribir
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  // Detectar si el usuario ya tiene perfil completo (usuario existente)
  // En ese caso, se omite el step de contraseña y solo se confirma la membresía
  useEffect(() => {
    const checkExistingProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name, phone')
          .eq('id', user.id)
          .maybeSingle();

        if (profile && profile.first_name && profile.last_name) {
          setIsExistingUser(true);
          setFormData(prev => ({
            ...prev,
            firstName: profile.first_name || '',
            lastName: profile.last_name || '',
            phoneNumber: profile.phone || '',
          }));
        }
      } catch (err) {
        console.log('No se pudo verificar perfil existente:', err);
      }
    };
    checkExistingProfile();
  }, []);

  const handleNextStep = () => {
    if (currentStep === 1 && validateStep1()) {
      // Usuario existente: omitir step de contraseña, ir directo al submit
      if (isExistingUser) {
        handleSubmit();
      } else {
        setCurrentStep(2);
      }
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    // Usuarios existentes no necesitan definir contraseña (ya la tienen)
    if (!isExistingUser && !validateStep2()) return;

    setIsLoading(true);
    setError(null);

    try {
      // Verificar si hay sesión activa
      const { data: sessionCheck } = await supabase.auth.getSession();
      const hasSession = !!sessionCheck.session;

      if (hasSession) {
        // FLUJO CON SESIÓN (verifyOtp exitoso): usar el flujo original
        // que usa supabase.auth.updateUser (requiere sesión)
        console.log('✅ Sesión activa encontrada, usando flujo con sesión');

        // 1. Actualizar contraseña SOLO para usuarios nuevos
        if (!isExistingUser) {
          console.log('🔑 Actualizando contraseña del usuario...');
          const { data: authData, error: authError } = await supabase.auth.updateUser({
            password: formData.password
          });

          if (authError) {
            console.log('Error actualizando contraseña:', authError);
            if (authError.message?.includes('Auth session missing')) {
              // La sesión se perdió — usar el flujo sin sesión
              console.log('Sesión perdida, cayendo a flujo sin sesión...');
            } else {
              throw new Error(authError.message);
            }
          } else if (!authData.user) {
            throw new Error('Error al actualizar usuario');
          } else {
            console.log('✅ Contraseña actualizada exitosamente');
          }
        }

        // 2. Crear perfil + membresía + marcar invitación como usada
        console.log('📝 Completando registro de invitación...');
        const { data: acceptResult, error: acceptError } = await supabase.rpc('accept_invitation_atomic', {
          p_invite_code: inviteData.code,
          p_first_name: formData.firstName,
          p_last_name: formData.lastName,
          p_phone: formData.phoneNumber
        });

        if (acceptError) {
          console.error('❌ Error completando la invitación:', acceptError);
          throw new Error(acceptError.message || 'No se pudo completar el registro de la invitación.');
        }

        console.log('✅ Invitación completada exitosamente:', acceptResult);

        // 3. Setear currentOrganizationId (NO cerrar sesión — el usuario ya tiene sesión válida)
        if (typeof window !== 'undefined') {
          localStorage.setItem('currentOrganizationId', String(inviteData.organization_id));
          console.log('📝 currentOrganizationId seteado a:', inviteData.organization_id);
        }

        // 4. Completar
        setCurrentStep(3);
        setTimeout(() => {
          onComplete();
        }, 2000);

      } else {
        // FLUJO SIN SESIÓN (token consumido por Gmail prefetch, o link
        // copiado/abierto directamente): usar API server-side con admin key
        // para crear el usuario y setear la contraseña sin necesidad de
        // verifyOtp. Esto elimina la dependencia del email de verificación.
        console.log('⚠️ Sin sesión, usando API server-side para aceptar invitación...');

        const res = await fetch('/api/auth/accept-invitation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inviteCode: inviteData.code,
            email: inviteData.email,
            password: formData.password,
            firstName: formData.firstName,
            lastName: formData.lastName,
            phone: formData.phoneNumber,
            isExistingUser,
          }),
        });

        // Verificar que la respuesta sea JSON, no HTML (puede pasar si
        // el middleware redirige o si la ruta no existe en el deploy)
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          console.error('❌ Respuesta no es JSON:', res.status, contentType);
          throw new Error('Error del servidor. Intenta recargar la página.');
        }

        const result = await res.json();

        if (!res.ok || result.error) {
          console.error('❌ Error en accept-invitation API:', result.error);
          throw new Error(result.error || 'No se pudo completar el registro');
        }

        console.log('✅ Invitación aceptada via API server-side:', result);

        // Setear currentOrganizationId para que tras el login abra la org correcta
        if (typeof window !== 'undefined') {
          localStorage.setItem('currentOrganizationId', String(result.organizationId || inviteData.organization_id));
          localStorage.setItem('currentOrganizationName', result.organizationName || inviteData.organization_name);
          console.log('📝 currentOrganizationId seteado a:', result.organizationId || inviteData.organization_id);
        }

        // Login automático: el usuario ya tiene contraseña seteada,
        // no necesita ir manualmente a la página de login
        console.log('🔐 [INVITE] Haciendo login automático...');
        try {
          const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
            email: inviteData.email,
            password: formData.password,
          });
          if (loginError || !loginData.session) {
            console.error('❌ [INVITE] Login automático falló:', loginError);
            // Fallback: mandar a login manual
            setCurrentStep(3);
            setTimeout(() => { onComplete(); }, 2000);
          } else {
            console.log('✅ [INVITE] Login automático exitoso:', loginData.user?.email);
            setCurrentStep(3);
            setTimeout(() => {
              onComplete();
            }, 2000);
          }
        } catch (loginErr) {
          console.error('❌ [INVITE] Error en login automático:', loginErr);
          setCurrentStep(3);
          setTimeout(() => { onComplete(); }, 2000);
        }
      }

    } catch (err: any) {
      console.error('Error al procesar invitación:', err);
      setError(err.message || 'Error inesperado al procesar la invitación');
      setIsLoading(false);
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {isExistingUser ? 'Confirmar Invitación' : '¡Bienvenido!'}
        </h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Has sido invitado a unirte a <span className="font-semibold text-blue-600 dark:text-blue-400">{inviteData.organization_name}</span>
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500">
          Como <span className="font-medium">{inviteData.role_name}</span>
        </p>
      </div>

      {isExistingUser && (
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-green-800 dark:text-green-300">
                Ya tienes una cuenta en GO Admin. Solo necesitas confirmar tus datos para unirte a esta organización.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <CheckCircleIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="ml-3">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <span className="font-medium">Email:</span> {inviteData.email}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Nombre *
          </label>
          <input
            type="text"
            id="firstName"
            value={formData.firstName}
            onChange={(e) => handleInputChange('firstName', e.target.value)}
            className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 ${
              validationErrors.firstName ? 'border-red-300 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="Ingresa tu nombre"
          />
          {validationErrors.firstName && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.firstName}</p>
          )}
        </div>

        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Apellido *
          </label>
          <input
            type="text"
            id="lastName"
            value={formData.lastName}
            onChange={(e) => handleInputChange('lastName', e.target.value)}
            className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 ${
              validationErrors.lastName ? 'border-red-300 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="Ingresa tu apellido"
          />
          {validationErrors.lastName && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.lastName}</p>
          )}
        </div>

        <div>
          <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Teléfono *
          </label>
          <PhoneInput
            id="phoneNumber"
            value={formData.phoneNumber}
            onChange={(v) => handleInputChange('phoneNumber', v)}
            className={`mt-1 ${validationErrors.phoneNumber ? '[&_button]:border-red-300 [&_input]:border-red-300' : '[&_button]:border-gray-300 [&_input]:border-gray-300 dark:[&_button]:border-gray-600 dark:[&_input]:border-gray-600 dark:[&_input]:bg-gray-700 dark:[&_input]:text-gray-100'}`}
          />
          {validationErrors.phoneNumber && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.phoneNumber}</p>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 dark:border-red-500 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={handleNextStep}
        disabled={isLoading}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
            Procesando...
          </div>
        ) : (
          isExistingUser ? 'Aceptar Invitación' : 'Continuar'
        )}
      </button>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Crear Contraseña</h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Establece una contraseña segura para tu cuenta
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Contraseña *
          </label>
          <div className="mt-1 relative">
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              value={formData.password}
              onChange={(e) => handleInputChange('password', e.target.value)}
              className={`block w-full px-3 py-2 pr-10 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 ${
                validationErrors.password ? 'border-red-300 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'
              }`}
              placeholder="Mínimo 8 caracteres"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              {showPassword ? (
                <EyeSlashIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              ) : (
                <EyeIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              )}
            </button>
          </div>
          {validationErrors.password && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.password}</p>
          )}
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Debe contener al menos una mayúscula, una minúscula y un número
          </p>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Confirmar Contraseña *
          </label>
          <div className="mt-1 relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              id="confirmPassword"
              value={formData.confirmPassword}
              onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
              className={`block w-full px-3 py-2 pr-10 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 ${
                validationErrors.confirmPassword ? 'border-red-300 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'
              }`}
              placeholder="Repite tu contraseña"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              {showConfirmPassword ? (
                <EyeSlashIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              ) : (
                <EyeIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              )}
            </button>
          </div>
          {validationErrors.confirmPassword && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.confirmPassword}</p>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 dark:border-red-500 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex space-x-3">
        <button
          onClick={handlePrevStep}
          className="flex-1 flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
        >
          Anterior
        </button>
        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="flex-1 flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
              Creando cuenta...
            </div>
          ) : (
            'Completar Registro'
          )}
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="text-center space-y-6">
      <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30">
        <CheckCircleIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {isExistingUser ? '¡Invitación Aceptada!' : '¡Registro Completado!'}
        </h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          {isExistingUser
            ? <>Te has unido a <span className="font-semibold text-blue-600 dark:text-blue-400">{inviteData.organization_name}</span> exitosamente</>
            : <>Tu cuenta ha sido creada exitosamente en <span className="font-semibold text-blue-600 dark:text-blue-400">{inviteData.organization_name}</span></>
          }
        </p>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
          Serás redirigido al inicio de sesión en unos segundos...
        </p>
      </div>
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600 mx-auto"></div>
    </div>
  );

  // Usuario existente: omitir step de contraseña en la barra de progreso
  const steps = isExistingUser
    ? [
        { number: 1, label: 'Confirmar Datos' },
        { number: 3, label: 'Completado' },
      ]
    : [
        { number: 1, label: 'Datos Personales' },
        { number: 2, label: 'Contraseña' },
        { number: 3, label: 'Completado' },
      ];

  const renderProgressBar = () => (
    <div className="mb-8">
      <div className="flex items-start">
        {steps.map((s, idx) => (
          <div key={s.number} className={`flex items-center ${idx < steps.length - 1 ? 'flex-1' : ''}`}>
            <div className="flex flex-col items-center flex-shrink-0">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                  currentStep >= s.number
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                }`}
              >
                {currentStep > s.number ? (
                  <CheckCircleIcon className="w-5 h-5" />
                ) : (
                  <span className="text-sm font-medium">{s.number}</span>
                )}
              </div>
              <span className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center w-20">{s.label}</span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`flex-1 h-1 mx-2 mt-4 ${
                  currentStep > s.number ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-800 dark:from-gray-800 dark:via-gray-900 dark:to-black relative overflow-hidden px-4 sm:px-6 py-6 sm:py-8">
      <AuthSceneBackground />
      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-white dark:bg-gray-800 py-6 sm:py-8 px-4 sm:px-6 shadow-xl sm:shadow-2xl rounded-lg sm:rounded-xl border border-gray-100 dark:border-gray-700 sm:px-10">
          {renderProgressBar()}

          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
        </div>
      </div>
    </div>
  );
}
