'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import {
  customerAddressesService,
  CustomerAddress,
  CustomerAddressInput,
} from '@/lib/services/customerAddressesService';
import {
  AddressesHeader,
  AddressesList,
  AddressDialog,
  ImportAddressesDialog,
} from '@/components/transporte/direcciones-clientes';
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
import { googleMapsService } from '@/lib/services/googleMapsService';

interface Customer {
  id: string;
  first_name: string;
  last_name: string;
}

export default function DireccionesClientesPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();

  const [isLoading, setIsLoading] = useState(true);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<CustomerAddress | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState<CustomerAddress | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('all');

  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    setIsLoading(true);
    try {
      const data = await customerAddressesService.getAddresses(organization.id);
      setAddresses(data);
    } catch (error) {
      console.error('Error cargando direcciones:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las direcciones',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleNewAddress = () => {
    setSelectedAddress(null);
    setDialogOpen(true);
  };

  const handleEdit = (address: CustomerAddress) => {
    setSelectedAddress(address);
    setDialogOpen(true);
  };

  const handleSave = async (data: CustomerAddressInput) => {
    if (!organization?.id) return;

    try {
      if (selectedAddress) {
        await customerAddressesService.updateAddress(selectedAddress.id, organization.id, data);
        toast({ title: 'Dirección actualizada', description: 'Los cambios han sido guardados' });
      } else {
        await customerAddressesService.createAddress(organization.id, data);
        toast({ title: 'Dirección creada', description: 'La dirección ha sido agregada' });
      }
      loadData();
    } catch (error) {
      console.error('Error guardando dirección:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar la dirección',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleDelete = (address: CustomerAddress) => {
    setAddressToDelete(address);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!addressToDelete) return;

    try {
      await customerAddressesService.deleteAddress(addressToDelete.id);
      toast({ title: 'Dirección eliminada', description: 'La dirección ha sido eliminada' });
      loadData();
    } catch (error) {
      console.error('Error eliminando dirección:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la dirección',
        variant: 'destructive',
      });
    } finally {
      setDeleteDialogOpen(false);
      setAddressToDelete(null);
    }
  };

  const handleDuplicate = async (address: CustomerAddress) => {
    if (!organization?.id) return;

    try {
      await customerAddressesService.duplicateAddress(address.id, organization.id);
      toast({ title: 'Dirección duplicada', description: 'Se ha creado una copia de la dirección' });
      loadData();
    } catch (error) {
      console.error('Error duplicando dirección:', error);
      toast({
        title: 'Error',
        description: 'No se pudo duplicar la dirección',
        variant: 'destructive',
      });
    }
  };

  const handleSetDefault = async (address: CustomerAddress) => {
    if (!organization?.id) return;

    try {
      await customerAddressesService.setAsDefault(address.id, organization.id, address.customer_id);
      toast({ title: 'Dirección actualizada', description: 'Se ha marcado como dirección por defecto' });
      loadData();
    } catch (error) {
      console.error('Error actualizando dirección:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la dirección',
        variant: 'destructive',
      });
    }
  };

  const handleValidateCoords = async (address: CustomerAddress) => {
    if (!organization?.id || !address.address_line1 || !address.city) return;

    try {
      const fullAddress = `${address.address_line1}, ${address.city}, ${address.department || ''}, Colombia`;
      const result = await googleMapsService.geocode(fullAddress);
      
      if (result) {
        await customerAddressesService.updateAddress(address.id, organization.id, {
          customer_id: address.customer_id,
          latitude: result.location.lat,
          longitude: result.location.lng,
          google_place_id: result.placeId,
        });
        toast({ title: 'Coordenadas validadas', description: 'Las coordenadas han sido actualizadas' });
        loadData();
      } else {
        toast({ title: 'No encontrado', description: 'No se pudo geocodificar la dirección', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error validando coordenadas:', error);
      toast({ title: 'Error', description: 'No se pudo validar las coordenadas', variant: 'destructive' });
    }
  };

  // Lista de clientes únicos para el filtro
  const customers = useMemo(() => {
    const uniqueCustomers = new Map<string, Customer>();
    addresses.forEach(addr => {
      if (addr.customers && !uniqueCustomers.has(addr.customer_id)) {
        uniqueCustomers.set(addr.customer_id, {
          id: addr.customers.id,
          first_name: addr.customers.first_name,
          last_name: addr.customers.last_name,
        });
      }
    });
    return Array.from(uniqueCustomers.values());
  }, [addresses]);

  // Direcciones filtradas
  const filteredAddresses = useMemo(() => {
    return addresses.filter(addr => {
      const matchesSearch = searchTerm === '' || 
        addr.address_line1.toLowerCase().includes(searchTerm.toLowerCase()) ||
        addr.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
        addr.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        `${addr.customers?.first_name || ''} ${addr.customers?.last_name || ''}`.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCustomer = selectedCustomerId === 'all' || addr.customer_id === selectedCustomerId;
      
      return matchesSearch && matchesCustomer;
    });
  }, [addresses, searchTerm, selectedCustomerId]);

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <AddressesHeader
        onRefresh={loadData}
        onNewAddress={handleNewAddress}
        onImport={() => setImportDialogOpen(true)}
        isLoading={isLoading}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        selectedCustomerId={selectedCustomerId}
        onCustomerChange={setSelectedCustomerId}
        customers={customers}
      />

      <AddressesList
        addresses={filteredAddresses}
        isLoading={isLoading}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        onSetDefault={handleSetDefault}
        onValidateCoords={handleValidateCoords}
      />

      <AddressDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        address={selectedAddress}
        organizationId={organization?.id || 0}
        onSave={handleSave}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar dirección?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La dirección será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportAddressesDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        organizationId={organization?.id || 0}
        onImportComplete={loadData}
      />
    </div>
  );
}
