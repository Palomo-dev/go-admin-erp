'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Ban, Eye, History, PackageCheck, Pencil, Printer, Send, Undo2, Waypoints, Factory } from 'lucide-react';
import { Dialogo, DialogoMotivo, type AccionFila } from '@/components/kit';
import { useToast } from '@/components/ui/use-toast';
import { clienteTraslados } from '@/lib/inventario/transferencias/cliente';
import type { DetalleTraslado, EstadoTraslado, PermisosTraslados, SucursalRef } from '@/lib/inventario/transferencias/contrato';
import {
  accionesDe,
  nuevaClave,
  rutaEditarTraslado,
  rutaOrdenProduccion,
  rutaTraslado,
  rutaTrazabilidadLote,
} from '@/lib/inventario/transferencias/logica';
import { DialogoDespachar } from './DialogoDespachar';
import { DialogoRecibir } from './DialogoRecibir';
import { useCantidad, useMensajeErrorTraslado } from './piezas';

/** Lo mínimo de un traslado para ofrecer sus acciones (fila de la lista o cabecera del detalle). */
export interface TrasladoAccionable {
  id: number;
  code: string;
  estado: EstadoTraslado;
  origen: SucursalRef;
  destino: SucursalRef;
  /** Unidades en tránsito (devolver) o por enviar (despachar). */
  unidades: number;
  orden_produccion?: { id: number; numero: string } | null;
}

interface Opciones {
  permisos: PermisosTraslados;
  onCambio: () => void;
  /** Imprimir guías (la pantalla decide cómo). */
  onImprimir?: (ids: number[]) => void;
  /** En la pantalla de detalle ya se tiene el detalle: se pasa a los diálogos. */
  detalle?: DetalleTraslado | null;
  /** Menú de Distribución (Figma 606:162782): «Marcar en tránsito», «Cancelar envío». */
  distribucion?: boolean;
}

/**
 * Acciones de un traslado por estado (Figma: menú ⋯ de un pendiente 589:307026
 * y de uno en tránsito 589:307454; detalle 831:536248) con sus diálogos:
 * despachar (y seriales), recibir, cancelar y devolver al origen. Las
 * acciones que no aplican por permiso no se ofrecen; la RPC vuelve a exigir.
 */
