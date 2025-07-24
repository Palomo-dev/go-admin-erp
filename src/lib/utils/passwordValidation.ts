/**
 * Utilidades para validación de contraseñas
 */

export interface PasswordRequirement {
  test: boolean;
  label: string;
  description: string;
}

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  requirements: PasswordRequirement[];
  strength: 'weak' | 'medium' | 'strong';
  score: number;
}

/**
 * Valida la fortaleza de una contraseña
 */
export const validatePassword = (password: string): PasswordValidationResult => {
  const requirements: PasswordRequirement[] = [
    {
      test: password.length >= 8,
      label: '8+ caracteres',
      description: 'La contraseña debe tener al menos 8 caracteres'
    },
    {
      test: /[A-Z]/.test(password),
      label: 'Mayúscula',
      description: 'Debe incluir al menos una letra mayúscula'
    },
    {
      test: /[a-z]/.test(password),
      label: 'Minúscula',
      description: 'Debe incluir al menos una letra minúscula'
    },
    {
      test: /[0-9]/.test(password),
      label: 'Número',
      description: 'Debe incluir al menos un número'
    },
    {
      test: /[!@#$%^&*(),.?":{}|<>]/.test(password),
      label: 'Especial',
      description: 'Debe incluir al menos un carácter especial'
    }
  ];

  const passedRequirements = requirements.filter(req => req.test);
  const score = passedRequirements.length / requirements.length;
  
  let strength: 'weak' | 'medium' | 'strong';
  if (score < 0.4) {
    strength = 'weak';
  } else if (score < 0.8) {
    strength = 'medium';
  } else {
    strength = 'strong';
  }

  const errors = requirements
    .filter(req => !req.test)
    .map(req => req.description);

  return {
    isValid: passedRequirements.length === requirements.length,
    errors,
    requirements,
    strength,
    score
  };
};

/**
 * Valida que dos contraseñas coincidan
 */
export const validatePasswordMatch = (password: string, confirmPassword: string): boolean => {
  return password === confirmPassword;
};

/**
 * Obtiene el color para el indicador de fortaleza
 */
export const getStrengthColor = (strength: 'weak' | 'medium' | 'strong'): string => {
  switch (strength) {
    case 'weak':
      return 'bg-red-500';
    case 'medium':
      return 'bg-yellow-500';
    case 'strong':
      return 'bg-green-500';
    default:
      return 'bg-gray-300';
  }
};

/**
 * Obtiene el texto para el indicador de fortaleza
 */
export const getStrengthText = (strength: 'weak' | 'medium' | 'strong'): string => {
  switch (strength) {
    case 'weak':
      return 'Débil';
    case 'medium':
      return 'Media';
    case 'strong':
      return 'Fuerte';
    default:
      return 'Sin evaluar';
  }
};

/**
 * Genera una contraseña segura aleatoria
 */
export const generateSecurePassword = (length: number = 12): string => {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*(),.?":{}|<>';
  
  const allChars = lowercase + uppercase + numbers + symbols;
  
  let password = '';
  
  // Asegurar que tenga al menos un carácter de cada tipo
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  
  // Completar el resto de la longitud
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Mezclar los caracteres
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

/**
 * Valida el formato de email
 */
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};
