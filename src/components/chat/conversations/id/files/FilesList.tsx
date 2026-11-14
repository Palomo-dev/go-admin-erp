'use client';

import React, { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileX } from 'lucide-react';
import { EmptyState, SearchInput } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ConversationFile } from '@/lib/services/conversationFilesService';
import FileCard from './FileCard';
import {
  FILTROS_REMITENTE,
  FILTROS_TIPO_ARCHIVO,
  filtrarArchivos,
  type FiltroRemitente,
  type FiltroTipoArchivo,
} from './archivosLogica';

interface FilesListProps {
  files: ConversationFile[];
  loading: boolean;
  onOpen: (file: ConversationFile) => Promise<void>;
  onDownload: (file: ConversationFile) => Promise<void>;
  onCopyLink: (file: ConversationFile) => Promise<void>;
  onDelete?: (file: ConversationFile) => Promise<void>;
  canDelete?: boolean;
}

/**
 * Lista de la pestaña «Archivos» (Figma 91-chat-12): buscador, tipo y «Enviados
 * por» en una fila; debajo, la cuadrícula de tarjetas y el aviso de enlaces.
 */
export default function FilesList({ files, loading, onOpen, onDownload, onCopyLink, onDelete, canDelete = false }: FilesListProps) {
  const t = useTranslations('chatHilo.archivos');
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState<FiltroTipoArchivo>('todos');
  const [remitente, setRemitente] = useState<FiltroRemitente>('todos');

  const visibles = useMemo(() => filtrarArchivos(files, { busqueda, tipo, remitente }), [files, busqueda, tipo, remitente]);
  const hayFiltros = busqueda.trim() !== '' || tipo !== 'todos' || remitente !== 'todos';

  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-3 lg:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={busqueda}
          onChange={setBusqueda}
          onValueChange={setBusqueda}
          placeholder={t('buscar')}
          etiqueta={t('buscar')}
          tamano="sm"
          className="w-full sm:max-w-xs"
        />
        <Select value={tipo} onValueChange={(v) => setTipo(v as FiltroTipoArchivo)}>
          <SelectTrigger className="h-8 w-full sm:w-48" aria-label={t('filtroTipo')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTROS_TIPO_ARCHIVO.map((v) => (
              <SelectItem key={v} value={v}>
                {t(`tipos.${v}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={remitente} onValueChange={(v) => setRemitente(v as FiltroRemitente)}>
          <SelectTrigger className="h-8 w-full sm:w-48" aria-label={t('remitente.etiqueta')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTROS_REMITENTE.map((v) => (
              <SelectItem key={v} value={v}>
                {v === 'todos' ? t('remitente.todos') : t('remitente.filtro', { quien: t(`remitente.${v}`) })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {loading ? '' : t('conteo', { visibles: visibles.length, total: files.length })}
      </p>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-line bg-surface">
              <Skeleton className="h-[120px] w-full rounded-none" />
              <div className="space-y-1.5 px-3 py-2.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : visibles.length === 0 ? (
        hayFiltros ? (
          <EmptyState
            variante="search"
            titulo={t('sinResultadosTitulo')}
            descripcion={t('sinResultadosDescripcion')}
            termino={busqueda || undefined}
            onLimpiarFiltros={() => {
              setBusqueda('');
              setTipo('todos');
              setRemitente('todos');
            }}
          />
        ) : (
          <EmptyState icono={FileX} titulo={t('vacioTitulo')} descripcion={t('vacioDescripcion')} />
        )
      ) : (
        <ul aria-label={t('lista')} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {visibles.map((file) => (
            <li key={file.id}>
              <FileCard
                file={file}
                onOpen={onOpen}
                onDownload={onDownload}
                onCopyLink={onCopyLink}
                onDelete={onDelete}
                canDelete={canDelete}
              />
            </li>
          ))}
        </ul>
      )}

      {!loading && files.length > 0 ? <p className="text-xs text-fg-muted">{t('aviso')}</p> : null}
    </div>
  );
}