export function useAccionesTraslado({ permisos, onCambio, onImprimir, detalle, distribucion }: Opciones) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('inventarioTraslados');
  const td = useTranslations('inventarioDistribucion.acciones');
  const cantidad = useCantidad();
  const mensajeError = useMensajeErrorTraslado();

  const [despachando, setDespachando] = useState<number | null>(null);
  const [recibiendo, setRecibiendo] = useState<number | null>(null);
  const [cancelando, setCancelando] = useState<TrasladoAccionable | null>(null);
  const [devolviendo, setDevolviendo] = useState<TrasladoAccionable | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [errorDialogo, setErrorDialogo] = useState<string | null>(null);

  const despachar = useCallback((id: number) => setDespachando(id), []);
  const recibir = useCallback((id: number) => setRecibiendo(id), []);

  const accionesFila = useCallback(
    (f: TrasladoAccionable, opciones: { enDetalle?: boolean; productoKardex?: { id: number; sucursal: number } | null; lote?: string | null } = {}): AccionFila[] => {
      const a = accionesDe(f.estado, permisos);
      const destino = f.destino.nombre ?? '';
      const lista: AccionFila[] = [];
      if (!opciones.enDetalle) {
        lista.push({ id: 'ver', etiqueta: distribucion ? td('ver') : t('acciones.verDetalle'), icono: Eye, onSelect: () => router.push(rutaTraslado(f.id)) });
      }
      if (a.despachar && !opciones.enDetalle) {
        lista.push({ id: 'despachar', etiqueta: distribucion ? td('marcarTransito') : t('acciones.despachar'), icono: Send, onSelect: () => despachar(f.id) });
      }
      if (a.recibir && !opciones.enDetalle) {
        lista.push({ id: 'recibir', etiqueta: t('acciones.recibirEn', { sucursal: destino }), icono: PackageCheck, onSelect: () => recibir(f.id) });
      }
      if (a.editar && !opciones.enDetalle) {
        lista.push({ id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => router.push(rutaEditarTraslado(f.id)) });
      }
      if (a.imprimir && onImprimir && !opciones.enDetalle) {
        lista.push({ id: 'imprimir', etiqueta: t('acciones.imprimir'), icono: Printer, onSelect: () => onImprimir([f.id]) });
      }
      if (f.orden_produccion) {
        lista.push({
          id: 'orden',
          etiqueta: t('acciones.verOrden'),
          icono: Factory,
          onSelect: () => router.push(rutaOrdenProduccion(f.orden_produccion!.id)),
        });
      }
      if (opciones.productoKardex) {
        const pk = opciones.productoKardex;
        lista.push({
          id: 'kardex',
          etiqueta: t('acciones.verKardex'),
          icono: History,
          onSelect: () => router.push(`/app/inventario/kardex?producto=${pk.id}&sucursal=${pk.sucursal}`),
        });
      }
      if (opciones.lote) {
        const lote = opciones.lote;
        lista.push({ id: 'lote', etiqueta: t('acciones.verLote'), icono: Waypoints, onSelect: () => router.push(rutaTrazabilidadLote(lote)) });
      }
      if (a.cancelar) {
        lista.push({
          id: 'cancelar',
          etiqueta: distribucion ? td('cancelar') : t('acciones.cancelar'),
          icono: Ban,
          destructiva: true,
          onSelect: () => {
            setErrorDialogo(null);
            setCancelando(f);
          },
        });
      }
      if (a.devolver) {
        lista.push({
          id: 'devolver',
          etiqueta: t('acciones.devolver'),
          icono: Undo2,
          destructiva: true,
          onSelect: () => {
            setErrorDialogo(null);
            setDevolviendo(f);
          },
        });
      }
      return lista;
    },
    [permisos, distribucion, t, td, router, despachar, recibir, onImprimir],
  );

  const confirmarCancelar = async () => {
    if (!cancelando) return;
    setOcupado(true);
    setErrorDialogo(null);
    try {
      const r = await clienteTraslados.cancelar(cancelando.id, null);
      toast({ title: t('cancelar.listo', { codigo: r.code ?? cancelando.code }) });
      setCancelando(null);
      onCambio();
    } catch (e) {
      setErrorDialogo(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const confirmarDevolver = async (motivo: string) => {
    if (!devolviendo) return;
    setOcupado(true);
    setErrorDialogo(null);
    try {
      const r = await clienteTraslados.devolver(devolviendo.id, motivo, nuevaClave('devolver'));
      toast({
        title: t('devolver.listo', { codigo: r.code ?? devolviendo.code, n: cantidad(r.unidades ?? devolviendo.unidades), origen: devolviendo.origen.nombre ?? '' }),
      });
      setDevolviendo(null);
      onCambio();
    } catch (e) {
      setErrorDialogo(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const dialogos: ReactNode = (
    <>
      <DialogoDespachar
        trasladoId={despachando}
        detalle={detalle}
        onAbiertoChange={(v) => !v && setDespachando(null)}
        onDespachado={onCambio}
      />
      <DialogoRecibir trasladoId={recibiendo} detalle={detalle} onAbiertoChange={(v) => !v && setRecibiendo(null)} onRecibido={onCambio} />
      <Dialogo
        abierto={cancelando !== null}
        onAbiertoChange={(v) => !ocupado && !v && setCancelando(null)}
        titulo={t('cancelar.titulo', { codigo: cancelando?.code ?? '' })}
        descripcion={t('cancelar.descripcion')}
        icono={Ban}
        ancho={440}
        textoCancelar={t('cancelar.mantener')}
        primario={{ etiqueta: t('cancelar.confirmar'), onClick: confirmarCancelar, destructiva: true, cargando: ocupado }}
      >
        {errorDialogo && (
          <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle px-3 py-2 text-sm text-danger-text">
            {errorDialogo}
          </p>
        )}
      </Dialogo>
      <DialogoMotivo
        abierto={devolviendo !== null}
        onAbiertoChange={(v) => !ocupado && !v && setDevolviendo(null)}
        titulo={t('devolver.titulo', { codigo: devolviendo?.code ?? '' })}
        descripcion={t('devolver.descripcion', { n: cantidad(devolviendo?.unidades ?? 0), origen: devolviendo?.origen.nombre ?? '' })}
        textoConfirmar={t('devolver.confirmar')}
        onConfirmar={confirmarDevolver}
        motivosRapidos={[t('devolver.motivos.noSalio'), t('devolver.motivos.regreso'), t('devolver.motivos.error')]}
        etiquetaMotivo={t('devolver.motivo')}
        icono={Undo2}
        cargando={ocupado}
        error={errorDialogo}
      />
    </>
  );

  return { accionesFila, despachar, recibir, dialogos };
}
