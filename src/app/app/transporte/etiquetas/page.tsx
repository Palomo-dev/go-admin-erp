'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tag,
  Search,
  Printer,
  RefreshCw,
  Plus,
  Upload,
  Loader2,
  Download,
  BarChart3,
} from 'lucide-react';
import { labelsService, type LabelWithDetails, type LabelCreateInput } from '@/lib/services/labelsService';
import {
  LabelCard,
  LabelDialog,
  LabelPreview,
  VoidLabelDialog,
  ImportLabelsDialog,
} from '@/components/transporte/etiquetas';

export default function EtiquetasPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  // Estados principales
  const [labels, setLabels] = useState<LabelWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'printed' | 'void'>('active');
  const [labelTypeFilter, setLabelTypeFilter] = useState('all');

  // Estados para diálogos
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<LabelWithDetails | null>(null);
  const [previewLabel, setPreviewLabel] = useState<LabelWithDetails | null>(null);

  // Estados para datos auxiliares
  const [shipments, setShipments] = useState<Array<{ id: string; shipment_number: string; tracking_number?: string }>>([]);
  const [carriers, setCarriers] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cargar datos
  const loadData = useCallback(async () => {
    if (!organizationId) return;

    setIsLoading(true);
    try {
      const [labelsData, shipmentsData, carriersData] = await Promise.all([
        labelsService.getLabels(organizationId, {
          status: statusFilter,
          labelType: labelTypeFilter !== 'all' ? labelTypeFilter : undefined,
          search: searchTerm || undefined,
        }),
        labelsService.getShipmentsWithoutLabel(organizationId),
        labelsService.getCarriers(organizationId),
      ]);

      setLabels(labelsData);
      setShipments(shipmentsData);
      setCarriers(carriersData);
    } catch (error) {
      console.error('Error loading labels:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las etiquetas',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, statusFilter, labelTypeFilter, searchTerm, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handlers
  const handleCreate = async (data: LabelCreateInput) => {
    if (!organizationId) return;
    
    setIsSubmitting(true);
    try {
      await labelsService.createLabel(organizationId, data);
      toast({
        title: 'Etiqueta creada',
        description: 'La etiqueta se ha generado correctamente',
      });
      setShowCreateDialog(false);
      loadData();
    } catch (error) {
      console.error('Error creating label:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear la etiqueta',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleView = (label: LabelWithDetails) => {
    setPreviewLabel(label);
  };

  const handlePrint = async (label: LabelWithDetails) => {
    try {
      await labelsService.markAsPrinted(label.id);
      toast({
        title: 'Imprimiendo',
        description: `Etiqueta ${label.label_number} enviada a impresión`,
      });
      loadData();
      
      // Abrir ventana de impresión si hay URL
      if (label.file_url) {
        window.open(label.file_url, '_blank');
      }
    } catch (error) {
      console.error('Error printing label:', error);
      toast({
        title: 'Error',
        description: 'No se pudo marcar como impresa',
        variant: 'destructive',
      });
    }
  };

  const handleDownload = async (label: LabelWithDetails) => {
    if (!label.file_url) {
      toast({
        title: 'Sin archivo',
        description: 'Esta etiqueta no tiene archivo generado',
        variant: 'destructive',
      });
      return;
    }

    try {
      const blob = await labelsService.downloadLabel(label);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${label.label_number}.${label.format || 'pdf'}`;
        a.click();
        URL.revokeObjectURL(url);
        
        toast({
          title: 'Descargando',
          description: `Etiqueta ${label.label_number}`,
        });
      }
    } catch (error) {
      console.error('Error downloading label:', error);
      toast({
        title: 'Error',
        description: 'No se pudo descargar la etiqueta',
        variant: 'destructive',
      });
    }
  };

  const handleDuplicate = async (label: LabelWithDetails) => {
    setIsSubmitting(true);
    try {
      await labelsService.duplicateLabel(label.id);
      toast({
        title: 'Etiqueta duplicada',
        description: 'Se ha creado una copia de la etiqueta',
      });
      loadData();
    } catch (error) {
      console.error('Error duplicating label:', error);
      toast({
        title: 'Error',
        description: 'No se pudo duplicar la etiqueta',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegenerate = async (label: LabelWithDetails) => {
    setIsSubmitting(true);
    try {
      await labelsService.regenerateLabel(label.id, 'Regeneración manual');
      toast({
        title: 'Etiqueta regenerada',
        description: 'Se ha creado una nueva etiqueta y anulado la anterior',
      });
      loadData();
    } catch (error) {
      console.error('Error regenerating label:', error);
      toast({
        title: 'Error',
        description: 'No se pudo regenerar la etiqueta',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVoidConfirm = async (labelId: string, reason: string) => {
    setIsSubmitting(true);
    try {
      await labelsService.voidLabel(labelId, reason);
      toast({
        title: 'Etiqueta anulada',
        description: 'La etiqueta ha sido marcada como anulada',
      });
      setShowVoidDialog(false);
      setSelectedLabel(null);
      loadData();
    } catch (error) {
      console.error('Error voiding label:', error);
      toast({
        title: 'Error',
        description: 'No se pudo anular la etiqueta',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImport = async (csvData: string) => {
    if (!organizationId) return { success: 0, errors: ['Organización no válida'] };
    
    setIsSubmitting(true);
    try {
      const result = await labelsService.importLabelsFromCSV(organizationId, csvData);
      if (result.success > 0) {
        loadData();
      }
      return result;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Estadísticas
  const stats = {
    total: labels.length,
    active: labels.filter(l => !l.is_void).length,
    printed: labels.filter(l => l.is_printed && !l.is_void).length,
    void: labels.filter(l => l.is_void).length,
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Tag className="h-6 w-6 text-blue-600" />
            Etiquetas de Envío
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Gestione y genere etiquetas para sus envíos
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowImportDialog(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            disabled={shipments.length === 0}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nueva Etiqueta
          </Button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <BarChart3 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-sm text-gray-500">Total</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
              <Tag className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.active}</p>
              <p className="text-sm text-gray-500">Activas</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Printer className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.printed}</p>
              <p className="text-sm text-gray-500">Impresas</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
              <Tag className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.void}</p>
              <p className="text-sm text-gray-500">Anuladas</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por número, código de barras..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="active">Activas</SelectItem>
            <SelectItem value="printed">Impresas</SelectItem>
            <SelectItem value="void">Anuladas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={labelTypeFilter} onValueChange={setLabelTypeFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="shipping">Envío</SelectItem>
            <SelectItem value="return">Devolución</SelectItem>
            <SelectItem value="customs">Aduanas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Contenido principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de etiquetas */}
        <div className="lg:col-span-2 space-y-4">
          {isLoading ? (
            <Card className="p-8">
              <div className="flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <span className="ml-3 text-gray-600 dark:text-gray-400">Cargando etiquetas...</span>
              </div>
            </Card>
          ) : labels.length === 0 ? (
            <Card className="p-8 text-center">
              <Tag className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">No hay etiquetas</h3>
              <p className="text-gray-600 dark:text-gray-400 mt-1 mb-4">
                {shipments.length > 0
                  ? 'Cree una nueva etiqueta para sus envíos'
                  : 'No hay envíos pendientes de etiqueta'}
              </p>
              {shipments.length > 0 && (
                <Button onClick={() => setShowCreateDialog(true)} className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Etiqueta
                </Button>
              )}
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {labels.map((label) => (
                <LabelCard
                  key={label.id}
                  label={label}
                  onView={handleView}
                  onPrint={handlePrint}
                  onDownload={handleDownload}
                  onDuplicate={handleDuplicate}
                  onRegenerate={handleRegenerate}
                  onVoid={(l) => {
                    setSelectedLabel(l);
                    setShowVoidDialog(true);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Panel de vista previa */}
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Vista Previa
          </h3>
          {previewLabel ? (
            <div className="space-y-4">
              <LabelPreview label={previewLabel} />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handlePrint(previewLabel)}
                  disabled={previewLabel.is_void}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleDownload(previewLabel)}
                  disabled={previewLabel.is_void || !previewLabel.file_url}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Descargar
                </Button>
              </div>
            </div>
          ) : (
            <Card className="p-6 text-center text-gray-500">
              <Tag className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Seleccione una etiqueta para ver la vista previa</p>
            </Card>
          )}
        </div>
      </div>

      {/* Diálogos */}
      <LabelDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        shipments={shipments}
        carriers={carriers}
        onSave={handleCreate}
        isLoading={isSubmitting}
      />

      <VoidLabelDialog
        open={showVoidDialog}
        onOpenChange={setShowVoidDialog}
        label={selectedLabel}
        onConfirm={handleVoidConfirm}
        isLoading={isSubmitting}
      />

      <ImportLabelsDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImport={handleImport}
        isLoading={isSubmitting}
      />
    </div>
  );
}
