'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { deliveryIntegrationService } from '@/lib/services/deliveryIntegrationService';
import type { DeliveryShipment, DeliveryDriver } from '@/lib/services/deliveryIntegrationService';
import { shipmentsService } from '@/lib/services/shipmentsService';
import {
  MisEnviosHeader,
  MisEnviosStats,
  MisEnviosFilters,
  ShipmentCard,
  MisEnviosEmpty,
} from './components';
import type { DateFilterPreset } from './components/MisEnviosFilters';

export default function MisEnviosPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const [shipments, setShipments] = useState<DeliveryShipment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<DateFilterPreset>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [driver, setDriver] = useState<DeliveryDriver | null>(null);
  const [driverLoaded, setDriverLoaded] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Obtener driver_credentials del usuario logueado y verificar si es admin
  useEffect(() => {
    if (!organization?.id) return;
    const loadDriver = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setDriverLoaded(true);
        return;
      }

      try {
        // Verificar si el usuario es admin de la organización
        // organization_members usa role_id (integer FK a roles), no role (string)
        const { data: memberData } = await supabase
          .from('organization_members')
          .select('role_id, is_super_admin')
          .eq('user_id', user.id)
          .eq('organization_id', organization?.id)
          .maybeSingle();

        let isAdminUser = false;
        if (memberData?.is_super_admin) {
          isAdminUser = true;
        } else if (memberData?.role_id) {
          const { data: roleData } = await supabase
            .from('roles')
            .select('name')
            .eq('id', memberData.role_id)
            .maybeSingle();
          const adminRoleNames = ['admin', 'owner', 'super_admin', 'manager', 'Admin de organización'];
          if (roleData?.name && adminRoleNames.includes(roleData.name.toLowerCase())) {
            isAdminUser = true;
          }
        }
        if (isAdminUser) {
          setIsAdmin(true);
        }

        const driverData = await deliveryIntegrationService.getDriverForUser(user.id);
        setDriver(driverData);
      } catch (error) {
        console.error('Error obteniendo conductor:', error);
      } finally {
        setDriverLoaded(true);
      }
    };
    loadDriver();
  }, [organization?.id]);

  const cargarEnvios = useCallback(async () => {
    if (!organization?.id) {
      setIsLoading(false);
      return;
    }
    // Si es admin, cargar todos los envíos de la organización
    if (isAdmin) {
      setIsLoading(true);
      try {
        let query = supabase
          .from('shipments')
          .select(`
            *,
            customer:customers(id, full_name, phone, email),
            shipment_items(id, description, qty)
          `)
          .eq('organization_id', organization.id)
          .order('created_at', { ascending: false })
          .limit(200);
        // Si el admin también es conductor, filtrar por sus envíos
        if (driver?.id) {
          query = query.contains('metadata', { driver_id: driver.id });
        }
        const { data, error } = await query;
        if (error) throw error;
        setShipments(data || []);
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
      return;
    }
    if (!driver?.id) {
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
  }, [organization?.id, driver?.id, isAdmin, toast]);

  useEffect(() => {
    cargarEnvios();
  }, [cargarEnvios]);

  const actualizarEstado = async (shipmentId: string, newStatus: string) => {
    setUpdatingId(shipmentId);
    try {
      if (driver?.id) {
        await deliveryIntegrationService.updateShipmentStatusByDriver(
          shipmentId,
          newStatus as DeliveryShipment['status'],
          driver.id
        );
      } else {
        // Admin sin credenciales: actualizar directamente
        const updates: Record<string, unknown> = {
          status: newStatus,
          updated_at: new Date().toISOString(),
        };
        if (newStatus === 'picked') updates.picked_at = new Date().toISOString();
        if (newStatus === 'in_transit' || newStatus === 'out_for_delivery') updates.dispatched_at = new Date().toISOString();
        if (newStatus === 'delivered') updates.delivered_at = new Date().toISOString();
        const { error } = await supabase.from('shipments').update(updates).eq('id', shipmentId);
        if (error) throw error;
      }

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

  const marcarPagado = async (shipmentId: string) => {
    setUpdatingId(shipmentId);
    try {
      const { error } = await supabase
        .from('shipments')
        .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', shipmentId);
      if (error) throw error;

      toast({
        title: 'Pago registrado',
        description: 'El envío ha sido marcado como pagado.',
      });

      await cargarEnvios();
    } catch (error) {
      console.error('Error marcando como pagado:', error);
      toast({
        title: 'Error',
        description: 'No se pudo marcar como pagado',
        variant: 'destructive',
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const reportarIncidente = async (shipmentId: string, incident: {
    incident_type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description?: string;
    location_description?: string;
  }) => {
    if (!organization?.id) return;
    setUpdatingId(shipmentId);
    try {
      await shipmentsService.createShipmentIncident(shipmentId, organization.id, incident);
      toast({ title: 'Incidente reportado', description: 'Se ha registrado el incidente correctamente.' });
      await cargarEnvios();
    } catch (error) {
      console.error('Error reportando incidente:', error);
      toast({
        title: 'Error',
        description: 'No se pudo reportar el incidente',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setUpdatingId(null);
    }
  };

  const entregarConFoto = async (shipmentId: string, data: {
    recipientName: string;
    photoUrl: string;
    notes?: string;
  }) => {
    setUpdatingId(shipmentId);
    try {
      await shipmentsService.createProofOfDelivery(shipmentId, {
        recipient_name: data.recipientName,
        photo_urls: [data.photoUrl],
        notes: data.notes,
        delivery_location_type: 'door',
      });
      toast({ title: 'Entrega confirmada', description: 'Se registró la prueba de entrega con foto.' });
      await cargarEnvios();
    } catch (error) {
      console.error('Error registrando entrega:', error);
      toast({
        title: 'Error',
        description: 'No se pudo registrar la entrega',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setUpdatingId(null);
    }
  };

  const getDateRange = () => {
    if (dateFilter === 'all') return null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (dateFilter) {
      case 'today': {
        const end = new Date(today);
        end.setDate(end.getDate() + 1);
        return { from: today.toISOString().split('T')[0], to: end.toISOString().split('T')[0] };
      }
      case 'yesterday': {
        const start = new Date(today);
        start.setDate(start.getDate() - 1);
        return { from: start.toISOString().split('T')[0], to: today.toISOString().split('T')[0] };
      }
      case '7days': {
        const start = new Date(today);
        start.setDate(start.getDate() - 7);
        return { from: start.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
      }
      case '15days': {
        const start = new Date(today);
        start.setDate(start.getDate() - 15);
        return { from: start.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
      }
      case '30days': {
        const start = new Date(today);
        start.setDate(start.getDate() - 30);
        return { from: start.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
      }
      case 'custom': {
        if (!dateFrom || !dateTo) return null;
        const to = new Date(dateTo);
        to.setDate(to.getDate() + 1);
        return { from: dateFrom, to: to.toISOString().split('T')[0] };
      }
      default:
        return null;
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
    const range = getDateRange();
    let matchesDate = true;
    if (range) {
      const shipmentDate = s.created_at?.split('T')[0] || '';
      matchesDate = shipmentDate >= range.from && shipmentDate < range.to;
    }
    return matchesSearch && matchesStatus && matchesDate;
  });

  const stats = {
    total: shipments.length,
    pendientes: shipments.filter((s) => s.status === 'pending' || s.status === 'assigned').length,
    enRuta: shipments.filter((s) => ['picked', 'dispatched', 'in_transit', 'out_for_delivery'].includes(s.status || '')).length,
    entregados: shipments.filter((s) => s.status === 'delivered').length,
  };

  if (isLoading && !driverLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-300" />
      </div>
    );
  }

  if (!driver && !isAdmin) {
    return (
      <div className="container mx-auto px-4 py-6 space-y-4 sm:space-y-6">
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

  if (!driver && isAdmin) {
    // Admin sin credenciales: puede ver todos los envíos pero no actualizar estado
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-4 sm:space-y-6">
      <MisEnviosHeader />
      <MisEnviosStats {...stats} />
      <MisEnviosFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        dateFilter={dateFilter}
        onDateFilterChange={setDateFilter}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
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
              onMarkPaid={marcarPagado}
              onReportIncident={reportarIncidente}
              onDeliveryWithPhoto={entregarConFoto}
            />
          ))}
        </div>
      )}
    </div>
  );
}
