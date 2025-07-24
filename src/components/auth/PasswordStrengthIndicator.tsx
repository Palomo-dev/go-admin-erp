'use client';

interface PasswordStrengthIndicatorProps {
  password: string;
  className?: string;
}

export default function PasswordStrengthIndicator({ 
  password, 
  className = "" 
}: PasswordStrengthIndicatorProps) {
  const requirements = [
    { test: password.length >= 8, label: '8+ caracteres' },
    { test: /[A-Z]/.test(password), label: 'Mayúscula' },
    { test: /[a-z]/.test(password), label: 'Minúscula' },
    { test: /[0-9]/.test(password), label: 'Número' },
    { test: /[!@#$%^&*(),.?":{}|<>]/.test(password), label: 'Especial' }
  ];

  const passedRequirements = requirements.filter(req => req.test).length;
  const strengthLevel = passedRequirements / requirements.length;

  const getStrengthColor = () => {
    if (strengthLevel < 0.4) return 'bg-red-500';
    if (strengthLevel < 0.7) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStrengthText = () => {
    if (strengthLevel < 0.4) return 'Débil';
    if (strengthLevel < 0.7) return 'Media';
    return 'Fuerte';
  };

  if (!password) return null;

  return (
    <div className={`mt-2 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-600">Fortaleza de la contraseña:</div>
        <div className="text-xs font-medium text-gray-700">{getStrengthText()}</div>
      </div>
      
      {/* Barra de progreso */}
      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
        <div 
          className={`h-2 rounded-full transition-all duration-300 ${getStrengthColor()}`}
          style={{ width: `${strengthLevel * 100}%` }}
        ></div>
      </div>
      
      {/* Indicadores de requisitos */}
      <div className="flex flex-wrap gap-1">
        {requirements.map((requirement, index) => (
          <div
            key={index}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              requirement.test
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {requirement.label}
          </div>
        ))}
      </div>
    </div>
  );
}
