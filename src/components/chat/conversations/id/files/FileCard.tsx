'use client';

import React, { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Copy,
  Download,
  ExternalLink,
  File,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Mic,
  Trash2,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { ConfirmDialog, RowActionsMenu, type AccionFila } from '@/components/kit';
import { cn } from '@/utils/Utils';
import type { ConversationFile } from '@/lib/services/conversationFilesService';
import { categoriaArchivo, type CategoriaArchivo } from '@/lib/services/chat/categoriaArchivo';
import { useMomentoCorto } from '../useMomentoCorto';
import { remitenteArchivo, tamanoLegible } from './archivosLogica';

interface FileCardProps {
  file: ConversationFile;
  onOpen: (file: ConversationFile) => Promise<void>;
  onDownload: (file: ConversationFile) => Promise<void>;
  onCopyLink: (file: ConversationFile) => Promise<void>;
  onDelete?: (file: ConversationFile) => Promise<void>;
  canDelete?: boolean;
}

const APARIENCIA: Record<CategoriaArchivo, { icono: LucideIcon; fondo: string }> = {
  image: { icono: ImageIcon, fondo: 'bg-brand-tint' },
  video: { icono: Video, fondo: 'bg-info-subtle' },
  audio: { icono: Mic, fondo: 'bg-warning-subtle' },
  pdf: { icono: FileText, fondo: 'bg-subtle' },
  document: { icono: FileText, fondo: 'bg-subtle' },
  spreadsheet: { icono: FileSpreadsheet, fondo: 'bg-success-subtle' },
  archive: { icono: FileArchive, fondo: 'bg-subtle' },
  other: { icono: File, fondo: 'bg-subtle' },
};

/**
 * Tarjeta de un archivo (Figma 91-chat-12): vista con el icono del tipo sobre
 * un tinte, nombre, «Cliente · hoy 10:31 · 1,2 MB» y menú «⋮» con abrir,
 * descargar, copiar enlace (vence en 1 hora) y eliminar con confirmación.
 */
export default function FileCard({ file, onOpen, onDownload, onCopyLink, onDelete, canDelete = false }: FileCardProps) {
  const t = useTranslations('chatHilo.archivos');
  const locale = useLocale();
  const momento = useMomentoCorto();
  const [confirmar, setConfirmar] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  const { icono: Icono, fondo } = APARIENCIA[categoriaArchivo(file.mime_type)];
  const cuando = momento(file.created_at);
  const meta = [t(`remitente.${remitenteArchivo(file)}`), cuando.corto, tamanoLegible(file.size_bytes, locale)].filter(Boolean).join(' · ');

  const acciones: AccionFila[] = [
    { id: 'abrir', etiqueta: t('abrir'), icono: ExternalLink, onSelect: () => void onOpen(file).catch(() => undefined) },
    { id: 'descargar', etiqueta: t('descargar'), icono: Download, onSelect: () => void onDownload(file).catch(() => undefined) },
    { id: 'copiar', etiqueta: t('copiarEnlace'), icono: Copy, onSelect: () => void onCopyLink(file).catch(() => undefined) },
    {
      id: 'eliminar',
      etiqueta: t('eliminar'),
      icono: Trash2,
      destructiva: true,
      oculta: !canDelete || !onDelete,
      onSelect: () => setConfirmar(true),
    },
  ];

  const eliminar = async () => {
    if (!onDelete) return;
    try {
      setEliminando(true);
      await onDelete(file);
      setConfirmar(false);
    } catch {
      // El aviso lo da la página; el diálogo queda abierto para reintentar.
    } finally {
      setEliminando(false);
    }
  };

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => void onOpen(file).catch(() => undefined)}
        aria-label={t('abrirArchivo', { nombre: file.file_name })}
        className={cn(
          'flex h-[120px] items-center justify-center text-fg-secondary transition-opacity hover:opacity-90',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
          fondo,
        )}
      >
        <Icono aria-hidden="true" className="size-8" strokeWidth={1.25} />
      </button>
      <div className="flex items-start gap-2 border-t border-line px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[13px] font-medium text-fg" title={file.file_name}>
            {file.file_name}
          </h3>
          <p className="truncate text-xs text-fg-muted" title={cuando.largo}>
            {meta}
          </p>
        </div>
        <RowActionsMenu acciones={acciones} titulo={file.file_name} orientacion="horizontal" />
      </div>

      <ConfirmDialog
        abierto={confirmar}
        onAbiertoChange={(a) => !eliminando && setConfirmar(a)}
        titulo={t('borrar.titulo')}
        descripcion={t('borrar.descripcion', { nombre: file.file_name })}
        textoConfirmar={t('borrar.confirmar')}
        tono="peligro"
        icono={Trash2}
        cargando={eliminando}
        onConfirmar={eliminar}
      />
    </article>
  );
}
