'use client';
import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface NumericInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  className?: string;
}

/**
 * Componente NumericInput que implementa la regla UX para inputs numéricos
 * Al enfocar, si el valor es 0, se borra para facilitar la edición
 * Al perder el foco, si el valor está vacío, se establece a 0
 */
export function NumericInput({
  label,
  defaultValue = 0,
  onValueChange,
  className,
  ...props
}: NumericInputProps) {
  const [value, setValue] = useState<string>(defaultValue.toString());

  useEffect(() => {
    setValue(defaultValue.toString());
  }, [defaultValue]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Si el valor es 0, limpiamos el campo para facilitar la edición
    if (e.target.value === '0') {
      setValue('');
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Si el valor está vacío, lo establecemos a 0
    if (e.target.value === '') {
      setValue('0');
      if (onValueChange) onValueChange(0);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    
    // Permitimos campo vacío o valores numéricos
    if (newValue === '' || /^[0-9]+$/.test(newValue)) {
      setValue(newValue);
      if (onValueChange) onValueChange(newValue === '' ? 0 : parseInt(newValue, 10));
    }
  };

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <Input
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={className}
        inputMode="numeric"
        {...props}
      />
    </div>
  );
}
