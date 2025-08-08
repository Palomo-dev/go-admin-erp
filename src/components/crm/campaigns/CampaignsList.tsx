"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  Mail, 
  MessageSquare, 
  Users, 
  MoreHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  TrendingUp
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/config';
import { useTranslation } from '@/lib/i18n';
import { Campaign } from './types';
import { 
  getOrganizationId, 
  getChannelText, 
  calculateCampaignMetrics 
} from './utils';
import CampaignStatusBadge from './CampaignStatusBadge';
import CampaignForm from './CampaignForm';
import CampaignDetail from './CampaignDetail';

const CampaignsList: React.FC = () => {
  const { t, formatDate: formatDateI18n, formatNumber, formatPercentage } = useTranslation();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [filteredCampaigns, setFilteredCampaigns] = useState<Campaign[]>([]);
  const [paginatedCampaigns, setPaginatedCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  
  // Estados de paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  
  // Estados de ordenamiento
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Estados para modal de detalle
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    loadCampaigns();
    
    // Verificar si se debe abrir el modal de crear campaña automáticamente
    const shouldCreate = searchParams.get('create');
    const segmentId = searchParams.get('segment_id');
    
    if (shouldCreate === 'true' && segmentId) {
      console.log('🎯 Abriendo modal de crear campaña con segmento preseleccionado:', segmentId);
      
      // Limpiar los parámetros de URL después de procesar
      const newUrl = window.location.pathname;
      router.replace(newUrl);
    }
  }, [searchParams, router]);

  const loadCampaigns = async () => {
    setIsLoading(true);
    try {
      const organizationId = getOrganizationId();
      console.log('🏢 Cargando campañas para organización:', organizationId);
      
      // Cargar campañas
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error de Supabase:', error);
        toast.error(`Error al cargar las campañas: ${error.message}`);
        return;
      }

      console.log('✅ Campañas cargadas:', data?.length || 0);
      
      // Si hay campañas, cargar los segmentos relacionados
      if (data && data.length > 0) {
        const segmentIds = data
          .filter(campaign => campaign.segment_id)
          .map(campaign => campaign.segment_id);
        
        let segmentsData: Array<{id: string, name: string, customer_count: number}> = [];
        if (segmentIds.length > 0) {
          const { data: segments, error: segmentsError } = await supabase
            .from('segments')
            .select('id, name, customer_count')
            .in('id', segmentIds);
          
          if (segmentsError) {
            console.warn('⚠️ Error cargando segmentos:', segmentsError.message);
          } else {
            segmentsData = segments || [];
          }
        }
        
        // Combinar datos de campañas con segmentos
        const campaignsWithSegments = data.map(campaign => ({
          ...campaign,
          segment: campaign.segment_id 
            ? segmentsData.find(seg => seg.id === campaign.segment_id) || null
            : null
        }));
        
        setCampaigns(campaignsWithSegments);
      } else {
        setCampaigns([]);
      }
      
    } catch (error) {
      console.error('❌ Error general cargando campañas:', error);
      toast.error('Error de conexión al cargar las campañas');
    } finally {
      setIsLoading(false);
    }
  };

  const filterCampaigns = useCallback(() => {
    let filtered = campaigns;

    // Filtro por búsqueda
    if (searchTerm) {
      filtered = filtered.filter(campaign =>
        campaign.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        campaign.segment?.name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filtro por estado
    if (statusFilter !== 'all') {
      filtered = filtered.filter(campaign => campaign.status === statusFilter);
    }

    // Filtro por canal
    if (channelFilter !== 'all') {
      filtered = filtered.filter(campaign => campaign.channel === channelFilter);
    }

    setFilteredCampaigns(filtered);
    setTotalItems(filtered.length);
    setCurrentPage(1); // Reset página al filtrar
  }, [campaigns, searchTerm, statusFilter, channelFilter]);

  // Función de ordenamiento
  const sortCampaigns = useCallback(() => {
    const sorted = [...filteredCampaigns].sort((a, b) => {
      let aValue: string | number | Date = a[sortField as keyof Campaign] as string | number | Date;
      let bValue: string | number | Date = b[sortField as keyof Campaign] as string | number | Date;

      // Manejo especial para campos anidados
      if (sortField === 'segment_name') {
        aValue = a.segment?.name || '';
        bValue = b.segment?.name || '';
      } else if (sortField === 'total_sent') {
        aValue = a.statistics?.total_sent || 0;
        bValue = b.statistics?.total_sent || 0;
      } else if (sortField === 'open_rate') {
        const aStats = a.statistics || {};
        const bStats = b.statistics || {};
        aValue = aStats.total_sent ? (aStats.opened || 0) / aStats.total_sent : 0;
        bValue = bStats.total_sent ? (bStats.opened || 0) / bStats.total_sent : 0;
      }

      // Convertir a string para comparación
      const aStr = typeof aValue === 'string' ? aValue.toLowerCase() : String(aValue).toLowerCase();
      const bStr = typeof bValue === 'string' ? bValue.toLowerCase() : String(bValue).toLowerCase();

      if (sortDirection === 'asc') {
        return aStr > bStr ? 1 : aStr < bStr ? -1 : 0;
      } else {
        return aStr < bStr ? 1 : aStr > bStr ? -1 : 0;
      }
    });

    // Aplicar paginación
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    setPaginatedCampaigns(sorted.slice(startIndex, endIndex));
  }, [filteredCampaigns, sortField, sortDirection, currentPage, itemsPerPage]);

  // Función para cambiar ordenamiento
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Función para cambiar página
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  useEffect(() => {
    filterCampaigns();
  }, [filterCampaigns]);

  useEffect(() => {
    sortCampaigns();
  }, [sortCampaigns]);

  const handleRefresh = () => {
    loadCampaigns();
  };

  // Funciones para manejo del modal de detalle
  const handleCampaignClick = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setIsDetailModalOpen(true);
  };

  const handleCloseDetailModal = () => {
    setIsDetailModalOpen(false);
    setSelectedCampaign(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Gestión de Campañas
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Administra y monitorea tus campañas de marketing
          </p>
        </div>
        <CampaignForm onSuccess={handleRefresh} />
      </div>

      {/* Filtros en fila superior */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Rectángulo 1: Búsqueda de Campaña */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Campaña</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort('name')}
                  className="h-auto p-1 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  {sortField === 'name' && (
                    sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                  )}
                  {sortField !== 'name' && <ArrowUpDown className="h-3 w-3 opacity-50" />}
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Buscar campaña..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-9 border-2 border-gray-200 dark:border-gray-700"
                />
              </div>
            </div>

            {/* Rectángulo 2: Filtro de Segmento */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Segmento</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort('segment_name')}
                  className="h-auto p-1 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  {sortField === 'segment_name' && (
                    sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                  )}
                  {sortField !== 'segment_name' && <ArrowUpDown className="h-3 w-3 opacity-50" />}
                </Button>
              </div>
              <Input
                placeholder="Filtrar por segmento..."
                className="h-9 border-2 border-gray-200 dark:border-gray-700"
                disabled
              />
            </div>

            {/* Rectángulo 3: Filtro de Estado */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Estado</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort('status')}
                  className="h-auto p-1 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  {sortField === 'status' && (
                    sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                  )}
                  {sortField !== 'status' && <ArrowUpDown className="h-3 w-3 opacity-50" />}
                </Button>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 border-2 border-gray-200 dark:border-gray-700">
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('campaigns.filters.allStatuses')}</SelectItem>
                  <SelectItem value="draft">{t('campaigns.status.draft')}</SelectItem>
                  <SelectItem value="scheduled">{t('campaigns.status.scheduled')}</SelectItem>
                  <SelectItem value="sending">{t('campaigns.status.sending')}</SelectItem>
                  <SelectItem value="sent">{t('campaigns.status.sent')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Rectángulo 4: Filtro de Canal */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Canal</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort('total_sent')}
                  className="h-auto p-1 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  {sortField === 'total_sent' && (
                    sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                  )}
                  {sortField !== 'total_sent' && <ArrowUpDown className="h-3 w-3 opacity-50" />}
                </Button>
              </div>
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="h-9 border-2 border-gray-200 dark:border-gray-700">
                  <SelectValue placeholder="Todos los canales" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('campaigns.filters.allChannels')}</SelectItem>
                  <SelectItem value="email">{t('campaigns.channels.email')}</SelectItem>
                  <SelectItem value="whatsapp">{t('campaigns.channels.whatsapp')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Campañas */}
      {filteredCampaigns.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-gray-500 dark:text-gray-400">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No hay campañas</h3>
              <p>
                {campaigns.length === 0 
                  ? 'Crea tu primera campaña para comenzar'
                  : 'No se encontraron campañas con los filtros aplicados'
                }
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {paginatedCampaigns.map((campaign) => {
            const metrics = calculateCampaignMetrics(campaign.statistics || {});
            
            return (
              <Card 
                key={campaign.id} 
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleCampaignClick(campaign)}
              >
                <CardContent className="p-4">
                  {/* Fila principal compacta */}
                  <div className="flex items-center justify-between gap-4">
                    {/* Información Principal (25%) */}
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex-shrink-0">
                        {campaign.channel === 'email' ? (
                          <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <MessageSquare className="h-4 w-4 text-green-600 dark:text-green-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {campaign.name}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {getChannelText(campaign.channel)}
                        </p>
                      </div>
                    </div>

                    {/* Estado */}
                    <div className="flex-shrink-0">
                      <CampaignStatusBadge status={campaign.status} />
                    </div>

                    {/* Segmento (solo desktop) */}
                    <div className="hidden md:flex flex-col items-start min-w-0 flex-shrink-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-32">
                        {campaign.segment?.name || 'Sin segmento'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                        <Users className="h-3 w-3 mr-1" />
                        {formatNumber(campaign.segment?.customer_count || 0)}
                      </p>
                    </div>

                    {/* Fecha (solo desktop) */}
                    <div className="hidden lg:block text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                      {campaign.scheduled_at 
                        ? formatDateI18n(campaign.scheduled_at)
                        : formatDateI18n(campaign.created_at)
                      }
                    </div>

                    {/* KPIs Esenciales (solo desktop) */}
                    <div className="hidden lg:flex items-center space-x-4 text-xs flex-shrink-0">
                      {/* Enviados/Entregados */}
                      <div className="text-center">
                        <p className="font-semibold text-gray-900 dark:text-gray-100">
                          {formatNumber(metrics.totalSent)}/{formatNumber(metrics.delivered)}
                        </p>
                        <p className="text-gray-500 dark:text-gray-400">Env/Ent</p>
                      </div>
                      
                      {/* Tasa de apertura */}
                      <div className="text-center">
                        <p className="font-semibold text-purple-600 dark:text-purple-400">
                          {formatPercentage(metrics.openRate)}
                        </p>
                        <p className="text-gray-500 dark:text-gray-400">Apertura</p>
                      </div>
                      
                      {/* Tasa de clics */}
                      <div className="text-center">
                        <p className="font-semibold text-orange-600 dark:text-orange-400">
                          {formatPercentage(metrics.clickRate)}
                        </p>
                        <p className="text-gray-500 dark:text-gray-400">Clics</p>
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="flex-shrink-0">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          // TODO: Implementar menú de acciones
                        }}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Fila secundaria para móvil */}
                  <div className="md:hidden mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-4">
                        {/* Segmento móvil */}
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Segmento: </span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {campaign.segment?.name || 'Sin segmento'}
                          </span>
                        </div>
                        
                        {/* Fecha móvil */}
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">
                            {formatDateI18n(campaign.scheduled_at || campaign.created_at)}
                          </span>
                        </div>
                      </div>
                      
                      {/* KPIs móvil */}
                      <div className="flex items-center space-x-3">
                        <span className="font-semibold text-purple-600 dark:text-purple-400">
                          {formatPercentage(metrics.openRate)}
                        </span>
                        <span className="font-semibold text-orange-600 dark:text-orange-400">
                          {formatPercentage(metrics.clickRate)}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Controles de paginación */}
      {filteredCampaigns.length > itemsPerPage && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, totalItems)} de {totalItems} campañas
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="flex items-center"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Anterior
                </Button>
                
                {/* Números de página */}
                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.ceil(totalItems / itemsPerPage) }, (_, i) => i + 1)
                    .filter(page => {
                      const totalPages = Math.ceil(totalItems / itemsPerPage);
                      if (totalPages <= 7) return true;
                      if (page === 1 || page === totalPages) return true;
                      if (page >= currentPage - 1 && page <= currentPage + 1) return true;
                      return false;
                    })
                    .map((page, index, array) => (
                      <React.Fragment key={page}>
                        {index > 0 && array[index - 1] !== page - 1 && (
                          <span className="px-2 text-gray-400">...</span>
                        )}
                        <Button
                          variant={currentPage === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => handlePageChange(page)}
                          className={currentPage === page ? "bg-blue-600 hover:bg-blue-700" : ""}
                        >
                          {page}
                        </Button>
                      </React.Fragment>
                    ))
                  }
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= Math.ceil(totalItems / itemsPerPage)}
                  className="flex items-center"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resumen de estadísticas */}
      {filteredCampaigns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-blue-600 dark:text-blue-400" />
              Resumen General
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {filteredCampaigns.length}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Campañas</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {filteredCampaigns.filter(c => c.status === 'sent').length}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Enviadas</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {filteredCampaigns.filter(c => c.status === 'scheduled').length}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Programadas</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                  {filteredCampaigns.filter(c => c.status === 'draft').length}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Borradores</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal de detalle de campaña */}
      <CampaignDetail
        campaign={selectedCampaign}
        isOpen={isDetailModalOpen}
        onClose={handleCloseDetailModal}
        onRefresh={handleRefresh}
      />
    </div>
  );
};

export default CampaignsList;
