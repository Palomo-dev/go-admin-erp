'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  RefreshCw,
  ArrowLeft,
  Megaphone,
  Mail,
  MessageCircle,
  MessageSquare,
  MoreVertical,
  Eye,
  Edit,
  Copy,
  Trash2,
  Play,
  Pause,
  Users,
  Send,
  FileText,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { CampanasService } from './CampanasService';
import { Campaign, CampaignStats, CAMPAIGN_STATUS_CONFIG, CHANNEL_CONFIG, CampaignChannel } from './types';
import { formatDate } from '@/utils/Utils';

const channelIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  MessageCircle,
  Mail,
  MessageSquare,
};

export function CampanasPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<CampaignStats>({ total: 0, draft: 0, scheduled: 0, sending: 0, sent: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [deleteCampaign, setDeleteCampaign] = useState<Campaign | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [campaignsData, statsData] = await Promise.all([
        CampanasService.getCampaigns(),
        CampanasService.getStats(),
      ]);
      setCampaigns(campaignsData);
      setStats(statsData);
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudieron cargar las campañas', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDuplicate = async (campaign: Campaign) => {
    const duplicated = await CampanasService.duplicateCampaign(campaign.id);
    if (duplicated) {
      toast({ title: 'Campaña duplicada' });
      loadData();
    }
  };

  const handleDelete = async () => {
    if (!deleteCampaign) return;
    const success = await CampanasService.deleteCampaign(deleteCampaign.id);
    if (success) {
      toast({ title: 'Campaña eliminada' });
      loadData();
    }
    setDeleteCampaign(null);
  };

  const handlePause = async (campaign: Campaign) => {
    const success = await CampanasService.updateCampaignStatus(campaign.id, 'paused');
    if (success) {
      toast({ title: 'Campaña pausada' });
      loadData();
    }
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/crm">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <Megaphone className="h-6 w-6 text-blue-600" />
              </div>
              Campañas
            </h1>
            <p className="text-gray-500 dark:text-gray-400">CRM / Campañas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Link href="/app/crm/campanas/nuevo">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="h-4 w-4 mr-2" />
              Nueva Campaña
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
                <p className="text-sm text-gray-500">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <Edit className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.draft}</p>
                <p className="text-sm text-gray-500">Borradores</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.scheduled}</p>
                <p className="text-sm text-gray-500">Programadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                <Send className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.sending}</p>
                <p className="text-sm text-gray-500">Enviando</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Megaphone className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.sent}</p>
                <p className="text-sm text-gray-500">Enviadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-900">
              <TableHead>Campaña</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Segmento</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Programada</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <RefreshCw className="h-5 w-5 animate-spin text-blue-600 mx-auto mb-2" />
                  <span className="text-gray-500">Cargando...</span>
                </TableCell>
              </TableRow>
            ) : campaigns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <Megaphone className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No hay campañas</h3>
                  <p className="text-gray-500 mb-4">Crea tu primera campaña de marketing</p>
                  <Link href="/app/crm/campanas/nuevo">
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                      <Plus className="h-4 w-4 mr-2" />
                      Crear Campaña
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ) : (
              campaigns.map((campaign) => {
                const statusConfig = CAMPAIGN_STATUS_CONFIG[campaign.status] || CAMPAIGN_STATUS_CONFIG.draft;
                const channelConfig = campaign.channel ? CHANNEL_CONFIG[campaign.channel] : null;
                const ChannelIcon = channelConfig ? channelIcons[channelConfig.icon] || Mail : Mail;

                return (
                  <TableRow
                    key={campaign.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer"
                    onClick={() => router.push(`/app/crm/campanas/${campaign.id}`)}
                  >
                    <TableCell>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{campaign.name}</p>
                    </TableCell>
                    <TableCell>
                      {channelConfig ? (
                        <div className="flex items-center gap-2">
                          <ChannelIcon className={`h-4 w-4 ${channelConfig.color}`} />
                          <span className="text-sm text-gray-600 dark:text-gray-400">{channelConfig.label}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {campaign.segment ? (
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{campaign.segment.name}</span>
                          <Badge variant="outline" className="text-xs">{campaign.segment.customer_count}</Badge>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${statusConfig.bgColor} ${statusConfig.color}`}>
                        {statusConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {campaign.scheduled_at ? formatDate(campaign.scheduled_at) : '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/app/crm/campanas/${campaign.id}`); }}>
                            <Eye className="h-4 w-4 mr-2" />Ver detalle
                          </DropdownMenuItem>
                          {['draft', 'scheduled'].includes(campaign.status) && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/app/crm/campanas/${campaign.id}?edit=true`); }}>
                              <Edit className="h-4 w-4 mr-2" />Editar
                            </DropdownMenuItem>
                          )}
                          {campaign.status === 'sending' && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handlePause(campaign); }}>
                              <Pause className="h-4 w-4 mr-2" />Pausar
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDuplicate(campaign); }}>
                            <Copy className="h-4 w-4 mr-2" />Duplicar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDeleteCampaign(campaign); }} className="text-red-600">
                            <Trash2 className="h-4 w-4 mr-2" />Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteCampaign} onOpenChange={() => setDeleteCampaign(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-900">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar campaña?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
