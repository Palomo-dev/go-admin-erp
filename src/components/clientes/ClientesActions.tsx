import React, { useState } from 'react';
import { 
  Download, Tag, Users, Plus, 
  Loader2, CheckCircle, AlertCircle 
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from '@/lib/supabase/config';

interface ClientesActionsProps {
  onExportCSV: () => void;
  selectedCustomers: string[];
}

const ClientesActions: React.FC<ClientesActionsProps> = ({
  onExportCSV,
  selectedCustomers
}) => {
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [tagName, setTagName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Función para aplicar etiqueta a clientes seleccionados
  const handleApplyTag = async () => {
    if (!tagName.trim() || !selectedCustomers.length) {
      setStatusMessage({ type: 'error', message: 'Ingresa una etiqueta y selecciona al menos un cliente' });
      return;
    }

    setIsProcessing(true);
    setStatusMessage({ type: 'info', message: 'Aplicando etiqueta...' });

    try {
      for (const customerId of selectedCustomers) {
        // Primero obtenemos el cliente y sus etiquetas actuales
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .select('tags')
          .eq('id', customerId)
          .single();

        if (customerError) throw customerError;

        // Añadimos la nueva etiqueta si no existe
        const currentTags = customerData.tags || [];
        if (!currentTags.includes(tagName)) {
          const updatedTags = [...currentTags, tagName];

          const { error: updateError } = await supabase
            .from('customers')
            .update({ tags: updatedTags })
            .eq('id', customerId);

          if (updateError) throw updateError;
        }
      }

      setStatusMessage({ type: 'success', message: `Etiqueta "${tagName}" aplicada a ${selectedCustomers.length} clientes` });
      
      // Cerrar el diálogo después de 2 segundos
      setTimeout(() => {
        setIsTagDialogOpen(false);
        setTagName('');
        setStatusMessage(null);
      }, 2000);
    } catch (error: any) {
      console.error('Error al aplicar etiqueta:', error);
      setStatusMessage({ type: 'error', message: `Error: ${error.message}` });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNewCustomerClick = () => {
    window.location.href = '/app/clientes/nuevo';
  };

  return (
    <div className="flex items-center space-x-2">
      <TooltipProvider>
        {/* Nuevo cliente */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="default"
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              onClick={() => window.location.href = '/app/clientes/new'}
            >
              <Plus className="w-4 h-4 mr-1" />
              Nuevo cliente
            </Button>
          </TooltipTrigger>
          <TooltipContent>Crear un nuevo cliente</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={!selectedCustomers.length}
              onClick={() => setIsTagDialogOpen(true)}
              className="text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Tag className="w-4 h-4 mr-1" />
              Etiquetar
            </Button>
          </TooltipTrigger>
          <TooltipContent>Aplicar etiquetas a clientes seleccionados</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={!selectedCustomers.length}
              onClick={() => setIsMergeDialogOpen(true)}
              className="text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Users className="w-4 h-4 mr-1" />
              Unificar
            </Button>
          </TooltipTrigger>
          <TooltipContent>Unificar clientes duplicados</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={onExportCSV}
              className="text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Download className="w-4 h-4 mr-1" />
            Exportar
          </Button>
        </TooltipTrigger>
        <TooltipContent>Exportar a CSV</TooltipContent>
      </Tooltip>
      </TooltipProvider>

      <Dialog open={isTagDialogOpen} onOpenChange={setIsTagDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Etiquetar clientes</DialogTitle>
            <DialogDescription>
              Aplica una etiqueta a los {selectedCustomers.length} clientes seleccionados.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="tag">Etiqueta</Label>
              <Input 
                id="tag" 
                value={tagName} 
                onChange={(e) => setTagName(e.target.value)} 
                placeholder="Nombre de etiqueta" 
                disabled={isProcessing}
              />
            </div>
          </div>
          
          {statusMessage && (
            <div className={`
              flex items-center p-3 rounded-md text-sm
              ${statusMessage.type === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 
                statusMessage.type === 'error' ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'}
            `}>
              {statusMessage.type === 'success' ? (
                <CheckCircle className="h-4 w-4 mr-2" />
              ) : statusMessage.type === 'error' ? (
                <AlertCircle className="h-4 w-4 mr-2" />
              ) : (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {statusMessage.message}
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsTagDialogOpen(false)}
              disabled={isProcessing}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleApplyTag}
              disabled={!tagName.trim() || isProcessing}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando...
                </>
              ) : 'Aplicar etiqueta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fusionar duplicados */}
      <Dialog open={isMergeDialogOpen} onOpenChange={setIsMergeDialogOpen}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                disabled={selectedCustomers.length < 2}
                onClick={() => setIsMergeDialogOpen(true)}
              >
                <Users className="h-4 w-4" />
                <span className="sr-only">Fusionar duplicados</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Fusionar duplicados</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Fusionar clientes duplicados</DialogTitle>
            <DialogDescription>
              Fusiona {selectedCustomers.length} clientes seleccionados. Selecciona el cliente principal que conservará toda la información.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
              Funcionalidad de fusión de clientes en desarrollo. Esta función permitirá combinar
              datos de clientes duplicados preservando el historial de transacciones.
            </p>

            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-md text-sm text-yellow-700 dark:text-yellow-300 flex items-center">
              <AlertCircle className="h-4 w-4 mr-2" />
              La fusión de clientes es una operación que no se puede deshacer
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsMergeDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button 
              disabled
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Fusionar clientes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientesActions;
