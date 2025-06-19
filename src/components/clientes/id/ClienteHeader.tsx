'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTheme } from 'next-themes';

// Interfaz para las props del componente
interface ClienteHeaderProps {
  cliente: {
    id: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    email?: string;
    tags?: string[];
  };
}

// Componente para el avatar del cliente
const ClienteAvatar = ({ name, className = '' }: { name: string; className?: string }) => {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
    
  return (
    <div className={`relative flex items-center justify-center bg-primary/10 text-primary rounded-full ${className}`}>
      <span className="text-xl font-semibold">{initials}</span>
    </div>
  );
};

// Componente para mostrar el nivel de fidelidad del cliente
const NivelFidelidad = ({ nivel = 'Básico' }: { nivel?: string }) => {
  const { theme } = useTheme();
  
  let color = 'bg-gray-100 text-gray-800';
  
  switch(nivel.toLowerCase()) {
    case 'oro':
      color = 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-500';
      break;
    case 'plata':
      color = 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
      break;
    case 'bronce':
      color = 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-500';
      break;
    default:
      color = 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-500';
  }
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {nivel}
    </span>
  );
};

// Componente principal del encabezado del cliente
export default function ClienteHeader({ cliente }: ClienteHeaderProps) {
  const nombreCompleto = cliente.full_name || `${cliente.first_name || ''} ${cliente.last_name || ''}`.trim();
  
  // Determinar el nivel de fidelidad basado en tags (si existen)
  const nivelFidelidad = cliente.tags?.includes('oro') 
    ? 'Oro' 
    : cliente.tags?.includes('plata') 
      ? 'Plata' 
      : cliente.tags?.includes('bronce') 
        ? 'Bronce' 
        : 'Básico';
  
  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
      <div className="flex items-center gap-4">
        <ClienteAvatar name={nombreCompleto} className="w-16 h-16" />
        
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{nombreCompleto}</h1>
          
          <div className="mt-1 flex items-center gap-3">
            {cliente.email && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {cliente.email}
              </span>
            )}
            
            <NivelFidelidad nivel={nivelFidelidad} />
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-3 mt-4 md:mt-0 w-full md:w-auto">
        {/* Botón para volver a la lista de clientes */}
        <Link
          href="/app/clientes"
          className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          <span>Volver</span>
        </Link>
        
        {/* Botón para editar cliente */}
        <Link
          href={`/app/clientes/${cliente.id}/editar`}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
          </svg>
          <span>Editar</span>
        </Link>
      </div>
    </div>
  );
}
