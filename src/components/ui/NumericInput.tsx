'use client';

import React, { useState, useEffect, forwardRef } from 'react';
import { Input } from '@/components/ui/input';

interface NumericInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  allowDecimal?: boolean;
  decimalPlaces?: number;
  min?: number;
  max?: number;
}

/**
 * Componente de entrada numérica que implementa la regla UX:
 * Al hacer focus, el valor 0 desaparece automáticamente.
 * Al perder el focus, si el campo está vacío, se establece en 0.
 */
const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(
  ({ defaultValue = 0, onValueChange, allowDecimal = true, decimalPlaces = 2, min, max, ...props }, ref) => {
    const [inputValue, setInputValue] = useState<string>(defaultValue === 0 ? '0' : defaultValue.toString());
    const [isFocused, setIsFocused] = useState(false);

    // Formatear el valor al inicio
    useEffect(() => {
      if (defaultValue !== undefined) {
        setInputValue(defaultValue === 0 ? '0' : defaultValue.toString());
      }
    }, [defaultValue]);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      // Regla UX: al hacer focus, si el valor es 0, limpiar el campo
      if (e.target.value === '0') {
        setInputValue('');
      }
      props.onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      // Regla UX: al perder el focus, si el campo está vacío, establecer en 0
      if (e.target.value === '') {
        setInputValue('0');
        onValueChange?.(0);
      } else {
        // Validar min/max al perder el foco
        let numValue = parseFloat(e.target.value);
        if (min !== undefined && numValue < min) {
          numValue = min;
          setInputValue(min.toString());
        }
        if (max !== undefined && numValue > max) {
          numValue = max;
          setInputValue(max.toString());
        }
        onValueChange?.(numValue);
      }
      props.onBlur?.(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      
      // Permitir campo vacío durante la edición
      if (value === '') {
        setInputValue('');
        return;
      }

      // Validar que sea un número válido (entero o decimal según configuración)
      const regex = allowDecimal ? /^-?\d*\.?\d*$/ : /^-?\d*$/;
      if (regex.test(value)) {
        setInputValue(value);
        
        // Notificar el cambio de valor si es un número válido
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          onValueChange?.(numValue);
        }
      }
    };

    // Mostrar valor vacío cuando está enfocado y el valor es 0
    const displayValue = isFocused && inputValue === '0' ? '' : inputValue;

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        inputMode={allowDecimal ? 'decimal' : 'numeric'}
      />
    );
  }
);

NumericInput.displayName = 'NumericInput';

export { NumericInput };
