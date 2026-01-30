'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  MessageSquare,
  Globe,
  Mail,
  Phone,
  Instagram,
  Facebook,
  Loader2,
  Check,
} from 'lucide-react';
import ChatChannelsService, {
  ChannelType,
  AIMode,
  CreateChannelData
} from '@/lib/services/chatChannelsService';

const channelTypes: { type: ChannelType; label: string; icon: React.ReactNode; description: string }[] = [
  {
    type: 'website',
    label: 'Sitio Web',
    icon: <Globe className="h-6 w-6" />,
    description: 'Widget de chat para tu sitio web'
  },
  {
    type: 'whatsapp',
    label: 'WhatsApp',
    icon: <Phone className="h-6 w-6" />,
    description: 'Conecta tu número de WhatsApp Business'
  },
  {
    type: 'email',
    label: 'Email',
    icon: <Mail className="h-6 w-6" />,
    description: 'Recibe y responde emails como conversaciones'
  },
  {
    type: 'instagram',
    label: 'Instagram',
    icon: <Instagram className="h-6 w-6" />,
    description: 'Mensajes directos de Instagram'
  },
  {
    type: 'facebook',
    label: 'Facebook',
    icon: <Facebook className="h-6 w-6" />,
    description: 'Messenger de Facebook'
  },
];

const aiModes: { value: AIMode; label: string; description: string }[] = [
  { value: 'off', label: 'Desactivado', description: 'Sin asistencia de IA' },
  { value: 'hybrid', label: 'Híbrido', description: 'IA sugiere, humano aprueba' },
  { value: 'auto', label: 'Automático', description: 'IA responde automáticamente' },
];

export default function NuevoCanalPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<ChannelType | null>(null);
  const [name, setName] = useState('');
  const [aiMode, setAiMode] = useState<AIMode>('hybrid');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelectType = (type: ChannelType) => {
    setSelectedType(type);
    const typeInfo = channelTypes.find(t => t.type === type);
    if (typeInfo) {
      setName(`Canal ${typeInfo.label}`);
    }
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!organizationId || !selectedType || !name.trim()) return;

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      const service = new ChatChannelsService(organizationId);
      const data: CreateChannelData = {
        name: name.trim(),
        type: selectedType,
        ai_mode: aiMode,
      };

      const newChannel = await service.createChannel(data, user.id);

      toast({
        title: 'Canal creado',
        description: `El canal "${newChannel.name}" ha sido creado exitosamente`
      });

      router.push(`/app/crm/configuracion/canales/${newChannel.id}`);
    } catch (error) {
      console.error('Error creando canal:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear el canal',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/app/crm/configuracion/canales')}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <MessageSquare className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  Nuevo Canal
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Paso {step} de 2: {step === 1 ? 'Selecciona el tipo' : 'Configura el canal'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {step === 1 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              ¿Qué tipo de canal deseas crear?
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {channelTypes.map((channel) => (
                <Card
                  key={channel.type}
                  className={`cursor-pointer transition-all hover:shadow-lg ${
                    selectedType === channel.type
                      ? 'ring-2 ring-blue-500 border-blue-500'
                      : 'border-gray-200 dark:border-gray-800'
                  } bg-white dark:bg-gray-900`}
                  onClick={() => handleSelectType(channel.type)}
                >
                  <CardHeader className="pb-2">
                    <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30 w-fit">
                      <span className="text-blue-600 dark:text-blue-400">
                        {channel.icon}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardTitle className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                      {channel.label}
                    </CardTitle>
                    <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
                      {channel.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  {channelTypes.find(t => t.type === selectedType)?.icon}
                </div>
                <div>
                  <CardTitle className="text-lg">
                    Configurar {channelTypes.find(t => t.type === selectedType)?.label}
                  </CardTitle>
                  <CardDescription>
                    Completa la información básica del canal
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre del canal</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Soporte Principal"
                  className="bg-white dark:bg-gray-900"
                />
              </div>

              <div className="space-y-2">
                <Label>Modo de IA</Label>
                <Select value={aiMode} onValueChange={(v) => setAiMode(v as AIMode)}>
                  <SelectTrigger className="bg-white dark:bg-gray-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {aiModes.map((mode) => (
                      <SelectItem key={mode.value} value={mode.value}>
                        <div>
                          <span className="font-medium">{mode.label}</span>
                          <span className="text-gray-500 ml-2">- {mode.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="flex-1"
                >
                  Atrás
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!name.trim() || isSubmitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creando...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Crear Canal
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
