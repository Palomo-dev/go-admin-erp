import { useState, useEffect } from 'react';

/**
 * Hook para detectar si el componente ya se ha montado en el cliente
 * Útil para prevenir errores de hidratación en componentes que deben renderizarse diferente
 * entre servidor y cliente
 */
export function useHasMounted() {
  const [hasMounted, setHasMounted] = useState(false);
  
  useEffect(() => {
    setHasMounted(true);
  }, []);
  
  return hasMounted;
}
