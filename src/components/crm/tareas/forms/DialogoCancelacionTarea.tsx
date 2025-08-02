'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/**
 * Props para el componente DialogoCancelacionTarea
 * @interface DialogoCancelacionProps
 * @property {boolean} abierto - Indica si el diálogo está abierto
 * @property {Function} onClose - Función para cerrar el diálogo
 * @property {Function} onConfirmar - Función para confirmar la cancelación con el motivo
 * @property {string} motivoInicial - Motivo inicial si existe (opcional)
 */
interface DialogoCancelacionProps {
  abierto: boolean;
  onClose: () => void;
  onConfirmar: (motivo: string) => Promise<void>;
  motivoInicial?: string;
}

/**
 * Componente para mostrar un diálogo de cancelación de tarea
 * Permite al usuario ingresar un motivo para cancelar la tarea
 * @param {DialogoCancelacionProps} props - Propiedades del componente
 * @returns {JSX.Element | null} Componente React
 */
const DialogoCancelacionTarea = ({ 
  abierto, 
  onClose, 
  onConfirmar, 
  motivoInicial = '' 
}: DialogoCancelacionProps) => {
  // Estado local para el motivo de cancelación
  const [motivo, setMotivo] = useState(motivoInicial);
  // Estado para indicar si está en proceso de confirmación
  const [confirmando, setConfirmando] = useState(false);

  // Función para manejar la confirmación
  const handleConfirmacion = async () => {
    try {
      setConfirmando(true);
      await onConfirmar(motivo);
    } catch (error) {
      console.error('Error al confirmar cancelación:', error);
    } finally {
      setConfirmando(false);
    }
  };

  return (
    <Dialog 
      open={abierto} 
      onOpenChange={(open) => {
        // Solo permitir cerrar si no está en proceso de confirmación
        if (!confirmando && open === false) {
          onClose();
        }
      }}
      modal={true}
    >
      <DialogContent 
        className="max-w-md mx-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Cancelar tarea</DialogTitle>
          <DialogDescription className="pt-2">
            Indica el motivo de la cancelación para mantener un registro.
          </DialogDescription>
        </DialogHeader>
        
        <Textarea
          placeholder="Motivo de la cancelación"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className="mt-2"
          disabled={confirmando}
        />
        
        <DialogFooter className="mt-4">
          <Button 
            variant="outline" 
            onClick={onClose}
            disabled={confirmando}
          >
            Volver
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleConfirmacion}
            disabled={confirmando}
          >
            {confirmando ? 'Procesando...' : 'Cancelar tarea'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DialogoCancelacionTarea;
