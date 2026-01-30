'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { transportService, TransportCarrier } from '@/lib/services/transportService';
import { 
  CarriersHeader, 
  CarriersList, 
  CarrierDialog,
  TrackingPreviewDialog,
  ApiCredentialsDialog,
  ImportCarriersDialog
} from '@/components/transporte/transportadoras';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function TransportadorasPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [carriers, setCarriers] = useState<TransportCarrier[]>([]);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Dialogs
  const [showDialog, setShowDialog] = useState(false);
  const [selectedCarrier, setSelectedCarrier] = useState<TransportCarrier | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [carrierToDelete, setCarrierToDelete] = useState<TransportCarrier | null>(null);
  const [showTrackingDialog, setShowTrackingDialog] = useState(false);
  const [trackingCarrier, setTrackingCarrier] = useState<TransportCarrier | null>(null);
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false);
  const [credentialsCarrier, setCredentialsCarrier] = useState<TransportCarrier | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const loadData = useCallback(async () => {
    if (!organization?.id) return;
    
    setIsLoading(true);
    try {
      const data = await transportService.getCarriers(organization.id);
      setCarriers(data);
    } catch (error) {
      console.error('Error cargando transportadoras:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las transportadoras',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredCarriers = carriers.filter((c) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = 
      c.name.toLowerCase().includes(term) ||
      c.code.toLowerCase().includes(term) ||
      (c.tax_id && c.tax_id.toLowerCase().includes(term));
    
    const matchesType = typeFilter === 'all' || c.carrier_type === typeFilter;
    const matchesService = serviceFilter === 'all' || c.service_type === serviceFilter;
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'active' ? c.is_active : !c.is_active);
    
    return matchesSearch && matchesType && matchesService && matchesStatus;
  });

  const handleNew = () => {
    setSelectedCarrier(null);
    setShowDialog(true);
  };

  const handleEdit = (carrier: TransportCarrier) => {
    setSelectedCarrier(carrier);
    setShowDialog(true);
  };

  const handleDelete = (carrier: TransportCarrier) => {
    setCarrierToDelete(carrier);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!carrierToDelete) return;
    
    try {
      await transportService.deleteCarrier(carrierToDelete.id);
      toast({
        title: 'Éxito',
        description: 'Transportadora eliminada correctamente',
      });
      loadData();
    } catch (error) {
      console.error('Error eliminando transportadora:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la transportadora',
        variant: 'destructive',
      });
    } finally {
      setShowDeleteDialog(false);
      setCarrierToDelete(null);
    }
  };

  const handleSave = async (data: Partial<TransportCarrier>) => {
    if (!organization?.id) return;
    
    setIsSaving(true);
    try {
      if (selectedCarrier) {
        await transportService.updateCarrier(selectedCarrier.id, data);
        toast({
          title: 'Éxito',
          description: 'Transportadora actualizada correctamente',
        });
      } else {
        await transportService.createCarrier({
          ...data,
          organization_id: organization.id,
        });
        toast({
          title: 'Éxito',
          description: 'Transportadora creada correctamente',
        });
      }
      setShowDialog(false);
      loadData();
    } catch (error) {
      console.error('Error guardando transportadora:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar la transportadora',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicate = (carrier: TransportCarrier) => {
    setSelectedCarrier({
      ...carrier,
      id: '',
      code: `${carrier.code}-COPY`,
      name: `${carrier.name} (Copia)`,
    } as TransportCarrier);
    setShowDialog(true);
  };

  const handleToggleStatus = async (carrier: TransportCarrier) => {
    try {
      await transportService.updateCarrier(carrier.id, { is_active: !carrier.is_active });
      toast({
        title: 'Éxito',
        description: carrier.is_active ? 'Transportadora desactivada' : 'Transportadora activada',
      });
      loadData();
    } catch (error) {
      console.error('Error cambiando estado:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado',
        variant: 'destructive',
      });
    }
  };

  const handleTestTracking = (carrier: TransportCarrier) => {
    setTrackingCarrier(carrier);
    setShowTrackingDialog(true);
  };

  const handleManageCredentials = (carrier: TransportCarrier) => {
    setCredentialsCarrier(carrier);
    setShowCredentialsDialog(true);
  };

  interface ApiCredentials {
    api_key?: string;
    api_secret?: string;
    username?: string;
    password?: string;
    sandbox_mode?: boolean;
    custom_config?: string;
  }

  const handleSaveCredentials = async (carrierId: string, credentials: ApiCredentials) => {
    setIsSaving(true);
    try {
      const currentCarrier = carriers.find(c => c.id === carrierId);
      const updatedMetadata = {
        ...(currentCarrier?.metadata || {}),
        api_key: credentials.api_key,
        api_username: credentials.username,
        sandbox_mode: credentials.sandbox_mode,
        custom_config: credentials.custom_config ? JSON.parse(credentials.custom_config) : undefined,
      };
      
      await transportService.updateCarrier(carrierId, { metadata: updatedMetadata });
      toast({
        title: 'Éxito',
        description: 'Credenciales guardadas correctamente',
      });
      setShowCredentialsDialog(false);
      loadData();
    } catch (error) {
      console.error('Error guardando credenciales:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron guardar las credenciales',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleImport = async (carriersToImport: Partial<TransportCarrier>[]) => {
    if (!organization?.id) return { success: 0, errors: ['Organización no disponible'] };
    
    let success = 0;
    const errors: string[] = [];
    
    for (const carrier of carriersToImport) {
      try {
        await transportService.createCarrier({
          ...carrier,
          organization_id: organization.id,
        });
        success++;
      } catch (error) {
        errors.push(`${carrier.code}: ${String(error)}`);
      }
    }
    
    if (success > 0) {
      loadData();
    }
    
    return { success, errors };
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <CarriersHeader
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        serviceFilter={serviceFilter}
        onServiceFilterChange={setServiceFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onNew={handleNew}
        onImport={() => setShowImportDialog(true)}
        onRefresh={loadData}
        isLoading={isLoading}
      />

      <CarriersList
        carriers={filteredCarriers}
        isLoading={isLoading}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        onToggleStatus={handleToggleStatus}
        onTestTracking={handleTestTracking}
        onManageCredentials={handleManageCredentials}
      />

      <CarrierDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        carrier={selectedCarrier}
        onSave={handleSave}
        isSaving={isSaving}
      />

      <TrackingPreviewDialog
        open={showTrackingDialog}
        onOpenChange={setShowTrackingDialog}
        carrier={trackingCarrier}
      />

      <ApiCredentialsDialog
        open={showCredentialsDialog}
        onOpenChange={setShowCredentialsDialog}
        carrier={credentialsCarrier}
        onSave={handleSaveCredentials}
        isSaving={isSaving}
      />

      <ImportCarriersDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImport={handleImport}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar transportadora?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará la transportadora
              <strong> {carrierToDelete?.name}</strong> permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
