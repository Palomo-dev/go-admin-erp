'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { EyeIcon, EyeSlashIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

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

  const handleNextStep = () => {
    if (currentStep === 1 && validateStep1()) {
      setCurrentStep(2);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    if (!validateStep2()) return;

    setIsLoading(true);
    setError(null);

    try {
      // 0. Verificar que la sesión sigue activa antes de intentar actualizar la contraseña.
      // La sesión temporal (creada al abrir el enlace del correo) puede perderse si el
      // usuario tarda en completar el formulario. Intentamos recuperarla antes de fallar.
      const { data: sessionCheck } = await supabase.auth.getSession();
      if (!sessionCheck.session) {
        console.log('⚠️ Sesión no encontrada, intentando refrescar...');
        const { data: refreshData } = await supabase.auth.refreshSession();
        if (!refreshData.session) {
          throw new Error(
            'Tu sesión expiró mientras completabas el formulario. Por favor, vuelve a abrir el enlace de invitación desde tu correo electrónico para continuar.'
          );
        }
      }

      // 1. Actualizar contraseña del usuario existente (ya loggeado con credenciales temporales)
      console.log('🔑 Actualizando contraseña del usuario...');
      const { data: authData, error: authError } = await supabase.auth.updateUser({
        password: formData.password
      });

      if (authError) {
        console.log('Error actualizando contraseña:', authError);
        if (authError.message?.includes('Auth session missing')) {
          throw new Error(
            'Tu sesión expiró mientras completabas el formulario. Por favor, vuelve a abrir el enlace de invitación desde tu correo electrónico para continuar.'
          );
        }
        throw new Error(authError.message);
      }

      if (!authData.user) {
        throw new Error('Error al actualizar usuario');
      }

      console.log('✅ Contraseña actualizada exitosamente');
      // Email ya está confirmado desde el login automático

      // 3-5. Crear/actualizar perfil, crear/actualizar membresía en la organización
      // y marcar la invitación como utilizada, todo en UNA SOLA transacción atómica
      // en el servidor (accept_invitation_atomic). Antes esto eran 4 llamadas
      // independientes desde el cliente que podían fallar a mitad de camino,
      // dejando al usuario con perfil creado pero SIN membresía en la organización.
      console.log('📝 Completando registro de invitación (perfil + membresía + invitación)...');
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

      // 4. Cerrar sesión para forzar nuevo login
      await supabase.auth.signOut();

      // 5. Completar el proceso
      setCurrentStep(3); // Paso de éxito
      setTimeout(() => {
        onComplete();
      }, 2000);

    } catch (err: any) {
      console.error('Error al procesar invitación:', err);
      setError(err.message || 'Error inesperado al procesar la invitación');
      setIsLoading(false);
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">¡Bienvenido!</h2>
        <p className="mt-2 text-gray-600">
          Has sido invitado a unirte a <span className="font-semibold text-blue-600">{inviteData.organization_name}</span>
        </p>
        <p className="text-sm text-gray-500">
          Como <span className="font-medium">{inviteData.role_name}</span>
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <CheckCircleIcon className="h-5 w-5 text-blue-600" />
          </div>
          <div className="ml-3">
            <p className="text-sm text-blue-800">
              <span className="font-medium">Email:</span> {inviteData.email}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
            Nombre *
          </label>
          <input
            type="text"
            id="firstName"
            value={formData.firstName}
            onChange={(e) => handleInputChange('firstName', e.target.value)}
            className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
              validationErrors.firstName ? 'border-red-300' : 'border-gray-300'
            }`}
            placeholder="Ingresa tu nombre"
          />
          {validationErrors.firstName && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.firstName}</p>
          )}
        </div>

        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
            Apellido *
          </label>
          <input
            type="text"
            id="lastName"
            value={formData.lastName}
            onChange={(e) => handleInputChange('lastName', e.target.value)}
            className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
              validationErrors.lastName ? 'border-red-300' : 'border-gray-300'
            }`}
            placeholder="Ingresa tu apellido"
          />
          {validationErrors.lastName && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.lastName}</p>
          )}
        </div>

        <div>
          <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700">
            Teléfono *
          </label>
          <input
            type="tel"
            id="phoneNumber"
            value={formData.phoneNumber}
            onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
            className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
              validationErrors.phoneNumber ? 'border-red-300' : 'border-gray-300'
            }`}
            placeholder="+57 300 123 4567"
          />
          {validationErrors.phoneNumber && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.phoneNumber}</p>
          )}
        </div>
      </div>

      <button
        onClick={handleNextStep}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        Continuar
      </button>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Crear Contraseña</h2>
        <p className="mt-2 text-gray-600">
          Establece una contraseña segura para tu cuenta
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Contraseña *
          </label>
          <div className="mt-1 relative">
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              value={formData.password}
              onChange={(e) => handleInputChange('password', e.target.value)}
              className={`block w-full px-3 py-2 pr-10 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
                validationErrors.password ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Mínimo 8 caracteres"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              {showPassword ? (
                <EyeSlashIcon className="h-5 w-5 text-gray-400" />
              ) : (
                <EyeIcon className="h-5 w-5 text-gray-400" />
              )}
            </button>
          </div>
          {validationErrors.password && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.password}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Debe contener al menos una mayúscula, una minúscula y un número
          </p>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
            Confirmar Contraseña *
          </label>
          <div className="mt-1 relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              id="confirmPassword"
              value={formData.confirmPassword}
              onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
              className={`block w-full px-3 py-2 pr-10 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
                validationErrors.confirmPassword ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Repite tu contraseña"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              {showConfirmPassword ? (
                <EyeSlashIcon className="h-5 w-5 text-gray-400" />
              ) : (
                <EyeIcon className="h-5 w-5 text-gray-400" />
              )}
            </button>
          </div>
          {validationErrors.confirmPassword && (
            <p className="mt-1 text-sm text-red-600">{validationErrors.confirmPassword}</p>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex space-x-3">
        <button
          onClick={handlePrevStep}
          className="flex-1 flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Anterior
        </button>
        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="flex-1 flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
      <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100">
        <CheckCircleIcon className="h-8 w-8 text-green-600" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-gray-900">¡Registro Completado!</h2>
        <p className="mt-2 text-gray-600">
          Tu cuenta ha sido creada exitosamente en <span className="font-semibold text-blue-600">{inviteData.organization_name}</span>
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Serás redirigido al inicio de sesión en unos segundos...
        </p>
      </div>
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600 mx-auto"></div>
    </div>
  );

  const steps = [
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
                    : 'border-gray-300 text-gray-500'
                }`}
              >
                {currentStep > s.number ? (
                  <CheckCircleIcon className="w-5 h-5" />
                ) : (
                  <span className="text-sm font-medium">{s.number}</span>
                )}
              </div>
              <span className="mt-2 text-xs text-gray-500 text-center w-20">{s.label}</span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`flex-1 h-1 mx-2 mt-4 ${
                  currentStep > s.number ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-lg sm:rounded-lg sm:px-10">
          {renderProgressBar()}
          
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
        </div>
      </div>
    </div>
  );
}
