'use client';

import { useState } from 'react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import FileUpload from '@/components/common/FileUpload';

interface RegistrationFormProps {
  initialEmail?: string;
  isEmployee?: boolean;
  isReadOnlyEmail?: boolean;
  onSubmit: (formData: RegistrationFormData) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export interface RegistrationFormData {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  avatarUrl?: string;
  preferredLanguage?: string;
}

export default function RegistrationForm({
  initialEmail = '',
  isEmployee = false,
  isReadOnlyEmail = false,
  onSubmit,
  isLoading,
  error
}: RegistrationFormProps) {
  const [formData, setFormData] = useState<RegistrationFormData>({
    email: initialEmail,
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    phoneNumber: '',
    avatarUrl: '',
    preferredLanguage: 'es'
  });
  const [validationErrors, setValidationErrors] = useState<{
    email?: string;
    phoneNumber?: string;
    avatar?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear validation errors when field is edited
    if (validationErrors[name as keyof typeof validationErrors]) {
      setValidationErrors(prev => ({ ...prev, [name]: undefined }));
    }
    
    // Validar contraseñas en tiempo real
    if (name === 'password' || name === 'confirmPassword') {
      const password = name === 'password' ? value : formData.password;
      const confirmPassword = name === 'confirmPassword' ? value : formData.confirmPassword;
      
      // Solo validar si ambos campos tienen contenido
      if (password && confirmPassword) {
        if (password !== confirmPassword) {
          setValidationErrors(prev => ({ 
            ...prev, 
            confirmPassword: 'Las contraseñas no coinciden' 
          }));
        } else {
          setValidationErrors(prev => ({ 
            ...prev, 
            confirmPassword: undefined 
          }));
        }
      }
    }
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePhone = (phone: string): boolean => {
    // Allow empty phone if not required
    if (!isEmployee && !phone) return true;
    
    // Only allow digits
    const phoneRegex = /^\d+$/;
    return phoneRegex.test(phone);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate email
    if (!validateEmail(formData.email)) {
      setValidationErrors(prev => ({ ...prev, email: 'Por favor ingrese un correo electrónico válido' }));
      return;
    }
    
    // Validate phone number
    if (!validatePhone(formData.phoneNumber)) {
      setValidationErrors(prev => ({ ...prev, phoneNumber: 'El teléfono debe contener solo dígitos' }));
      return;
    }
    
    // Basic validation
    if (formData.password !== formData.confirmPassword) {
      setValidationErrors(prev => ({ 
        ...prev, 
        confirmPassword: 'Las contraseñas no coinciden' 
      }));
      return;
    }
    
    // Validar longitud de contraseña
    if (formData.password.length < 8) {
      setValidationErrors(prev => ({ 
        ...prev, 
        password: 'La contraseña debe tener al menos 8 caracteres' 
      }));
      return;
    }
    
    await onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
            Nombre
          </label>
          <input
            id="firstName"
            name="firstName"
            type="text"
            value={formData.firstName}
            onChange={handleChange}
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
            Apellido
          </label>
          <input
            id="lastName"
            name="lastName"
            type="text"
            value={formData.lastName}
            onChange={handleChange}
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>
      
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Correo electrónico
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          disabled={isReadOnlyEmail}
          required
          className={`mt-1 block w-full px-3 py-2 border ${validationErrors.email ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm ${
            isReadOnlyEmail ? 'bg-gray-50 text-gray-500' : 'focus:outline-none focus:ring-blue-500 focus:border-blue-500'
          }`}
        />
        {validationErrors.email && (
          <p className="mt-1 text-sm text-red-600">{validationErrors.email}</p>
        )}
      </div>
      
      <div>
        <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700">
          Teléfono {!isEmployee && '(opcional)'}
        </label>
        <input
          id="phoneNumber"
          name="phoneNumber"
          type="tel"
          value={formData.phoneNumber}
          onChange={handleChange}
          required={isEmployee}
          className={`mt-1 block w-full px-3 py-2 border ${validationErrors.phoneNumber ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500`}
        />
        {validationErrors.phoneNumber && (
          <p className="mt-1 text-sm text-red-600">{validationErrors.phoneNumber}</p>
        )}
      </div>
      
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          Contraseña
        </label>
        <div className="relative mt-1">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            value={formData.password}
            onChange={handleChange}
            required
            className={`block w-full px-3 py-2 pr-10 border ${validationErrors.password ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
          >
            {showPassword ? (
              <EyeSlashIcon className="h-5 w-5" />
            ) : (
              <EyeIcon className="h-5 w-5" />
            )}
          </button>
        </div>
        {validationErrors.password && (
          <p className="mt-1 text-sm text-red-600">{validationErrors.password}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">La contraseña debe tener al menos 8 caracteres</p>
      </div>
      
      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
          Confirmar contraseña
        </label>
        <div className="relative mt-1">
          <input
            id="confirmPassword"
            name="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            value={formData.confirmPassword}
            onChange={handleChange}
            required
            className={`block w-full px-3 py-2 pr-10 border ${validationErrors.confirmPassword ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500`}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
          >
            {showConfirmPassword ? (
              <EyeSlashIcon className="h-5 w-5" />
            ) : (
              <EyeIcon className="h-5 w-5" />
            )}
          </button>
        </div>
        {validationErrors.confirmPassword && (
          <p className="mt-1 text-sm text-red-600">{validationErrors.confirmPassword}</p>
        )}
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Foto de perfil (opcional)
        </label>
        <FileUpload
          bucket="profiles"
          folder="avatars/temp"
          accept="image/*"
          maxSize={2 * 1024 * 1024} // 2MB
          onUpload={(filePath) => {
            setFormData(prev => ({ ...prev, avatarUrl: filePath }));
            // Clear any avatar errors
            if (validationErrors.avatar) {
              setValidationErrors(prev => ({ ...prev, avatar: undefined }));
            }
          }}
          onError={(error) => {
            setValidationErrors(prev => ({ ...prev, avatar: error }));
          }}
          currentFile={formData.avatarUrl}
          placeholder="Subir foto"
          preview={true}
        />
        {validationErrors.avatar && (
          <p className="mt-1 text-sm text-red-600">{validationErrors.avatar}</p>
        )}
      </div>
      
      <div>
        <label htmlFor="preferredLanguage" className="block text-sm font-medium text-gray-700">
          Idioma preferido
        </label>
        <select
          id="preferredLanguage"
          name="preferredLanguage"
          value={formData.preferredLanguage}
          onChange={(e) => setFormData(prev => ({ ...prev, preferredLanguage: e.target.value }))}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="es">🇪🇸 es - Español</option>
          <option value="en">🇺🇸 en - English</option>
          <option value="pt">🇧🇷 pt - Português</option>
          <option value="fr">🇫🇷 fr - Français</option>
          <option value="de">🇩🇪 de - Deutsch</option>
          <option value="it">🇮🇹 it - Italiano</option>
        </select>
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
      
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isLoading}
          className="py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Procesando...' : isEmployee ? 'Aceptar invitación' : 'Continuar'}
        </button>
      </div>
    </form>
  );
}
