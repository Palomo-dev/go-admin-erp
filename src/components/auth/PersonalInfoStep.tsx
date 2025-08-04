'use client';

import { useState } from 'react';
import RegistrationForm, { RegistrationFormData } from '@/components/auth/RegistrationForm';

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  phone: string;
  avatarUrl?: string; // NUEVO - Storage path del avatar
  preferredLanguage?: string; // NUEVO - Idioma preferido
}

type PersonalInfoProps = {
  formData: FormData;
  updateFormData: (data: Partial<FormData>) => void;
  onNext: () => void;
  error?: string | null;
  loading?: boolean;
};

export default function PersonalInfoStep({ formData, updateFormData, onNext, error, loading = false }: PersonalInfoProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const currentError = error || formError;

  const handleSubmit = async (data: RegistrationFormData) => {
    // La validación de contraseñas ahora se realiza en el componente RegistrationForm
    // Solo verificamos si hay errores generales del proceso de registro
    
    // Update form data in parent component
    updateFormData({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      password: data.password,
      confirmPassword: data.confirmPassword,
      phone: data.phoneNumber,
      avatarUrl: data.avatarUrl, // NUEVO
      preferredLanguage: data.preferredLanguage // NUEVO
    });
    
    // Proceed to next step
    onNext();
  };

  return (
    <div className="mt-8 space-y-6">
      <RegistrationForm
        initialEmail={formData.email}
        isEmployee={false}
        isReadOnlyEmail={false}
        onSubmit={handleSubmit}
        isLoading={loading}
        error={currentError}
      />
    </div>
  );
}
