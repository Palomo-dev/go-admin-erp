'use client';

import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import CreateOrganizationForm from './CreateOrganizationForm';
import { X } from 'lucide-react';

interface CreateOrganizationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEmail?: string;
  onSuccess?: (data: any) => void;
}

export default function CreateOrganizationDialog({
  isOpen,
  onClose,
  defaultEmail = '',
  onSuccess
}: CreateOrganizationDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  
  // Cerrar el diálogo al hacer clic fuera del contenido
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dialogRef.current && !dialogRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);
  
  // Efecto para manejar la tecla Escape
  useEffect(() => {
    function handleEscapeKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey);
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isOpen, onClose]);
  
  // Efectos de montaje y manejo del scroll
  useEffect(() => {
    setMounted(true);
    
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);
  
  if (!isOpen || !mounted) return null;
  
  // Usar portal para renderizar el diálogo en el nivel del documento
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div 
        ref={dialogRef}
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-lg shadow-xl m-4"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            Crear Nueva Organización
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 focus:outline-none"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4">
          <CreateOrganizationForm
            onSuccess={(data) => {
              if (onSuccess) {
                onSuccess(data);
              }
              onClose();
            }}
            onCancel={onClose}
            defaultEmail={defaultEmail}
            isSignupMode={false}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
