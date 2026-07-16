'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { deliveryIntegrationService } from '@/lib/services/deliveryIntegrationService';
import type { DeliveryShipment, DeliveryDriver } from '@/lib/services/deliveryIntegrationService';
import {
  MisEnviosHeader,
  MisEnviosStats,
  MisEnviosFilters,
  ShipmentCard,
  MisEnviosEmpty,
} from './components';

export default function MisEnviosPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const [shipments, setShipments] = useState<DeliveryShipment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [driver, setDriver] = useState<DeliveryDriver | null>(null);
  const [driverLoaded, setDriverLoaded] = useState(false);

  // Obtener driver_credentials del usuario logueado
  useEffect(() => {
    const loadDriver = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setDriverLoaded(true);
        return;
      }

      try {
        const driverData = await deliveryIntegrationService.getDriverForUser(user.id);
        setDriver(driverData);
      } catch (error) {
        console.error('Error obteniendo conductor:', error);
      } finally {
        setDriverLoaded(true);
      }
    };
    loadDriver();
  }, []);

  const cargarEnvios = useCallback(async () => {
    if (!organization?.id || !driver?.id) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const data = await deliveryIntegrationService.getAllShipmentsForDriver(
        driver.id,
        organization.id
      );
      setShipments(data);
    } catch (error) {
      console.error('Error cargando envíos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los envíos',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, driver?.id, toast]);

  useEffect(() => {
    cargarEnvios();
  }, [cargarEnvios]);

  const actualizarEstado = async (shipmentId: string, newStatus: string) => {
    if (!driver?.id) return;
    setUpdatingId(shipmentId);
    try {
      await deliveryIntegrationService.updateShipmentStatusByDriver(
        shipmentId,
        newStatus as DeliveryShipment['status'],
        driver.id
      );

      toast({
        title: 'Estado actualizado',
        description: `El envío ahora está: ${newStatus}`,
      });

      await cargarEnvios();
    } catch (error) {
      console.error('Error actualizando estado:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado',
        variant: 'destructive',
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredShipments = shipments.filter((s) => {
    const matchesSearch =
      !searchTerm ||
      s.shipment_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.delivery_address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.delivery_contact_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.customer as { full_name?: string } | null)?.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: shipments.length,
    pendientes: shipments.filter((s) => s.status === 'pending').length,
    enRuta: shipments.filter((s) => ['picked_up', 'in_transit', 'out_for_delivery'].includes(s.status || '')).length,
    entregados: shipments.filter((s) => s.status === 'delivered').length,
  };

  if (isLoading && !driverLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="container mx-auto px-4 py-6 space-y-6">
        <MisEnviosHeader />
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-2">
            No tienes credenciales de conductor activas
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Contacta al administrador para que te asigne el rol de conductor
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <MisEnviosHeader />
      <MisEnviosStats {...stats} />
      <MisEnviosFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
      />
      {filteredShipments.length === 0 ? (
        <MisEnviosEmpty hasShipments={shipments.length > 0} />
      ) : (
        <div className="space-y-3">
          {filteredShipments.map((shipment) => (
            <ShipmentCard
              key={shipment.id}
              shipment={shipment}
              updatingId={updatingId}
              onUpdateStatus={actualizarEstado}
            />
          ))}
        </div>
      )}
    </div>
  );
}
