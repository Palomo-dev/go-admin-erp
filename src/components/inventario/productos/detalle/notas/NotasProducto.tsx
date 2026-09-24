'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileText, Loader2, Paperclip, Send, StickyNote, X } from 'lucide-react';
import { EmptyState } from '@/components/kit';
import { Dialogo } from '@/components/kit/Dialogo';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useProductoDetalle } from '../ContextoProducto';
import {
  MAX_BYTES_ADJUNTO,
  cargarNotas,
  crearNota,
  editarNota,
  eliminarNota,
  fijarNota,
  usuarioActual,
  type NotaProducto,
} from './datosNotas';
import { TarjetaNota, useTamanoArchivo } from './TarjetaNota';

/**
 * Notas del producto (Figma `Producto — Notas · Historial`, A.12 de
 * PARIDAD-DETALLE-PRODUCTO-FIDELIDAD): nueva nota con adjuntos (se pueden
 * quitar antes de guardar), historial con las fijadas primero, autor y rol
 * reales, fecha en la zona de la organización, «editada», editar (solo el
 * autor), fijar/desfijar y eliminar con confirmación (también sus archivos).
 */
export function NotasProducto() {
  const t = useTranslations('productoDetalle.notas');
  const tc = useTranslations('productoDetalle.comun');
  const ta = useTranslations('productoDetalle.acciones');
  const { producto, organizacionId, permisos, resumen, fechas, recargarResumen } = useProductoDetalle();
  const { toast } = useToast();
  const tamano = useTamanoArchivo();
  const idArchivos = useId();
  const inputArchivos = useRef<HTMLInputElement>(null);

  const [notas, setNotas] = useState<NotaProducto[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [yo, setYo] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [archivos, setArchivos] = useState<File[]>([]);
  const [fase, setFase] = useState<'inactivo' | 'guardando' | 'subiendo'>('inactivo');
  const [ocupada, setOcupada] = useState<number | null>(null);
  const [aEliminar, setAEliminar] = useState<NotaProducto | null>(null);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    try {
      const [lista, usuario] = await Promise.all([cargarNotas(organizacionId, producto.id), usuarioActual()]);
      setNotas(lista);
      setYo(usuario);
      setEstado('listo');
    } catch {
      setEstado('error');
    }
  }, [organizacionId, producto.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const puedeModerar = !!resumen && permisos.editar;
  const motivoSinPermiso = ta('motivoSinPermiso');

  const agregarArchivos = (lista: FileList | null) => {
    if (!lista) return;
    const nuevos = Array.from(lista);
    const grandes = nuevos.filter((f) => f.size > MAX_BYTES_ADJUNTO);
    if (grandes.length > 0) {
      toast({
        variant: 'destructive',
        title: t('toasts.archivoGrande'),
        description: t('toasts.archivoGrandeDetalle', { nombres: grandes.map((f) => f.name).join(', '), maximo: tamano(MAX_BYTES_ADJUNTO) }),
      });
    }
    setArchivos((prev) => [...prev, ...nuevos.filter((f) => f.size <= MAX_BYTES_ADJUNTO)]);
    if (inputArchivos.current) inputArchivos.current.value = '';
  };

  const guardar = async () => {
    const contenido = texto.trim();
    if (!contenido) return;
    setFase('guardando');
    try {
      const { fallidos } = await crearNota(organizacionId, producto.id, contenido, archivos, () => setFase('subiendo'));
      setTexto('');
      setArchivos([]);
      if (fallidos.length > 0) {
        toast({ variant: 'destructive', title: t('toasts.adjuntosFallidos'), description: fallidos.join(', ') });
      } else {
        toast({ title: t('toasts.guardada'), description: t('toasts.guardadaDetalle') });
      }
      await Promise.all([cargar(), recargarResumen()]);
    } catch {
      toast({ variant: 'destructive', title: t('toasts.errorGuardar'), description: tc('errorCargar') });
    } finally {
      setFase('inactivo');
    }
  };

  const alternarFijada = async (nota: NotaProducto) => {
    setOcupada(nota.id);
    try {
      await fijarNota(organizacionId, nota.id, !nota.fijada);
      toast({ title: nota.fijada ? t('toasts.desfijada') : t('toasts.fijada') });
      await cargar();
    } catch {
      toast({ variant: 'destructive', title: t('toasts.errorFijar') });
    } finally {
      setOcupada(null);
    }
  };

  const guardarEdicion = async (nota: NotaProducto, contenido: string): Promise<boolean> => {
    try {
      await editarNota(organizacionId, nota.id, contenido);
      toast({ title: t('toasts.editada') });
      await cargar();
      return true;
    } catch {
      toast({ variant: 'destructive', title: t('toasts.errorEditar') });
      return false;
    }
  };

  const confirmarEliminar = async () => {
    if (!aEliminar) return;
    const nota = aEliminar;
    setOcupada(nota.id);
    try {
      await eliminarNota(organizacionId, nota);
      toast({ title: t('toasts.eliminada'), description: t('toasts.eliminadaDetalle') });
      setAEliminar(null);
      await Promise.all([cargar(), recargarResumen()]);
    } catch {
      toast({ variant: 'destructive', title: t('toasts.errorEliminar') });
    } finally {
      setOcupada(null);
    }
  };

  const ocupadoNueva = fase !== 'inactivo';
  const fijadas = notas.filter((n) => n.fijada).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Nueva nota (A.12 #1-#5) */}
      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5" aria-labelledby="notas-nueva">
        <h3 id="notas-nueva" className="mb-3 text-base font-semibold text-fg">
          {t('nueva.titulo')}
        </h3>
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={t('nueva.placeholder')}
          aria-label={t('nueva.titulo')}
          className="min-h-24"
          disabled={ocupadoNueva}
        />
        {archivos.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium text-fg-secondary">{t('nueva.seleccionados')}</p>
            <ul className="flex flex-col gap-1.5">
              {archivos.map((f, i) => (
                <li key={`${f.name}-${f.size}-${i}`} className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-2 text-sm">
                  <FileText className="size-4 shrink-0 text-fg-secondary" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-fg" title={f.name}>
                    {f.name} <span className="text-fg-secondary">({tamano(f.size)})</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-fg-secondary hover:text-fg"
                    onClick={() => setArchivos((prev) => prev.filter((_, j) => j !== i))}
                    disabled={ocupadoNueva}
                    aria-label={t('nueva.quitar', { nombre: f.name })}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <input
            ref={inputArchivos}
            id={idArchivos}
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => agregarArchivos(e.target.files)}
            disabled={ocupadoNueva}
          />
          <Button variant="outline" asChild={!ocupadoNueva} disabled={ocupadoNueva} className="w-full sm:w-auto">
            {ocupadoNueva ? (
              <span>
                <Paperclip className="size-4" aria-hidden /> {t('nueva.adjuntar')}
              </span>
            ) : (
              <label htmlFor={idArchivos} className="cursor-pointer">
                <Paperclip className="size-4" aria-hidden /> {t('nueva.adjuntar')}
              </label>
            )}
          </Button>
          <Button onClick={() => void guardar()} disabled={ocupadoNueva || !texto.trim()} className="w-full sm:w-auto">
            {ocupadoNueva ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
            {fase === 'subiendo' ? t('nueva.subiendo') : fase === 'guardando' ? tc('guardando') : t('nueva.guardar')}
          </Button>
        </div>
      </section>

      {/* Historial de notas (A.12 #6-#12) */}
      <section className="flex flex-col gap-3" aria-labelledby="notas-historial">
        <h3 id="notas-historial" className="text-base font-semibold text-fg">
          {estado === 'listo' ? t('historial.tituloConteo', { count: notas.length }) : t('historial.titulo')}
          {estado === 'listo' && fijadas > 0 && (
            <span className="ml-2 text-sm font-normal text-fg-secondary">{t('historial.fijadas', { count: fijadas })}</span>
          )}
        </h3>

        {estado === 'cargando' ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label={tc('cargando')}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
                <Skeleton className="mt-3 h-4 w-3/4" />
              </div>
            ))}
          </div>
        ) : estado === 'error' ? (
          <EmptyState variante="error" titulo={t('historial.errorTitulo')} descripcion={tc('errorCargar')} onReintentar={() => void cargar()} />
        ) : notas.length === 0 ? (
          <EmptyState variante="empty" icono={StickyNote} titulo={t('historial.vacioTitulo')} descripcion={t('historial.vacioDescripcion')} />
        ) : (
          notas.map((nota) => {
            const esAutor = !!yo && nota.userId === yo;
            return (
              <TarjetaNota
                key={nota.id}
                nota={nota}
                timezone={fechas.timezone}
                esAutor={esAutor}
                puedeFijar={puedeModerar}
                puedeEliminar={esAutor || puedeModerar}
                motivoSinPermiso={motivoSinPermiso}
                ocupada={ocupada === nota.id}
                onFijar={() => void alternarFijada(nota)}
                onGuardarEdicion={(c) => guardarEdicion(nota, c)}
                onEliminar={() => setAEliminar(nota)}
              />
            );
          })
        )}
      </section>

      <Dialogo
        abierto={!!aEliminar}
        onAbiertoChange={(v) => !v && setAEliminar(null)}
        titulo={t('eliminar.titulo')}
        descripcion={
          aEliminar && aEliminar.archivos.length > 0
            ? t('eliminar.descripcionConArchivos', { count: aEliminar.archivos.length })
            : t('eliminar.descripcion')
        }
        textoCancelar={tc('cancelar')}
        ancho={440}
        primario={{
          etiqueta: ocupada !== null ? tc('eliminando') : tc('eliminar'),
          destructiva: true,
          cargando: ocupada !== null,
          onClick: () => void confirmarEliminar(),
        }}
      />
    </div>
  );
}
