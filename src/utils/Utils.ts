import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combina clases CSS de manera condicional y las procesa con tailwind-merge
 * para resolver conflictos en las utilidades de Tailwind CSS.
 *
 * @param inputs - Lista de clases CSS que pueden ser strings, objetos, arrays o undefined
 * @returns String con las clases CSS combinadas
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formatea un valor decimal como una cadena de moneda
 * 
 * @param amount - Monto a formatear
 * @param currency - Código de moneda (por defecto COP)
 * @param locale - Configuración regional (por defecto es-CO)
 * @returns Cadena formateada como moneda
 */
export function formatCurrency(amount: number, currency: string = 'COP', locale: string = 'es-CO'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Formatea una fecha en formato legible
 * 
 * @param date - Fecha a formatear (puede ser Date, string ISO o timestamp)
 * @param format - Formato opcional de salida ('short', 'long', 'yyyy-MM-dd', etc)
 * @param locale - Configuración regional (por defecto es-ES)
 * @returns Cadena de fecha formateada
 */
export function formatDate(date: Date | string | number, format: string = 'short', locale: string = 'es-ES'): string {
  if (!date) return '';
  
  try {
    // Convertir a objeto Date si es string o número
    const dateObj = typeof date === 'string' || typeof date === 'number' 
      ? new Date(date) 
      : date;
    
    // Verificar si es una fecha válida
    if (isNaN(dateObj.getTime())) {
      return '';
    }
    
    // Formatos predefinidos
    switch (format) {
      case 'short':
        return new Intl.DateTimeFormat(locale, {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }).format(dateObj);
      
      case 'long':
        return new Intl.DateTimeFormat(locale, {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(dateObj);
        
      case 'yyyy-MM-dd':
        return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
      
      default:
        return new Intl.DateTimeFormat(locale, {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }).format(dateObj);
    }
  } catch (error) {
    console.error('Error al formatear fecha:', error);
    return '';
  }
}

/**
 * Función de debounce que limita la frecuencia de ejecución de una función
 * 
 * @param func - La función a ejecutar con debounce
 * @param wait - Tiempo de espera en milisegundos (por defecto 300ms)
 * @returns Función con debounce aplicado
 */
export function debounce<T extends (...args: any[]) => any>(func: T, wait: number = 300): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}
