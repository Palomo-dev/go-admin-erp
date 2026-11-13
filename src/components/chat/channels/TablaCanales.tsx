'use client';

/**
 * «Mis canales» (Figma 91-chat-20): tabla con estado de conexión, modo de IA
 * editable, conversaciones abiertas, última actividad e interruptor Activo.
 * Los cambios los hace la página con `chatChannelsService` (no se duplica).
 */
import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Settings } from 'lucide-react';
import { DataTable, type ColumnaTabla, type EstadoTabla } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AIMode, ActividadCanal, ChatChannel } from '@/lib/services/chatChannelsService';
import { CanalIcono, canalDeTipo } from '@/components/chat/ui/CanalIcono';
import { detalleCanal, estadoConexion, MODOS_IA, tiempoRelativo, type EstadoConexion } from './canalesLogica';

const TONO_ESTADO: Record<EstadoConexion, 'exito' | 'peligro' | 'advertencia' | 'neutro'> = {
  conectado: 'exito',
  tokenVencido: 'peligro',
  suspendido: 'peligro',
  sinConectar: 'advertencia',
  inactivo: 'neutro',
};

export interface TablaCanalesProps {
  canales: readonly ChatChannel[];
  actividad: Record<string, ActividadCanal>;
  estado: EstadoTabla;
  /** Ids con un cambio en curso (deshabilita sus controles). */
  guardando: ReadonlySet<string>;
  onCambiarModo: (canal: ChatChannel, modo: AIMode) => void;
  onAlternarActivo: (canal: ChatChannel) => void;
  onConfigurar: (canal: ChatChannel) => void;
  onReintentar: () => void;
  onNuevo: () => void;
}

export function TablaCanales({ canales, actividad, estado, guardando, onCambiarModo, onAlternarActivo, onConfigurar, onReintentar, onNuevo }: TablaCanalesProps) {
  const t = useTranslations('chatModulo.canales');
  const locale = useLocale();
  const ahora = useMemo(() => new Date(), [actividad]); // eslint-disable-line react-hooks/exhaustive-deps

  const textoDetalle = (c: ChatChannel) => {
    const d = detalleCanal(c);
    if (d.clave === 'dominios') return t('detalle.dominios', { valor: d.valor ?? '', n: d.n ?? 0 });
    if (d.clave === 'conexion') return t(`nuevo.formas.${d.valor as 'cloud_api' | 'coexistence' | 'qr_scan'}`);
    return t(`detalle.${d.clave}`);
  };

  const columnas: ColumnaTabla<ChatChannel>[] = [
    {
      id: 'canal',
      encabezado: t('tabla.canal'),
      celda: (c) => (
        <div className="flex min-w-0 items-center gap-3">
          <CanalIcono canal={canalDeTipo(c.type)} size={32} className="rounded-lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{c.name}</p>
            <p className="truncate text-xs text-fg-muted">{textoDetalle(c)}</p>
          </div>
        </div>
      ),
    },
    {
      id: 'estado',
      encabezado: t('tabla.estado'),
      ancho: 150,
      celda: (c) => {
        const e = estadoConexion(c);
        return (
          <Badge tono={TONO_ESTADO[e]} tamano="sm">
            {t(`estados.${e}`)}
          </Badge>
        );
      },
    },
    {
      id: 'modo',
      encabezado: t('tabla.modoIa'),
      ancho: 220,
      ocultarDebajo: 'md',
      celda: (c) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Select value={c.ai_mode} onValueChange={(v) => onCambiarModo(c, v as AIMode)} disabled={guardando.has(c.id)}>
            <SelectTrigger className="h-9 w-[200px]" aria-label={t('tabla.modoDe', { nombre: c.name })}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODOS_IA.map((m) => (
                <SelectItem key={m} value={m}>
                  {t(`modos.${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ),
    },
    {
      id: 'abiertas',
      encabezado: t('tabla.abiertas'),
      variante: 'importe',
      ancho: 96,
      ocultarDebajo: 'lg',
      celda: (c) => (actividad[c.id]?.abiertas ?? 0).toLocaleString(locale),
    },
    {
      id: 'actividad',
      encabezado: t('tabla.ultimaActividad'),
      ancho: 150,
      ocultarDebajo: 'lg',
      celda: (c) => (
        <span className="text-sm text-fg-secondary">
          {tiempoRelativo(actividad[c.id]?.ultimaActividad, ahora, locale) ?? t('tabla.sinActividad')}
        </span>
      ),
    },
    {
      id: 'activo',
      encabezado: t('tabla.activo'),
      ancho: 88,
      celda: (c) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Switch
            checked={c.status === 'active'}
            disabled={guardando.has(c.id)}
            onCheckedChange={() => onAlternarActivo(c)}
            aria-label={t('tabla.activar', { nombre: c.name })}
          />
        </div>
      ),
    },
  ];

  return (
    <DataTable<ChatChannel>
      etiqueta={t('tabla.etiqueta')}
      columnas={columnas}
      filas={canales}
      obtenerId={(c) => c.id}
      estado={estado}
      onFilaClick={onConfigurar}
      etiquetaFila={(c) => c.name}
      acciones={(c) => [{ id: 'configurar', etiqueta: t('acciones.configurar'), icono: Settings, onSelect: () => onConfigurar(c) }]}
      vacio={{ titulo: t('tabla.vacioTitulo'), descripcion: t('tabla.vacioDescripcion'), accion: { etiqueta: t('nuevoCanal'), onClick: onNuevo } }}
      error={{ titulo: t('tabla.errorTitulo') }}
      onReintentar={onReintentar}
      tarjetaMovil={(c) => {
        const e = estadoConexion(c);
        return (
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
            <CanalIcono canal={canalDeTipo(c.type)} size={36} className="rounded-lg" />
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onConfigurar(c)}>
              <p className="truncate text-sm font-medium text-fg">{c.name}</p>
              <p className="truncate text-xs text-fg-muted">
                {t(`modosCorto.${c.ai_mode}`)} · {(actividad[c.id]?.abiertas ?? 0).toLocaleString(locale)} {t('tabla.abiertas').toLowerCase()}
              </p>
              <Badge tono={TONO_ESTADO[e]} tamano="sm" className="mt-1">
                {t(`estados.${e}`)}
              </Badge>
            </button>
            <Switch
              checked={c.status === 'active'}
              disabled={guardando.has(c.id)}
              onCheckedChange={() => onAlternarActivo(c)}
              aria-label={t('tabla.activar', { nombre: c.name })}
            />
          </div>
        );
      }}
    />
  );
}
