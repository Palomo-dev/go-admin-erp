'use client';
import React, { useState, useEffect } from 'react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { PencilIcon, TrashIcon, MoreHorizontalIcon, LoaderIcon } from 'lucide-react';
import { SerialStatus, StatusBadge } from './StatusBadge';
import { SerialNumber, SerialForm } from './SerialForm';
import { supabase } from '@/lib/supabase/config';

// Tipo para datos recibidos de Supabase
interface SerialWithProductResponse {
  id: number;
  product_id: number;
  serial: string;
  status: string;
  sale_id: string | null;
  purchase_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // La relación products devuelve un objeto, no un array
  products: {
    name: string;
  };
}

interface SerialsTableProps {
  statusFilter?: SerialStatus | 'Todos';
}

export function SerialsTable({ statusFilter = 'Todos' }: SerialsTableProps) {
  const { toast } = useToast();
  const [serials, setSerials] = useState<SerialNumber[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [openForm, setOpenForm] = useState(false);
  const [selectedSerial, setSelectedSerial] = useState<SerialNumber | null>(null);
  
  // Cargar números de serie
  const fetchSerials = async () => {
    setLoading(true);
    try {
      // Consulta SQL para obtener los números de serie con los nombres de los productos
      const { data, error } = await supabase
        .from('serial_numbers')
        .select(`
          id,
          product_id,
          serial,
          status,
          sale_id,
          purchase_id,
          notes,
          created_at,
          updated_at,
          products:product_id(name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      if (!data) {
        setSerials([]);
        return;
      }
      
      // Formatear los datos para incluir el nombre del producto
      const formattedData = data.map((item: any): SerialNumber => ({
        id: item.id,
        product_id: item.product_id,
        serial: item.serial,
        status: item.status,
        sale_id: item.sale_id,
        purchase_id: item.purchase_id,
        notes: item.notes,
        created_at: item.created_at,
        updated_at: item.updated_at,
        // Aseguramos que products tenga la estructura correcta
        product_name: item.products?.name || 'Producto desconocido'
      }));

      setSerials(formattedData);
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron cargar los números de serie',
      });
      console.error('Error al cargar números de serie:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSerials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // fetchSerials está definido internamente, no cambia entre renderizados

  // Filtrar seriales según término de búsqueda y estado seleccionado
  const filteredSerials = serials.filter(serial => {
    const matchesSearch = 
      serial.serial.toLowerCase().includes(searchTerm.toLowerCase()) ||
      serial.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      serial.status.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Si el filtro es 'Todos' o coincide con el estado del serial
    const matchesStatus = statusFilter === 'Todos' || serial.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Abrir formulario para editar
  const handleEdit = (serial: SerialNumber) => {
    setSelectedSerial(serial);
    setOpenForm(true);
  };

  // Eliminar número de serie
  const handleDelete = async (id: number) => {
    if (!confirm('¿Está seguro de eliminar este número de serie?')) return;
    
    try {
      const { error } = await supabase
        .from('serial_numbers')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Eliminado correctamente',
        description: 'El número de serie ha sido eliminado',
      });
      
      fetchSerials(); // Recargar la lista
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo eliminar el número de serie',
      });
      console.error('Error al eliminar:', error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="w-full sm:w-1/2">
          <Input
            placeholder="Buscar por número de serie, producto o estado..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-lg"
          />
        </div>
        <Button onClick={() => { setSelectedSerial(null); setOpenForm(true); }}>
          Registrar Número de Serie
        </Button>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número de Serie</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead>Fecha de registro</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">
                  <div className="flex justify-center items-center">
                    <LoaderIcon className="h-6 w-6 animate-spin mr-2" />
                    Cargando...
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredSerials.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">
                  No se encontraron números de serie
                </TableCell>
              </TableRow>
            ) : (
              filteredSerials.map((serial) => (
                <TableRow key={serial.id}>
                  <TableCell>{serial.serial}</TableCell>
                  <TableCell>{serial.product_name}</TableCell>
                  <TableCell>
                    <StatusBadge status={serial.status as SerialStatus} />
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {serial.notes || '-'}
                  </TableCell>
                  <TableCell>
                    {serial.created_at 
                      ? new Date(serial.created_at).toLocaleDateString() 
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontalIcon className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(serial)}>
                          <PencilIcon className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => serial.id && handleDelete(serial.id)}
                          className="text-red-600 focus:text-red-600"
                        >
                          <TrashIcon className="h-4 w-4 mr-2" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Formulario para crear/editar */}
      <SerialForm
        open={openForm}
        onOpenChange={setOpenForm}
        serialData={selectedSerial}
        onSuccess={fetchSerials}
      />
    </div>
  );
}
