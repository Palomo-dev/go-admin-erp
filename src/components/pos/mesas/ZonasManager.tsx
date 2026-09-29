'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Layers, Pencil, Trash2 } from 'lucide-react';
import { Dialogo, EmptyState, FormField, PanelAdaptable } from '@/components/kit';

interface ZonasManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zonas: string[];
  onEditarZona: (zonaAntigua: string, zonaNueva: string) => Promise<void>;
  onEliminarZona: (zona: string) => Promise<void>;
}

export function ZonasManager({
  open,
  onOpenChange,
  zonas,
  onEditarZona,
  onEliminarZona,
}: ZonasManagerProps) {
  const t = useTranslations('posMesas.zonas');
  const [zonaEditar, setZonaEditar] = useState<string | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [zonaEliminar, setZonaEliminar] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleEditar = async () => {
    if (!zonaEditar || !nuevoNombre.trim()) return;

    setIsProcessing(true);
    try {
      await onEditarZona(zonaEditar, nuevoNombre.trim());
      setZonaEditar(null);
      setNuevoNombre('');
    } catch (error) {
      console.error('Error editando zona:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEliminar = async () => {
    if (!zonaEliminar) return;

    setIsProcessing(true);
    try {
      await onEliminarZona(zonaEliminar);
      setZonaEliminar(null);
    } catch (error) {
      console.error('Error eliminando zona:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <PanelAdaptable
        abierto={open}
        onAbiertoChange={onOpenChange}
        titulo={t('titulo')}
        icono={Layers}
        ancho={560}
        pie={
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cerrar')}
          </Button>
        }
      >
        {zonas.length === 0 ? (
          <EmptyState compacto variante="empty" icono={Layers} titulo={t('vacioTitulo')} descripcion={t('vacioDescripcion')} />
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {zonas.map((zona) => (
              <li key={zona} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 truncate font-medium text-fg">{zona}</span>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t('editarZona', { zona })}
                    title={t('editarZona', { zona })}
                    onClick={() => {
                      setZonaEditar(zona);
                      setNuevoNombre(zona);
                    }}
                  >
                    <Pencil aria-hidden="true" className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t('eliminarZona', { zona })}
                    title={t('eliminarZona', { zona })}
                    onClick={() => setZonaEliminar(zona)}
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4 text-danger-text" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PanelAdaptable>

      {/* Editar zona */}
      <Dialogo
        abierto={!!zonaEditar}
        onAbiertoChange={(o) => !o && setZonaEditar(null)}
        titulo={t('editarTitulo')}
        icono={Pencil}
        ancho={440}
        primario={{
          etiqueta: t('guardar'),
          onClick: handleEditar,
          cargando: isProcessing,
          deshabilitada: !nuevoNombre.trim(),
        }}
      >
        <FormField etiqueta={t('nuevoNombre')}>
          <Input
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            placeholder={t('placeholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleEditar();
            }}
          />
        </FormField>
      </Dialogo>

      {/* Eliminar zona */}
      <ConfirmDialog
        open={!!zonaEliminar}
        onOpenChange={(o) => !o && setZonaEliminar(null)}
        title={t('eliminarTitulo')}
        description={t('eliminarDescripcion')}
        confirmLabel={t('eliminar')}
        cancelLabel={t('cancelar')}
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleEliminar}
      />
    </>
  );
}
