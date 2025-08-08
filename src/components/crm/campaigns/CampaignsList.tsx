"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { 
  Search, 
  Mail, 
  MessageSquare, 
  TrendingUp,
  Calendar,
  Users,
  MoreHorizontal
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/config';
import { Campaign } from './types';
import { 
  getOrganizationId, 
  formatDate, 
  getChannelText, 
  calculateCampaignMetrics 
} from './utils';
import CampaignStatusBadge from './CampaignStatusBadge';
import CampaignForm from './CampaignForm';

const CampaignsList: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [filteredCampaigns, setFilteredCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    setIsLoading(true);
    try {
      const organizationId = getOrganizationId();
      console.log('🏢 Cargando campañas para organización:', organizationId);
      
      // Primero intentamos cargar campañas sin JOIN para verificar conectividad
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error de Supabase:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        toast.error(`Error al cargar las campañas: ${error.message}`);
        return;
      }

      console.log('✅ Campañas cargadas:', data?.length || 0);
      
      // Si hay campañas, intentamos cargar los segmentos relacionados
      if (data && data.length > 0) {
        // Cargar segmentos relacionados por separado para evitar problemas de JOIN
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
        // No hay campañas
        console.log('📭 No se encontraron campañas para esta organización');
        setCampaigns([]);
      }
      
    } catch (error) {
      console.error('❌ Error general cargando campañas:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
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
  }, [campaigns, searchTerm, statusFilter, channelFilter]);

  useEffect(() => {
    filterCampaigns();
  }, [filterCampaigns]);

  const handleRefresh = () => {
    loadCampaigns();
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

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Buscar campañas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="draft">Borrador</SelectItem>
                  <SelectItem value="scheduled">Programada</SelectItem>
                  <SelectItem value="sending">Enviando</SelectItem>
                  <SelectItem value="sent">Enviada</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Canal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los canales</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
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
        <div className="space-y-4">
          {filteredCampaigns.map((campaign) => {
            const metrics = calculateCampaignMetrics(campaign.statistics || {});
            
            return (
              <Card key={campaign.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                    {/* Información Principal */}
                    <div className="lg:col-span-3">
                      <div className="flex items-start space-x-3">
                        <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                          {campaign.channel === 'email' ? (
                            <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <MessageSquare className="h-5 w-5 text-green-600 dark:text-green-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {campaign.name}
                          </h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {getChannelText(campaign.channel)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Segmento */}
                    <div className="lg:col-span-2">
                      <div className="text-sm">
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {campaign.segment?.name || 'Sin segmento'}
                        </p>
                        <p className="text-gray-500 dark:text-gray-400 flex items-center">
                          <Users className="h-3 w-3 mr-1" />
                          {campaign.segment?.customer_count || 0} contactos
                        </p>
                      </div>
                    </div>

                    {/* Estado */}
                    <div className="lg:col-span-1">
                      <CampaignStatusBadge status={campaign.status} />
                    </div>

                    {/* Fecha */}
                    <div className="lg:col-span-2">
                      <div className="text-sm">
                        <p className="text-gray-500 dark:text-gray-400 flex items-center">
                          <Calendar className="h-3 w-3 mr-1" />
                          {campaign.scheduled_at 
                            ? formatDate(campaign.scheduled_at)
                            : formatDate(campaign.created_at)
                          }
                        </p>
                      </div>
                    </div>

                    {/* KPIs */}
                    <div className="lg:col-span-3">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {metrics.totalSent.toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Envíos</p>
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-purple-600 dark:text-purple-400">
                            {metrics.openRate}%
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Apertura</p>
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-orange-600 dark:text-orange-400">
                            {metrics.clickRate}%
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Clics</p>
                        </div>
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="lg:col-span-1">
                      <div className="flex justify-end">
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
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
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Campañas</p>
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
    </div>
  );
};

export default CampaignsList;
