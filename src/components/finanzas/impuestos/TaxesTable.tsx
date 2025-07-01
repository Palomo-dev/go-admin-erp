"use client";

import React, { useState, useEffect } from 'react';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { RefreshCcw, Search, PlusCircle, Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/config';
import { formatPercent } from '@/utils/Utils';
import { useToast } from '@/components/ui/use-toast';
import TaxForm from './TaxForm';
import DeleteTaxDialog from './DeleteTaxDialog';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Tipo para los impuestos de la organización
interface OrganizationTax {
  id: string;
  organization_id: number;
  template_id: number | null;
  name: string;
  rate: number;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const TaxesTable = () => {
  const [taxes, setTaxes] = useState<OrganizationTax[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [currentTax, setCurrentTax] = useState<OrganizationTax | null>(null);
  const [editMode, setEditMode] = useState(false);
  
  // Estados para la paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const { toast } = useToast();

  // Obtener el ID de la organización usando el hook oficial
  useEffect(() => {
    try {
      // Usar la función oficial para obtener el ID de organización
      const orgId = getOrganizationId();
      console.log('TaxesTable usando organization_id:', orgId);
      if (orgId) {
        setOrganizationId(orgId);
      } else {
        setLoading(false); // Si no hay organización, detener la carga
        toast({
          title: 'Advertencia',
          description: 'No se encontró una organización activa.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error al obtener la organización activa:', error);
      setLoading(false); // Asegurar que el estado de carga cambie si hay un error
      toast({
        title: 'Error',
        description: 'No se pudo obtener la información de la organización.',
        variant: 'destructive',
      });
    }
  }, []);

  // Cargar los impuestos de la organización
  useEffect(() => {
    if (organizationId) {
      fetchTaxes();
    } else if (organizationId === null) {
      // Si organizationId es explícitamente null, significa que se procesó pero no se encontró
      setLoading(false);
    }
  }, [organizationId]);

  // Función para cargar los impuestos usando la función RPC
  const fetchTaxes = async () => {
    setLoading(true);
    try {
      console.log('Solicitando impuestos para organization_id:', organizationId);
      
      // Usar la función RPC con SECURITY DEFINER para evitar problemas de RLS
      const { data, error } = await supabase
        .rpc('list_organization_taxes', {
          p_organization_id: organizationId
        });

      if (error) {
        console.error('Error detallado al cargar impuestos:', { 
          code: error.code, 
          message: error.message, 
          details: error.details 
        });
        throw error;
      }
      
      console.log('Impuestos recuperados:', data ? data.length : 0, 'registros');
      console.log('Datos de impuestos:', data);
      
      setTaxes(data || []);
    } catch (error) {
      console.error('Error al cargar los impuestos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los impuestos. Intente de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Función para cambiar el estado activo de un impuesto
  const handleToggleActive = async (tax: OrganizationTax) => {
    try {
      const { error } = await supabase
        .from('organization_taxes')
        .update({ is_active: !tax.is_active })
        .eq('id', tax.id);

      if (error) throw error;
      
      // Actualizar el estado local
      setTaxes(taxes.map(t => 
        t.id === tax.id ? { ...t, is_active: !t.is_active } : t
      ));
      
      toast({
        title: 'Éxito',
        description: `Impuesto ${tax.is_active ? 'desactivado' : 'activado'} correctamente.`,
      });
    } catch (error) {
      console.error('Error al actualizar el estado del impuesto:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado del impuesto.',
        variant: 'destructive',
      });
    }
  };

  // Filtrar impuestos por término de búsqueda
  const filteredTaxes = taxes.filter(tax => 
    tax.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    tax.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    formatPercent(tax.rate).includes(searchTerm)
  );
  
  // Calcular el número total de páginas
  useEffect(() => {
    setTotalPages(Math.max(1, Math.ceil(filteredTaxes.length / itemsPerPage)));
    setCurrentPage(1); // Resetear a la primera página cuando cambia el filtro o items por página
  }, [filteredTaxes.length, itemsPerPage]);
  
  // Obtener los impuestos de la página actual
  const paginatedTaxes = filteredTaxes.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Funciones para abrir formularios
  const handleAddNew = () => {
    setCurrentTax(null);
    setEditMode(false);
    setIsFormOpen(true);
  };

  const handleEdit = (tax: OrganizationTax) => {
    setCurrentTax(tax);
    setEditMode(true);
    setIsFormOpen(true);
  };

  const handleDelete = (tax: OrganizationTax) => {
    setCurrentTax(tax);
    setIsDeleteDialogOpen(true);
  };

  // Función para cerrar el formulario
  const handleFormClose = (refreshData: boolean = false) => {
    setIsFormOpen(false);
    if (refreshData) {
      // Asegurarse de que la actualización se realice después de que el estado se actualice
      setTimeout(() => {
        console.log('Refrescando datos después de cerrar el formulario');
        fetchTaxes();
      }, 500);
    }
  };

  // Función para cerrar el diálogo de eliminación
  const handleDeleteDialogClose = (deleted: boolean = false) => {
    setIsDeleteDialogOpen(false);
    if (deleted) {
      fetchTaxes();
    }
  };

  return (
    <div className="space-y-4">
      <Card className="dark:bg-gray-800/50 light:bg-white">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl text-blue-600 dark:text-blue-400">
              Impuestos de la Organización
            </CardTitle>
            <Button onClick={handleAddNew} className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800">
              <Plus className="mr-2 h-4 w-4" /> Nuevo Impuesto
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center mb-4 gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar impuestos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 dark:bg-gray-900/50 dark:border-gray-700"
              />
            </div>
            <Button 
              variant="outline" 
              size="icon"
              onClick={fetchTaxes}
              disabled={loading}
              className="dark:border-gray-700 dark:hover:bg-gray-700"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <div className="border rounded-md dark:border-gray-700">
            <Table>
              <TableHeader>
                <TableRow className="dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <TableHead className="font-medium">Nombre</TableHead>
                  <TableHead className="font-medium">Tasa</TableHead>
                  <TableHead className="font-medium">Descripción</TableHead>
                  <TableHead className="font-medium">Estado</TableHead>
                  <TableHead className="font-medium">Predeterminado</TableHead>
                  <TableHead className="font-medium text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center dark:border-gray-700">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCcw className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-400" />
                        <span>Cargando impuestos...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : paginatedTaxes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center dark:border-gray-700">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <p className="text-gray-600 dark:text-gray-400">No hay impuestos disponibles</p>
                        <Button 
                          variant="outline" 
                          className="mt-2 border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/50"
                          onClick={() => handleAddNew()}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Crear nuevo impuesto
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedTaxes.map((tax) => (
                    <TableRow key={tax.id} className="dark:border-gray-700">
                      <TableCell className="font-medium dark:text-gray-300">{tax.name}</TableCell>
                      <TableCell>
                        <Badge variant={tax.rate > 0 ? "default" : "outline"} className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                          {formatPercent(tax.rate)}
                        </Badge>
                      </TableCell>
                      <TableCell className="dark:text-gray-400">{tax.description || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Switch 
                            checked={tax.is_active} 
                            onCheckedChange={() => handleToggleActive(tax)}
                            className="data-[state=checked]:bg-green-600 dark:data-[state=checked]:bg-green-700"
                          />
                          <span className="dark:text-gray-300">
                            {tax.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {tax.is_default ? (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800">
                            Predeterminado
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEdit(tax)}
                            className="h-8 dark:border-gray-700 dark:hover:bg-gray-700"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={() => handleDelete(tax)}
                            className="h-8 bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* Controles de paginación */}
          {filteredTaxes.length > 0 && (
            <div className="flex items-center justify-between space-x-2 py-4">
              <div className="flex-1 text-sm text-muted-foreground dark:text-gray-400">
                Mostrando {Math.min((currentPage - 1) * itemsPerPage + 1, filteredTaxes.length)} a {Math.min(currentPage * itemsPerPage, filteredTaxes.length)} de {filteredTaxes.length} impuestos
              </div>
              <div className="flex items-center space-x-6">
                <div className="flex items-center space-x-2">
                  <p className="text-sm font-medium dark:text-gray-300">Filas por página</p>
                  <Select
                    value={String(itemsPerPage)}
                    onValueChange={(value) => setItemsPerPage(Number(value))}
                  >
                    <SelectTrigger className="h-8 w-[70px] dark:border-gray-700 dark:bg-gray-900/50">
                      <SelectValue placeholder={itemsPerPage} />
                    </SelectTrigger>
                    <SelectContent className="dark:border-gray-700 dark:bg-gray-900">
                      {[5, 10, 15, 20].map((pageSize) => (
                        <SelectItem key={pageSize} value={`${pageSize}`}>
                          {pageSize}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="h-8 w-8 dark:border-gray-700 dark:hover:bg-gray-800"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="sr-only">Página anterior</span>
                  </Button>
                  <div className="flex items-center gap-1.5">
                    {Array.from({length: totalPages}, (_, i) => i + 1).map(page => (
                      <Button
                        key={page}
                        variant={page === currentPage ? "default" : "outline"}
                        size="icon"
                        onClick={() => setCurrentPage(page)}
                        className={`h-8 w-8 ${page === currentPage ? 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800' : 'dark:border-gray-700 dark:hover:bg-gray-800'}`}
                      >
                        {page}
                      </Button>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="h-8 w-8 dark:border-gray-700 dark:hover:bg-gray-800"
                  >
                    <ChevronRight className="h-4 w-4" />
                    <span className="sr-only">Página siguiente</span>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {isFormOpen && (
        <TaxForm 
          open={isFormOpen} 
          onClose={handleFormClose} 
          tax={currentTax} 
          editMode={editMode}
          organizationId={organizationId as number}
        />
      )}

      {isDeleteDialogOpen && currentTax && (
        <DeleteTaxDialog 
          open={isDeleteDialogOpen} 
          onClose={handleDeleteDialogClose} 
          tax={currentTax} 
        />
      )}
    </div>
  );
};

export default TaxesTable;
