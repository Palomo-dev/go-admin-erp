'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowLeft,
  Megaphone,
  Edit,
  Play,
  Pause,
  Users,
  Loader2,
  RefreshCw,
  Save,
  X,
  Mail,
  MessageCircle,
  Send,
  Eye,
  MousePointer,
  MessageSquare,
  AlertCircle,
  Download,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { CampanasService } from '../CampanasService';
import {
  Campaign,
  CampaignContact,
  CAMPAIGN_STATUS_CONFIG,
  CHANNEL_CONFIG,
  CampaignChannel,
} from '../types';
import { formatDate } from '@/utils/Utils';

interface CampanaDetallePageProps {
  campaignId: string;
}

export function CampanaDetallePage({ campaignId }: CampanaDetallePageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<CampaignContact[]>([]);
  const [segments, setSegments] = useState<{ id: string; name: string; customer_count: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(searchParams.get('edit') === 'true');
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<CampaignChannel | ''>('');
  const [segmentId, setSegmentId] = useState('');
  const [content, setContent] = useState('');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [campaignData, contactsData, segmentsData] = await Promise.all([
        CampanasService.getCampaignById(campaignId),
        CampanasService.getCampaignContacts(campaignId),
        CampanasService.getSegments(),
      ]);

      if (!campaignData) {
        toast({ title: 'Error', description: 'Campaña no encontrada', variant: 'destructive' });
        router.push('/app/crm/campanas');
        return;
      }

      setCampaign(campaignData);
      setContacts(contactsData);
      setSegments(segmentsData);
      
      // Initialize form
      setName(campaignData.name);
      setChannel(campaignData.channel || '');
      setSegmentId(campaignData.segment_id || '');
      setContent(campaignData.content || '');
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo cargar la campaña', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [campaignId, router, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: 'Error', description: 'El nombre es requerido', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      const updated = await CampanasService.updateCampaign(campaignId, {
        name,
        channel: channel || undefined,
        segment_id: segmentId || undefined,
        content: content || undefined,
      });

      if (updated) {
        toast({ title: 'Campaña actualizada' });
        setIsEditing(false);
        loadData();
      }
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePause = async () => {
    const success = await CampanasService.updateCampaignStatus(campaignId, 'paused');
    if (success) {
      toast({ title: 'Campaña pausada' });
      loadData();
    }
  };

  const handleResume = async () => {
    const success = await CampanasService.updateCampaignStatus(campaignId, 'sending');
    if (success) {
      toast({ title: 'Campaña reanudada' });
      loadData();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-500">Cargando campaña...</p>
        </div>
      </div>
    );
  }

  if (!campaign) return null;

  const statusConfig = CAMPAIGN_STATUS_CONFIG[campaign.status];
  const stats = campaign.statistics || { total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, failed: 0 };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/crm/campanas">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <Megaphone className="h-6 w-6 text-blue-600" />
              </div>
              {campaign.name}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">CRM / Campañas / Detalle</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => { setIsEditing(false); loadData(); }}>
                <X className="h-4 w-4 mr-2" />Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Guardar
              </Button>
            </>
          ) : (
            <>
              {campaign.status === 'sending' && (
                <Button variant="outline" onClick={handlePause}>
                  <Pause className="h-4 w-4 mr-2" />Pausar
                </Button>
              )}
              {campaign.status === 'paused' && (
                <Button variant="outline" onClick={handleResume}>
                  <Play className="h-4 w-4 mr-2" />Reanudar
                </Button>
              )}
              {['draft', 'scheduled'].includes(campaign.status) && (
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  <Edit className="h-4 w-4 mr-2" />Editar
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4 text-center">
            <Send className="h-5 w-5 mx-auto text-blue-600 mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.sent}</p>
            <p className="text-xs text-gray-500">Enviados</p>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4 text-center">
            <CheckCircle className="h-5 w-5 mx-auto text-green-600 mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.delivered}</p>
            <p className="text-xs text-gray-500">Entregados</p>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4 text-center">
            <Eye className="h-5 w-5 mx-auto text-purple-600 mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.opened}</p>
            <p className="text-xs text-gray-500">Abiertos</p>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4 text-center">
            <MousePointer className="h-5 w-5 mx-auto text-orange-600 mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.clicked}</p>
            <p className="text-xs text-gray-500">Clicks</p>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4 text-center">
            <MessageSquare className="h-5 w-5 mx-auto text-teal-600 mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.replied}</p>
            <p className="text-xs text-gray-500">Respuestas</p>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4 text-center">
            <AlertCircle className="h-5 w-5 mx-auto text-yellow-600 mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.bounced}</p>
            <p className="text-xs text-gray-500">Rebotados</p>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4 text-center">
            <XCircle className="h-5 w-5 mx-auto text-red-600 mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.failed}</p>
            <p className="text-xs text-gray-500">Fallidos</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle>Información</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing ? (
                <>
                  <div className="space-y-2">
                    <Label>Nombre</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-gray-50 dark:bg-gray-900" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Canal</Label>
                      <Select value={channel} onValueChange={(v) => setChannel(v as CampaignChannel)}>
                        <SelectTrigger className="bg-gray-50 dark:bg-gray-900"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="whatsapp">WhatsApp</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="sms">SMS</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Segmento</Label>
                      <Select value={segmentId} onValueChange={setSegmentId}>
                        <SelectTrigger className="bg-gray-50 dark:bg-gray-900"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                        <SelectContent>
                          {segments.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Contenido</Label>
                    <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} className="bg-gray-50 dark:bg-gray-900" />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-4 flex-wrap">
                    <Badge className={`${statusConfig.bgColor} ${statusConfig.color}`}>{statusConfig.label}</Badge>
                    {campaign.channel && (
                      <Badge variant="outline">{CHANNEL_CONFIG[campaign.channel].label}</Badge>
                    )}
                  </div>
                  {campaign.segment && (
                    <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <Users className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-700 dark:text-gray-300">{campaign.segment.name}</span>
                      <Badge variant="outline">{campaign.segment.customer_count} contactos</Badge>
                    </div>
                  )}
                  {campaign.scheduled_at && (
                    <p className="text-sm text-gray-500">
                      Programada: {format(new Date(campaign.scheduled_at), "PPP 'a las' HH:mm", { locale: es })}
                    </p>
                  )}
                  {campaign.content && (
                    <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{campaign.content}</p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Contactos */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Contactos ({contacts.length})</CardTitle>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />Exportar
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Enviado</TableHead>
                    <TableHead>Abierto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                        No hay contactos registrados
                      </TableCell>
                    </TableRow>
                  ) : (
                    contacts.slice(0, 20).map((contact) => (
                      <TableRow key={contact.id}>
                        <TableCell>
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {contact.customer?.full_name || 'Sin nombre'}
                          </p>
                          <p className="text-sm text-gray-500">
                            {contact.customer?.email || contact.customer?.phone}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{contact.state}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {contact.sent_at ? formatDate(contact.sent_at) : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {contact.opened_at ? formatDate(contact.opened_at) : '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 h-fit">
          <CardHeader>
            <CardTitle>Métricas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats.sent > 0 && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Tasa de apertura</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {((stats.opened / stats.sent) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Tasa de click</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {((stats.clicked / stats.sent) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Tasa de respuesta</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {((stats.replied / stats.sent) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Tasa de rebote</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {((stats.bounced / stats.sent) * 100).toFixed(1)}%
                  </span>
                </div>
              </>
            )}
            {stats.sent === 0 && (
              <p className="text-center text-gray-500 py-4">Sin datos de envío aún</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
