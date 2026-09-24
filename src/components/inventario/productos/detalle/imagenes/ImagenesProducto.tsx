'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ImageIcon } from 'lucide-react';
import { EmptyState } from '@/components/kit';
import { Dialogo } from '@/components/kit/Dialogo';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { productoService } from '@/lib/services/productoService';
import { avisarCambioCatalogo } from '@/lib/services/website/avisarCambioCatalogo';
import { MAX_IMAGENES } from '../../logica/formularioProducto';
import { useProductoDetalle } from '../ContextoProducto';
import { AccionesAgregarImagen, GaleriaEditable, type ItemGaleria } from '../../imagenes/GaleriaEditable';
import { VistaPreviaImagen } from '../../imagenes/VistaPreviaImagen';
import { DialogoGenerarImagenIA } from '../../imagenes/DialogoGenerarImagenIA';
import { DialogoBibliotecaImagenes } from '../../imagenes/DialogoBibliotecaImagenes';
import {
  borrarObjetoSiHuerfano,
  repartirArchivos,
  subirArchivoProducto,
  urlImagen,
  type ImagenGenerada,
} from '../../imagenes/subirImagen';

interface FilaImagen {
  id: number;
  storage_path: string;
  display_order: number;
  is_primary: boolean | null;
  alt_text: string | null;
  shared_image_id: number | null;
}

/**
 * Pestaña «Imágenes» (A.8; Figma `Producto — Imágenes`): subir varias
 * (JPG/PNG/WebP/GIF, 5 MB c/u, hasta 5), generar con IA, traer de la
 * biblioteca, principal, orden (flechas o arrastrar) en una sola RPC, texto
 * alternativo y eliminar con confirmación. Escribe en `product_images` al
 * momento y recarga cabecera y contadores.
 */
