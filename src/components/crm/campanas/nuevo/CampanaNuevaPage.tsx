'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowLeft,
  Megaphone,
  Loader2,
  Users,
  Calendar as CalendarIcon,
  Mail,
  MessageCircle,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/components/ui/use-toast';
import { CampanasService } from '../CampanasService';
import { CampaignChannel, CHANNEL_CONFIG } from '../types';

export function CampanaNuevaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  const preSelectedSegment = searchParams.get('segment');

  const [name, setName] = useState('');
  const [channel, setChannel] = useState<CampaignChannel | ''>('');
  const [segmentId, setSegmentId] = useState(preSelectedSegment || '');
  const [content, setContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState<Date | undefined>(undefined);
  const [segments, setSegments] = useState<{ id: string; name: string; customer_count: number }[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSegments();
  }, []);

  const loadSegments = async () => {
    const data = await CampanasService.getSegments();
    setSegments(data);
  };

  const selectedSegment = segments.find(s => s.id === segmentId);

  const handleSave = async (asDraft = true) => {
    if (!name.trim()) {
      toast({ title: 'Error', description: 'El nombre es requerido', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      const campaign = await CampanasService.createCampaign({
        name,
        channel: channel || undefined,
        segment_id: segmentId || undefined,
        content: content || undefined,
        scheduled_at: scheduledAt?.toISOString(),
      });

      if (campaign) {
        if (!asDraft && scheduledAt) {
          await CampanasService.updateCampaignStatus(campaign.id, 'scheduled');
        }
        
        toast({ title: asDraft ? 'Borrador guardado' : 'Campaña programada' });
        router.push(`/app/crm/campanas/${campaign.id}`);
      }
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo crear la campaña', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

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
              Nueva Campaña
            </h1>
            <p className="text-gray-500 dark:text-gray-400">CRM / Campañas / Nueva</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button variant="outline" onClick={() => handleSave(true)} disabled={isSaving || !name.trim()}>
            Guardar borrador
          </Button>
          <Button
            onClick={() => handleSave(false)}
            disabled={isSaving || !name.trim() || !scheduledAt}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Programar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulario */}
        <div className="lg:col-span-2 space-y-6">
          {/* Información básica */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-gray-100">Información</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre de la campaña *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Promoción Black Friday"
                  className="bg-gray-50 dark:bg-gray-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Canal</Label>
                  <Select value={channel} onValueChange={(v) => setChannel(v as CampaignChannel)}>
                    <SelectTrigger className="bg-gray-50 dark:bg-gray-900">
                      <SelectValue placeholder="Seleccionar canal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">
                        <div className="flex items-center gap-2">
                          <MessageCircle className="h-4 w-4 text-green-600" />
                          WhatsApp
                        </div>
                      </SelectItem>
                      <SelectItem value="email">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-blue-600" />
                          Email
                        </div>
                      </SelectItem>
                      <SelectItem value="sms">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-purple-600" />
                          SMS
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Segmento</Label>
                  <Select value={segmentId} onValueChange={setSegmentId}>
                    <SelectTrigger className="bg-gray-50 dark:bg-gray-900">
                      <SelectValue placeholder="Seleccionar segmento" />
                    </SelectTrigger>
                    <SelectContent>
                      {segments.map((seg) => (
                        <SelectItem key={seg.id} value={seg.id}>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-gray-400" />
                            {seg.name}
                            <Badge variant="outline" className="text-xs ml-2">{seg.customer_count}</Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Fecha de envío</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start bg-gray-50 dark:bg-gray-900">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {scheduledAt ? format(scheduledAt, "PPP 'a las' HH:mm", { locale: es }) : 'Seleccionar fecha'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={scheduledAt}
                      onSelect={setScheduledAt}
                      locale={es}
                      disabled={(date) => date < new Date()}
                    />
                    <div className="p-3 border-t">
                      <Input
                        type="time"
                        value={scheduledAt ? format(scheduledAt, 'HH:mm') : ''}
                        onChange={(e) => {
                          if (scheduledAt) {
                            const [hours, minutes] = e.target.value.split(':');
                            const newDate = new Date(scheduledAt);
                            newDate.setHours(parseInt(hours), parseInt(minutes));
                            setScheduledAt(newDate);
                          }
                        }}
                        className="bg-gray-50 dark:bg-gray-900"
                      />
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </CardContent>
          </Card>

          {/* Contenido */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-gray-100">Contenido del mensaje</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Escribe el contenido de tu campaña..."
                rows={8}
                className="bg-gray-50 dark:bg-gray-900"
              />
              <p className="text-sm text-gray-500 mt-2">
                Variables disponibles: {'{nombre}'}, {'{email}'}, {'{telefono}'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Preview */}
        <div className="space-y-6">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-gray-100">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <p className="text-sm text-gray-500">Canal</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {channel ? CHANNEL_CONFIG[channel].label : 'No seleccionado'}
                </p>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <p className="text-sm text-gray-500">Segmento</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {selectedSegment?.name || 'No seleccionado'}
                </p>
                {selectedSegment && (
                  <Badge className="mt-1 bg-blue-100 text-blue-700">
                    {selectedSegment.customer_count} destinatarios
                  </Badge>
                )}
              </div>

              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <p className="text-sm text-gray-500">Programada para</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {scheduledAt ? format(scheduledAt, "PPP 'a las' HH:mm", { locale: es }) : 'Sin programar'}
                </p>
              </div>
            </CardContent>
          </Card>

          {content && (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-gray-900 dark:text-gray-100">Vista previa</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{content}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
