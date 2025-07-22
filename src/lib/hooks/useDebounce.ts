import { useState, useEffect } from 'react';

/**
 * Hook personalizado para debounce de valores
 * Útil para retrasar la ejecución de operaciones costosas como búsquedas
 * 
 * @param value - El valor a aplicar debounce
 * @param delay - El retraso en milisegundos (por defecto 500ms)
 * @returns - El valor con debounce aplicado
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Configurar un temporizador para actualizar el valor debounceado después del delay
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Limpiar el temporizador si el valor cambia antes de que termine el delay
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
