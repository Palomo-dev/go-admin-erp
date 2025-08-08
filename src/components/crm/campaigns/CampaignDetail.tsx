"use client";

import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  Mail, 
  MessageSquare, 
  Users,
  TrendingUp,
  Eye,
  MousePointer,
  Send,
  CheckCircle,
  X,
  Edit,
  Copy,
  Trash2
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

interface CampaignDetailProps {
  campaign: Campaign | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

interface CampaignDetailData extends Omit<Campaign, 'segment'> {
  segment?: {
    id: string;
    name: string;
    customer_count: number;
    description?: string;
  };
  creator?: {
    email: string;
  };
}

const CampaignDetail: React.FC<CampaignDetailProps> = ({
  campaign,
  isOpen,
  onClose,
  onRefresh
}) => {
  const { formatDate: formatDateI18n, formatNumber, formatPercentage } = useTranslation();
  const [detailData, setDetailData] = useState<CampaignDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const loadCampaignDetail = React.useCallback(async () => {
    if (!campaign) return;
    
    setIsLoading(true);
    try {
      const organizationId = getOrganizationId();
      console.log('🔍 Cargando detalle de campaña:', campaign.id);

      // Cargar datos de la campaña
      const { data: campaignData, error: campaignError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', campaign.id)
        .eq('organization_id', organizationId)
        .single();

      if (campaignError) {
        console.error('❌ Error cargando campaña:', campaignError);
        toast.error(`Error al cargar los detalles: ${campaignError.message}`);
        return;
      }

      let segmentData = null;
      
      // Si la campaña tiene un segmento, cargarlo por separado
      if (campaignData.segment_id) {
        const { data: segment, error: segmentError } = await supabase
          .from('segments')
          .select('id, name, customer_count, description')
          .eq('id', campaignData.segment_id)
          .eq('organization_id', organizationId)
          .single();

        if (segmentError) {
          console.warn('⚠️ Error cargando segmento:', segmentError);
        } else {
          segmentData = segment;
        }
      }

      const detailData = {
        ...campaignData,
        segment: segmentData
      };

      console.log('✅ Detalle cargado:', detailData);
      setDetailData(detailData);

    } catch (error) {
      console.error('❌ Error inesperado:', error);
      toast.error('Error inesperado al cargar los detalles');
    } finally {
      setIsLoading(false);
    }
  }, [campaign]);

  useEffect(() => {
    if (campaign && isOpen) {
      loadCampaignDetail();
    }
  }, [campaign, isOpen, loadCampaignDetail]);



  const handleEdit = () => {
    console.log('✏️ Abriendo modal de edición para campaña:', campaign?.id);
    setIsEditModalOpen(true);
  };

  const handleEditSuccess = () => {
    console.log('✅ Campaña editada exitosamente, recargando datos');
    setIsEditModalOpen(false);
    loadCampaignDetail(); // Recargar datos actualizados
    if (onRefresh) {
      onRefresh(); // Refrescar la lista principal
    }
  };

  const handleDuplicate = () => {
    toast.info('Funcionalidad de duplicación en desarrollo');
    // TODO: Implementar duplicación de campaña
  };

  const handleDelete = () => {
    toast.info('Funcionalidad de eliminación en desarrollo');
    // TODO: Implementar eliminación de campaña
  };

  if (!campaign) return null;

  const metrics = calculateCampaignMetrics(detailData?.statistics || {});
  const channelIcon = campaign.channel === 'email' ? Mail : MessageSquare;
  const ChannelIcon = channelIcon;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                <ChannelIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {campaign.name}
                </DialogTitle>
                <DialogDescription className="text-gray-600 dark:text-gray-400">
                  {getChannelText(campaign.channel)} • {formatDateI18n(campaign.created_at)}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <CampaignStatusBadge status={campaign.status} />
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Información General */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <span>Información General</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      Canal
                    </label>
                    <p className="text-gray-900 dark:text-gray-100 font-medium">
                      {getChannelText(campaign.channel)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      Estado
                    </label>
                    <div className="mt-1">
                      <CampaignStatusBadge status={campaign.status} />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      Fecha de Creación
                    </label>
                    <p className="text-gray-900 dark:text-gray-100">
                      {formatDateI18n(campaign.created_at)}
                    </p>
                  </div>
                  {campaign.scheduled_at && (
                    <div>
                      <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        Fecha Programada
                      </label>
                      <p className="text-gray-900 dark:text-gray-100">
                        {formatDateI18n(campaign.scheduled_at)}
                      </p>
                    </div>
                  )}
                </div>

                {detailData?.segment && (
                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      Segmento
                    </label>
                    <div className="mt-1 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {detailData.segment.name}
                          </p>
                          {detailData.segment.description && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              {detailData.segment.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center text-blue-600 dark:text-blue-400">
                          <Users className="h-4 w-4 mr-1" />
                          <span className="font-medium">
                            {formatNumber(detailData.segment.customer_count)} contactos
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {campaign.content && (
                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      Contenido
                    </label>
                    <div className="mt-1 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                        {campaign.content}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Métricas y KPIs */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <span>Métricas de Rendimiento</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <Send className="h-8 w-8 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {formatNumber(metrics.totalSent)}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Enviados</p>
                  </div>
                  <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {formatNumber(metrics.delivered)}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Entregados</p>
                  </div>
                  <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                    <Eye className="h-8 w-8 text-purple-600 dark:text-purple-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      {formatNumber(metrics.opened)}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Abiertos</p>
                  </div>
                  <div className="text-center p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                    <MousePointer className="h-8 w-8 text-orange-600 dark:text-orange-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {formatNumber(metrics.clicked)}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Clics</p>
                  </div>
                </div>

                <Separator className="my-4" />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                      {formatPercentage(metrics.openRate)}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Tasa de Apertura</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                      {formatPercentage(metrics.clickRate)}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Tasa de Clics</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                      {formatPercentage(metrics.conversionRate)}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Conversión</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Acciones */}
            <Card>
              <CardHeader>
                <CardTitle>Acciones</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleEdit} className="flex items-center space-x-2">
                    <Edit className="h-4 w-4" />
                    <span>Editar</span>
                  </Button>
                  <Button variant="outline" onClick={handleDuplicate} className="flex items-center space-x-2">
                    <Copy className="h-4 w-4" />
                    <span>Duplicar</span>
                  </Button>
                  <Button variant="destructive" onClick={handleDelete} className="flex items-center space-x-2">
                    <Trash2 className="h-4 w-4" />
                    <span>Eliminar</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>

      {/* Modal de edición de campaña */}
      {campaign && (
        <CampaignForm
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={handleEditSuccess}
          editCampaign={campaign}
          mode="edit"
        />
      )}
    </Dialog>
  );
};

export default CampaignDetail;
