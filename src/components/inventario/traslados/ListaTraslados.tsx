'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/config';
import { Loader2, AlertCircle, Printer, Eye, ArrowRightLeft } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Badge
} from "@/components/ui/badge";

interface Branch {
  id: number;
  name: string;
}

interface Transfer {
  id: number;
  origin_branch_id: number;
  dest_branch_id: number;
  status: 'pending' | 'in_transit' | 'received';
  created_at: string;
  updated_at: string;
  notes?: string;
  origin_branch?: Branch;
  dest_branch?: Branch;
  item_count?: number;
}

interface ListaTrasladosProps {
  organizationId?: number;
}

export default function ListaTraslados({ organizationId }: ListaTrasladosProps) {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const router = useRouter();

  useEffect(() => {
    const fetchTransfers = async () => {
      if (!organizationId) return;
      
      setLoading(true);
      setError(null);
      
      try {
        // Consulta para obtener los traslados
        let query = supabase
          .from('inventory_transfers')
          .select(`
            *,
            origin_branch:origin_branch_id(id, name),
            dest_branch:dest_branch_id(id, name),
            transfer_items:transfer_items!inventory_transfer_id(count)
          `)
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });
          
        if (statusFilter !== 'all') {
          query = query.eq('status', statusFilter);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        // Formatear los datos para mostrarlos
        const formattedTransfers = data.map(transfer => ({
          id: transfer.id,
          origin_branch_id: transfer.origin_branch_id,
          dest_branch_id: transfer.dest_branch_id,
          status: transfer.status,
          created_at: transfer.created_at,
          updated_at: transfer.updated_at,
          notes: transfer.notes,
          origin_branch: transfer.origin_branch,
          dest_branch: transfer.dest_branch,
          item_count: transfer.transfer_items?.[0]?.count || 0
        }));
        
        setTransfers(formattedTransfers);
      } catch (err: any) {
        console.error('Error al cargar traslados:', err);
        setError(err.message || 'Error al cargar los traslados');
      } finally {
        setLoading(false);
      }
    };
    
    fetchTransfers();
  }, [organizationId, statusFilter]);
  
  const handleViewTransfer = (transferId: number) => {
    router.push(`/app/inventario/traslados/${transferId}`);
  };
  
  const handlePrintPickingList = (transferId: number) => {
    router.push(`/app/inventario/traslados/print/${transferId}`);
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200">Pendiente</Badge>;
      case 'in_transit':
        return <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">En tránsito</Badge>;
      case 'received':
        return <Badge variant="outline" className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">Recibido</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "dd MMM yyyy, HH:mm", { locale: es });
    } catch (e) {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Cargando traslados...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Historial de Traslados</h3>
        
        <div className="flex items-center space-x-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrar por estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="pending">Pendiente</SelectItem>
              <SelectItem value="in_transit">En tránsito</SelectItem>
              <SelectItem value="received">Recibido</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {transfers.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground border rounded-md">
          No se encontraron traslados
          {statusFilter !== 'all' && ' con el estado seleccionado'}
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((transfer) => (
                <TableRow key={transfer.id}>
                  <TableCell>{transfer.id}</TableCell>
                  <TableCell>{transfer.origin_branch?.name || 'N/A'}</TableCell>
                  <TableCell>{transfer.dest_branch?.name || 'N/A'}</TableCell>
                  <TableCell>{getStatusBadge(transfer.status)}</TableCell>
                  <TableCell>{formatDate(transfer.created_at)}</TableCell>
                  <TableCell>{transfer.item_count}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end space-x-2">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleViewTransfer(transfer.id)}
                        title="Ver detalles"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handlePrintPickingList(transfer.id)}
                        title="Imprimir lista de picking"
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
