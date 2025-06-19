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
    // Validate passwords match
    if (data.password !== data.confirmPassword) {
      setFormError('Las contraseñas no coinciden');
      return;
    }
    
    // Validate password length
    if (data.password.length < 8) {
      setFormError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    
    // Update form data in parent component
    updateFormData({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      password: data.password,
      confirmPassword: data.confirmPassword,
      phone: data.phoneNumber
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
