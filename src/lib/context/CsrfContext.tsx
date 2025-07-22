import React, { createContext, useContext, useEffect, useState } from 'react';

interface CsrfContextType {
  csrfToken: string | null;
  isLoading: boolean;
}

const CsrfContext = createContext<CsrfContextType>({
  csrfToken: null,
  isLoading: true
});

export const useCsrf = () => useContext(CsrfContext);

export const CsrfProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Intentamos obtener el token CSRF del encabezado enviado por el middleware
    const token = document.head.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    if (token) {
      setCsrfToken(token);
      setIsLoading(false);
    } else {
      // Si no está disponible en el meta tag, solicitamos un nuevo token
      fetch('/api/csrf', {
        method: 'GET',
        credentials: 'same-origin',
      })
        .then(response => {
          // El token CSRF debe estar en el encabezado de respuesta
          const token = response.headers.get('X-CSRF-Token');
          if (token) {
            setCsrfToken(token);
          }
          return response.json();
        })
        .catch(err => {
          console.error('Error al obtener el token CSRF:', err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, []);

  return (
    <CsrfContext.Provider value={{ csrfToken, isLoading }}>
      {children}
    </CsrfContext.Provider>
  );
};
