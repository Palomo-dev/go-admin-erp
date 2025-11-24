'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { FoliosHeader, FoliosList, FolioDetailDialog } from '@/components/pms/folios';
import FoliosService, { type Folio } from '@/lib/services/foliosService';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export default function FoliosPage() {
  const { toast } = useToast();
  const router = useRouter();

  // Estado de datos
  const [folios, setFolios] = useState<Folio[]>([]);
  const [filteredFolios, setFilteredFolios] = useState<Folio[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Estado de filtros
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');

  // Estado de dialog
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedFolioId, setSelectedFolioId] = useState<string | null>(null);

  // Cargar datos iniciales
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);

      const foliosData = await FoliosService.getFolios();
      setFolios(foliosData);
      setFilteredFolios(foliosData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los folios.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Filtrar folios
  useEffect(() => {
    let filtered = folios;

    if (statusFilter !== 'all') {
      filtered = filtered.filter((folio) => folio.status === statusFilter);
    }

    setFilteredFolios(filtered);
  }, [folios, statusFilter]);

  // Handlers
  const handleViewDetails = (folio: Folio) => {
    setSelectedFolioId(folio.id);
    setShowDetailDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDetailDialog(false);
    setSelectedFolioId(null);
  };

  const handleUpdateFolio = () => {
    loadData(); // Recargar la lista después de actualizar
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Cargando folios...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <FoliosHeader />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Filtros */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                <SelectTrigger id="status" className="dark:bg-gray-900">
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="open">Abiertos</SelectItem>
                  <SelectItem value="closed">Cerrados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Total Folios
            </p>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">
              {folios.length}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Folios Abiertos
            </p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
              {folios.filter(f => f.status === 'open').length}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Folios Cerrados
            </p>
            <p className="text-3xl font-bold text-gray-600 dark:text-gray-400 mt-2">
              {folios.filter(f => f.status === 'closed').length}
            </p>
          </div>
        </div>

        {/* Folios List */}
        <FoliosList folios={filteredFolios} onViewDetails={handleViewDetails} />
      </div>

      {/* Detail Dialog */}
      <FolioDetailDialog
        open={showDetailDialog}
        onOpenChange={handleCloseDialog}
        folioId={selectedFolioId}
        onUpdate={handleUpdateFolio}
      />
    </div>
  );
}
