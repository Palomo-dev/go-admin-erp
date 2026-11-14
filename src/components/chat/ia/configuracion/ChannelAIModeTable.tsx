'use client';

/**
 * Configuración › Chat › IA › Canales: modo de la IA en cada canal. Textos en
 * `chatConfig.ia.canales` (es/en/fr/pt) y colores por tokens. El modo de cada
 * canal se guarda al instante (no pasa por la barra de guardar).
 */
import { useTranslations } from 'next-intl';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  MessageCircle,
  Bot,
  Users,
  Shuffle,
  Globe,
  Instagram,
  Facebook,
  MessageSquare
} from 'lucide-react';
import { Channel, AI_MODE_OPTIONS } from '@/lib/services/aiSettingsService';

type ModoIa = 'auto' | 'hybrid' | 'manual';

interface ChannelAIModeTableProps {
  channels: Channel[];
  loading: boolean;
  onModeChange: (channelId: string, mode: ModoIa) => void;
  onApplyToAll: (mode: ModoIa) => void;
}

const channelIcons: Record<string, React.ReactNode> = {
  whatsapp: <MessageCircle aria-hidden="true" className="h-4 w-4 text-success-text" />,
  website: <Globe aria-hidden="true" className="h-4 w-4 text-brand" />,
  instagram: <Instagram aria-hidden="true" className="h-4 w-4 text-danger-text" />,
  facebook: <Facebook aria-hidden="true" className="h-4 w-4 text-brand" />,
  default: <MessageSquare aria-hidden="true" className="h-4 w-4 text-fg-muted" />
};

const modeIcons: Record<string, React.ReactNode> = {
  auto: <Bot aria-hidden="true" className="h-4 w-4 text-brand" />,
  hybrid: <Shuffle aria-hidden="true" className="h-4 w-4 text-info-text" />,
  manual: <Users aria-hidden="true" className="h-4 w-4 text-success-text" />
};

const modeTono: Record<string, 'marca' | 'informacion' | 'exito'> = {
  auto: 'marca',
  hybrid: 'informacion',
  manual: 'exito'
};

const modeFondo: Record<string, string> = {
  auto: 'bg-brand-tint',
  hybrid: 'bg-info-subtle',
  manual: 'bg-success-subtle'
};

export default function ChannelAIModeTable({
  channels,
  onModeChange,
  onApplyToAll
}: ChannelAIModeTableProps) {
  const t = useTranslations('chatConfig.ia.canales');
  const getChannelIcon = (type: string) => channelIcons[type.toLowerCase()] || channelIcons.default;
  const nombreModo = (mode: string) => (t.has(`modos.${mode}.nombre`) ? t(`modos.${mode}.nombre`) : AI_MODE_OPTIONS.find((m) => m.value === mode)?.label || mode);
  const descripcionModo = (mode: string) => (t.has(`modos.${mode}.descripcion`) ? t(`modos.${mode}.descripcion`) : AI_MODE_OPTIONS.find((m) => m.value === mode)?.description || '');

  return (
    <Card className="border-line bg-surface">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base font-medium text-fg">
            <MessageCircle aria-hidden="true" className="h-4 w-4 text-brand" />
            {t('titulo')}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span id="ia-aplicar-todos" className="text-sm text-fg-muted">{t('aplicarTodos')}</span>
            <Select onValueChange={(value) => onApplyToAll(value as ModoIa)}>
              <SelectTrigger aria-labelledby="ia-aplicar-todos" className="w-[160px] bg-surface">
                <SelectValue placeholder={t('seleccionar')} />
              </SelectTrigger>
              <SelectContent>
                {AI_MODE_OPTIONS.map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    <div className="flex items-center gap-2">
                      {modeIcons[mode.value]}
                      {nombreModo(mode.value)}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {channels.length === 0 ? (
          <div className="py-8 text-center">
            <MessageCircle aria-hidden="true" className="mx-auto mb-4 h-12 w-12 text-fg-muted" />
            <p className="text-fg-secondary">{t('vacioTitulo')}</p>
            <p className="mt-1 text-sm text-fg-muted">{t('vacioDescripcion')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-line">
                  <TableHead className="text-fg-secondary">{t('columnas.canal')}</TableHead>
                  <TableHead className="text-fg-secondary">{t('columnas.tipo')}</TableHead>
                  <TableHead className="text-fg-secondary">{t('columnas.estado')}</TableHead>
                  <TableHead className="text-fg-secondary">{t('columnas.modo')}</TableHead>
                  <TableHead className="w-[180px] text-fg-secondary">{t('columnas.cambiar')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {channels.map((channel) => (
                  <TableRow key={channel.id} className="border-line hover:bg-hover">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-subtle p-2">{getChannelIcon(channel.type)}</div>
                        <span className="font-medium text-fg">{channel.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="capitalize text-fg-secondary">{channel.type}</TableCell>
                    <TableCell>
                      <Badge tono={channel.status === 'active' ? 'exito' : 'neutro'} tamano="sm">
                        {channel.status === 'active' ? t('activo') : t('inactivo')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge tono={modeTono[channel.ai_mode] ?? 'informacion'} tamano="sm">
                        <span className="flex items-center gap-1">
                          {modeIcons[channel.ai_mode]}
                          {nombreModo(channel.ai_mode)}
                        </span>
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select value={channel.ai_mode} onValueChange={(value) => onModeChange(channel.id, value as ModoIa)}>
                        <SelectTrigger aria-label={t('cambiarModo', { canal: channel.name })} className="bg-surface">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AI_MODE_OPTIONS.map((mode) => (
                            <SelectItem key={mode.value} value={mode.value}>
                              <div className="flex items-center gap-2">
                                {modeIcons[mode.value]}
                                {nombreModo(mode.value)}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="mt-6 rounded-lg bg-subtle p-4">
          <p className="mb-3 text-sm font-medium text-fg-secondary">{t('modosDisponibles')}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {AI_MODE_OPTIONS.map((mode) => (
              <div key={mode.value} className="flex items-start gap-3">
                <div className={`rounded-lg p-2 ${modeFondo[mode.value] ?? 'bg-subtle'}`}>{modeIcons[mode.value]}</div>
                <div>
                  <p className="text-sm font-medium text-fg">{nombreModo(mode.value)}</p>
                  <p className="text-xs text-fg-muted">{descripcionModo(mode.value)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