export function ImagenesProducto() {
  const t = useTranslations('productoDetalle.imagenes');
  const tc = useTranslations('productoDetalle.comun');
  const tt = useTranslations('productoDetalle.acciones');
  const { toast } = useToast();
  const { producto, organizacionId, resumen, permisos, recargar, mensajeError } = useProductoDetalle();

  const [filas, setFilas] = useState<FilaImagen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [vista, setVista] = useState<number | null>(null);
  const [aEliminar, setAEliminar] = useState<FilaImagen | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [dialogoIA, setDialogoIA] = useState(false);
  const [dialogoBiblio, setDialogoBiblio] = useState(false);

  const eliminado = producto.status === 'deleted';
  const sinPermiso = !!resumen && !permisos.editar;
  const bloqueado = eliminado || sinPermiso;
  const motivo = eliminado ? tt('motivoEliminado') : sinPermiso ? tt('motivoSinPermiso') : undefined;

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: e } = await supabase
      .from('product_images')
      .select('id, storage_path, display_order, is_primary, alt_text, shared_image_id')
      .eq('product_id', producto.id)
      .order('display_order', { ascending: true })
      .order('id', { ascending: true });
    if (e) setError(mensajeError(e));
    else setFilas((data ?? []) as FilaImagen[]);
    setCargando(false);
  }, [producto.id, mensajeError]);

  useEffect(() => {
    setCargando(true);
    void cargar();
  }, [cargar]);

  const cupo = Math.max(0, MAX_IMAGENES - filas.length);
  const principalId = filas.find((f) => f.is_primary)?.id ?? null;

  const items: ItemGaleria[] = useMemo(
    () =>
      filas.map((f) => ({
        clave: String(f.id),
        url: urlImagen(f.storage_path),
        alt: f.alt_text ?? '',
        principal: !!f.is_primary,
        insignia: f.shared_image_id ? t('insignias.biblioteca') : undefined,
      })),
    [filas, t],
  );

  const alTerminar = async () => {
    avisarCambioCatalogo();
    await Promise.all([cargar(), recargar()]);
  };

  const fallo = (titulo: string, e: unknown) => toast({ variant: 'destructive', title: titulo, description: mensajeError(e) });

  /** Siguiente `display_order` libre (UNIQUE product_id + display_order), leído de la BD. */
  const siguienteOrden = async (): Promise<number> => {
    const { data } = await supabase
      .from('product_images')
      .select('display_order')
      .eq('product_id', producto.id)
      .order('display_order', { ascending: false })
      .limit(1);
    const max = (data?.[0] as { display_order: number } | undefined)?.display_order;
    return typeof max === 'number' ? Math.max(max + 1, 0) : 0;
  };

  /** Inserta una fila; si otro guardado tomó el orden, reintenta con el siguiente. */
  const insertarFila = async (fila: { storage_path: string; shared_image_id?: number | null; alt_text?: string | null }) => {
    for (let intento = 0; intento < 3; intento++) {
      const orden = await siguienteOrden();
      const { count } = await supabase.from('product_images').select('id', { count: 'exact', head: true }).eq('product_id', producto.id).eq('is_primary', true);
      const { error: e } = await supabase.from('product_images').insert({
        product_id: producto.id,
        storage_path: fila.storage_path,
        shared_image_id: fila.shared_image_id ?? null,
        alt_text: fila.alt_text ?? null,
        display_order: orden,
        is_primary: (count ?? 0) === 0,
      });
      if (!e) return;
      if (e.code !== '23505') throw e;
    }
    throw new Error('display_order');
  };

  const subir = async (archivos: File[]) => {
    const { validos, rechazados, sobrantes } = repartirArchivos(archivos, cupo);
    for (const r of rechazados) {
      toast({
        variant: 'destructive',
        title: t('toasts.archivoRechazado', { nombre: r.nombre }),
        description: r.motivo === 'tipo' ? t('validacion.tipo') : t('validacion.tamano'),
      });
    }
    if (sobrantes > 0) toast({ variant: 'destructive', title: t('limite.lleno', { max: MAX_IMAGENES }), description: t('limite.sobrantes', { n: sobrantes }) });
    if (validos.length === 0) return;
    setSubiendo(true);
    let subidas = 0;
    try {
      for (const archivo of validos) {
        const ruta = await subirArchivoProducto(organizacionId, archivo);
        try {
          await insertarFila({ storage_path: ruta });
        } catch (e) {
          await supabase.storage.from('product-images').remove([ruta]);
          throw e;
        }
        subidas++;
      }
      toast({ title: t('toasts.subidas', { n: subidas }) });
    } catch (e) {
      fallo(t('toasts.errorSubir'), e);
    } finally {
      setSubiendo(false);
      if (subidas > 0) await alTerminar();
    }
  };

  const agregarGenerada = async (img: ImagenGenerada) => {
    try {
      let ruta = img.storage_path;
      if (!ruta && img.file) {
        ruta = await subirArchivoProducto(organizacionId, img.file);
        URL.revokeObjectURL(img.vista);
      }
      if (!ruta) throw new Error('imagen_sin_ruta');
      await insertarFila({ storage_path: ruta, alt_text: producto.name });
      toast({ title: t('toasts.generada') });
      await alTerminar();
    } catch (e) {
      fallo(t('toasts.errorSubir'), e);
    }
  };

  const agregarBiblioteca = async (elegidas: { id: number; storage_path: string }[]) => {
    let agregadas = 0;
    try {
      for (const img of elegidas.slice(0, cupo)) {
        await insertarFila({ storage_path: img.storage_path, shared_image_id: img.id });
        agregadas++;
      }
      toast({ title: t('toasts.desdeBiblioteca', { n: agregadas }) });
    } catch (e) {
      fallo(t('toasts.errorSubir'), e);
    } finally {
      if (agregadas > 0) await alTerminar();
    }
  };

  /** Orden y principal en una sola transacción (`fn_producto_imagenes_ordenar`). */
  const ordenar = async (nuevas: FilaImagen[], principal: number | null, clave: string, mensajeOk: string) => {
    const antes = filas;
    setFilas(nuevas.map((f) => ({ ...f, is_primary: principal !== null ? f.id === principal : f.is_primary })));
    setOcupada(clave);
    try {
      await productoService.ordenarImagenes(organizacionId, producto.id, nuevas.map((f) => f.id), principal);
      toast({ title: mensajeOk });
      await alTerminar();
    } catch (e) {
      setFilas(antes);
      fallo(t('toasts.errorOrden'), e);
    } finally {
      setOcupada(null);
    }
  };

  const mover = (clave: string, delta: -1 | 1) => {
    const i = filas.findIndex((f) => String(f.id) === clave);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= filas.length) return;
    const nuevas = [...filas];
    [nuevas[i], nuevas[j]] = [nuevas[j], nuevas[i]];
    void ordenar(nuevas, principalId, clave, t('toasts.ordenGuardado'));
  };

  const reordenar = (desde: number, hasta: number) => {
    const nuevas = [...filas];
    const [movida] = nuevas.splice(desde, 1);
    nuevas.splice(hasta, 0, movida);
    void ordenar(nuevas, principalId, String(movida.id), t('toasts.ordenGuardado'));
  };

  const hacerPrincipal = (clave: string) => void ordenar(filas, Number(clave), clave, t('toasts.principal'));

  const guardarAlt = async (clave: string, texto: string) => {
    setOcupada(clave);
    const { error: e } = await supabase
      .from('product_images')
      .update({ alt_text: texto || null, updated_at: new Date().toISOString() })
      .eq('id', Number(clave))
      .eq('product_id', producto.id);
    setOcupada(null);
    if (e) {
      fallo(t('toasts.errorAlt'), e);
      return;
    }
    setFilas((fs) => fs.map((f) => (String(f.id) === clave ? { ...f, alt_text: texto || null } : f)));
    toast({ title: t('toasts.altGuardado') });
    avisarCambioCatalogo();
  };

  const eliminar = async () => {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      const { error: e } = await supabase.from('product_images').delete().eq('id', aEliminar.id).eq('product_id', producto.id);
      if (e) throw e;
      await borrarObjetoSiHuerfano(aEliminar.storage_path, aEliminar.shared_image_id);
      const resto = filas.filter((f) => f.id !== aEliminar.id);
      if (resto.length > 0) {
        // Compacta el orden y, si se fue la principal, la primera toma su lugar.
        const principal = aEliminar.is_primary ? resto[0].id : (resto.find((f) => f.is_primary)?.id ?? resto[0].id);
        await productoService.ordenarImagenes(organizacionId, producto.id, resto.map((f) => f.id), principal);
      }
      toast({ title: t('toasts.eliminada') });
      setAEliminar(null);
      await alTerminar();
    } catch (e) {
      fallo(t('toasts.errorEliminar'), e);
    } finally {
      setEliminando(false);
    }
  };

  const vistas = useMemo(() => items.map((i) => ({ clave: i.clave, url: i.url, alt: i.alt, principal: i.principal })), [items]);

  if (cargando) {
    return (
      <section className="flex flex-col gap-4" aria-busy="true" aria-label={t('titulo')}>
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <EmptyState
        variante="error"
        titulo={t('estados.errorTitulo')}
        descripcion={error}
        onReintentar={() => {
          setCargando(true);
          void cargar();
        }}
      />
    );
  }

  const acciones = (variante: 'barra' | 'zona', className?: string) => (
    <AccionesAgregarImagen
      variante={variante}
      className={className}
      onArchivos={(a) => void subir(a)}
      onGenerarIA={() => setDialogoIA(true)}
      onBiblioteca={() => setDialogoBiblio(true)}
      cupo={cupo}
      maximo={MAX_IMAGENES}
      subiendo={subiendo}
      deshabilitado={bloqueado}
      motivo={motivo}
    />
  );

  return (
    <section className="flex flex-col gap-4" aria-label={t('titulo')}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-base font-semibold text-fg">{t('tituloConteo', { n: filas.length })}</h2>
          <p className="text-xs text-fg-secondary">{t('limite.ayuda', { max: MAX_IMAGENES })}</p>
        </div>
        {filas.length > 0 && acciones('barra', 'hidden lg:flex')}
      </div>

      {filas.length === 0 ? (
        <div className="flex flex-col gap-4">
          <EmptyState icono={ImageIcon} compacto titulo={t('estados.vacioTitulo')} descripcion={t('estados.vacioDescripcion')} />
          {acciones('zona')}
        </div>
      ) : (
        <>
          <GaleriaEditable
            items={items}
            onVer={setVista}
            onPrincipal={hacerPrincipal}
            onAlt={(c, v) => void guardarAlt(c, v)}
            onMover={mover}
            onReordenar={reordenar}
            onQuitar={(c) => setAEliminar(filas.find((f) => String(f.id) === c) ?? null)}
            bloqueado={bloqueado || !!ocupada}
            motivoBloqueo={motivo}
            ocupada={ocupada}
          />
          {cupo > 0 && acciones('zona', 'lg:hidden')}
          <p className="text-xs text-fg-muted">{t('nota')}</p>
        </>
      )}

      <VistaPreviaImagen imagenes={vistas} indice={vista} onIndiceChange={setVista} />

      <Dialogo
        abierto={!!aEliminar}
        onAbiertoChange={(v) => !v && setAEliminar(null)}
        titulo={t('eliminar.titulo')}
        descripcion={t('eliminar.descripcion')}
        textoCancelar={tc('cancelar')}
        ancho={440}
        primario={{ etiqueta: eliminando ? tc('eliminando') : tc('eliminar'), destructiva: true, cargando: eliminando, onClick: () => void eliminar() }}
      >
        {aEliminar?.shared_image_id ? <p className="text-sm text-fg-secondary">{t('eliminar.biblioteca')}</p> : null}
      </Dialogo>

      <DialogoGenerarImagenIA
        abierto={dialogoIA}
        onAbiertoChange={setDialogoIA}
        organizacionId={organizacionId}
        nombreInicial={producto.name}
        descripcionInicial={producto.description}
        onGenerada={agregarGenerada}
      />

      <DialogoBibliotecaImagenes
        abierto={dialogoBiblio}
        onAbiertoChange={setDialogoBiblio}
        organizacionId={organizacionId}
        cupo={cupo}
        usadas={{ ids: filas.map((f) => f.shared_image_id).filter((x): x is number => x !== null), rutas: filas.map((f) => f.storage_path) }}
        onElegidas={agregarBiblioteca}
      />
    </section>
  );
}
