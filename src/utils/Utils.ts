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
 * @param value - Monto a formatear
 * @param currency - Código de moneda (por defecto COP)
 * @returns Cadena formateada como moneda
 */
// Esta función queda obsoleta y solo redirige al servicio
// Se mantiene por compatibilidad con el código existente
export function formatCurrency(value: number, currency: string = "COP"): string {
  // Importar el servicio causaría un error de dependencia circular
  // así que implementamos el formato aquí
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  } catch (error) {
    // Si hay error con el formato (ej: moneda inválida), usar formato simple
    return `${currency} ${value.toFixed(2)}`;
  }
}

/**
 * Formatea una fecha en formato legible
 * 
 * @param date - Fecha a formatear (Date, string o null/undefined)
 * @param locale - Configuración regional (por defecto es-ES)
 * @returns Cadena de fecha formateada
 */
export function formatDate(date: Date | string | null | undefined, locale: string = 'es-ES'): string {
  // Manejar valores null/undefined
  if (!date) {
    return 'Sin fecha';
  }
  
  let dateObject: Date;
  
  // Convertir string a Date si es necesario
  if (typeof date === 'string') {
    dateObject = new Date(date);
  } else {
    dateObject = date;
  }
  
  // Verificar que la fecha sea válida
  if (isNaN(dateObject.getTime())) {
    return 'Fecha inválida';
  }
  
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(dateObject);
}

/**
 * Formatea un número como porcentaje
 * 
 * @param value - Valor a formatear como porcentaje
 * @param decimalPlaces - Número de decimales a mostrar (por defecto 2)
 * @param includeSymbol - Incluir el símbolo % (por defecto true)
 * @returns Cadena formateada como porcentaje
 */
export function formatPercent(value: number, decimalPlaces: number = 2, includeSymbol: boolean = true): string {
  const formatted = Number(value).toFixed(decimalPlaces);
  return includeSymbol ? `${formatted}%` : formatted;
}

/**
 * Formatea un número con separadores de miles
 * 
 * @param value - Valor numérico a formatear
 * @param decimalPlaces - Número de decimales a mostrar (por defecto 2)
 * @param locale - Configuración regional (por defecto es-CO)
 * @returns Cadena formateada con separadores de miles
 */
export function formatNumber(value: number, decimalPlaces: number = 2, locale: string = 'es-CO'): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces
  }).format(value);
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

/**
 * Genera un ID único
 * @returns String con ID único
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Tipo para el modo de tema
 */
export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Obtiene el tema actual del sistema
 * 
 * @returns El tema actual ('light' o 'dark')
 */
export function getCurrentTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  
  // Verificar si hay un tema guardado en localStorage
  const savedTheme = localStorage.getItem('theme') as ThemeMode | null;
  
  if (savedTheme) return savedTheme;
  
  // Si no hay tema guardado, detectar preferencia del sistema
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

/**
 * Aplica un tema específico a la interfaz
 * 
 * @param theme - El tema a aplicar ('light', 'dark' o 'system')
 */
export function applyTheme(theme: ThemeMode): void {
  if (typeof window === 'undefined') return;
  
  const root = window.document.documentElement;
  
  if (theme === 'system') {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
    
    root.classList.toggle('dark', systemTheme === 'dark');
    return;
  }
  
  // Aplicar tema y color azul principal
  root.classList.toggle('dark', theme === 'dark');
  root.style.setProperty('--primary', theme === 'dark' ? '210 100% 50%' : '210 100% 50%');
  localStorage.setItem('theme', theme);
  
  // Disparar evento para que otros componentes actualicen su tema
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme } }));
}

