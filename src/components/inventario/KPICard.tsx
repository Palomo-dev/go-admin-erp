import { FC } from 'react';

interface KPICardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
  variant?: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'default';
}

const KPICard: FC<KPICardProps> = ({ title, value, icon, trend, className, variant = 'default' }) => {
  // Configuración de colores basados en la variante
  const colorConfig = {
    default: {
      bg: 'bg-white',
      border: '',
      title: 'text-gray-500',
      icon: 'text-blue-500 bg-blue-50'
    },
    blue: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border border-blue-100 dark:border-blue-800',
      title: 'text-blue-700 dark:text-blue-300',
      value: 'text-blue-800 dark:text-blue-200',
      icon: 'text-blue-600 bg-blue-100'
    },
    green: {
      bg: 'bg-green-50 dark:bg-green-900/20',
      border: 'border border-green-100 dark:border-green-800',
      title: 'text-green-700 dark:text-green-300',
      value: 'text-green-800 dark:text-green-200',
      icon: 'text-green-600 bg-green-100'
    },
    amber: {
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      border: 'border border-amber-100 dark:border-amber-800',
      title: 'text-amber-700 dark:text-amber-300',
      value: 'text-amber-800 dark:text-amber-200',
      icon: 'text-amber-600 bg-amber-100'
    },
    red: {
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border border-red-100 dark:border-red-800',
      title: 'text-red-700 dark:text-red-300',
      value: 'text-red-800 dark:text-red-200',
      icon: 'text-red-600 bg-red-100'
    },
    purple: {
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      border: 'border border-purple-100 dark:border-purple-800',
      title: 'text-purple-700 dark:text-purple-300',
      value: 'text-purple-800 dark:text-purple-200',
      icon: 'text-purple-600 bg-purple-100'
    }
  };
  
  const colors = colorConfig[variant];
  return (
    <div className={`${colors.bg} rounded-lg shadow-md p-4 ${colors.border} ${className}`}>
      <div className="flex justify-between items-start">
        <div>
          <p className={`text-sm font-medium ${colors.title || 'text-gray-500'}`}>{title}</p>
          <h3 className={`text-2xl font-bold mt-1 ${'value' in colors ? colors.value : 'text-gray-900'}`}>{value}</h3>
          {trend && (
            <div className="flex items-center mt-1">
              <span
                className={`text-xs ${
                  trend.isPositive ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {trend.isPositive ? '+' : '-'}{Math.abs(trend.value)}%
              </span>
              <span className="text-xs text-gray-500 ml-1">vs mes anterior</span>
            </div>
          )}
        </div>
        {icon && <div className={`p-2 rounded-full ${colors.icon ?? 'text-blue-500 bg-blue-50'}`}>{icon}</div>}
      </div>
    </div>
  );
};

export default KPICard;
