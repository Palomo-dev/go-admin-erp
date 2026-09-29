'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowLeftRight, Eye, History, Package, Printer, Receipt, ShieldCheck, Users } from 'lucide-react';
import type { AccionFila } from '@/components/kit';
import { DialogoMotivo } from '@/components/kit/DialogoMotivo';
import { useToast } from '@/components/ui/use-toast';
import { guardarTrabajo } from '@/components/inventario/productos/etiquetas/trabajoEtiquetas';
import { CAMPOS_POR_DEFECTO, type DatosEtiqueta } from '@/lib/utils/etiquetasImpresion';
import { ErrorPeticionSeriales, clienteSeriales } from '@/lib/services/seriales/cliente';
import type { PermisosSeriales, ProductoRef, TerceroRef, VentaSerial } from '@/lib/services/seriales/contrato';
import { CreateClaimDialog } from '@/components/inventario/garantias/CreateClaimDialog';
import { numeroDocumento, rutaCliente, rutaDocumento, rutaNuevoTraslado, rutaProducto, rutaSerial, situacionGarantia } from './logica';

/** Lo mínimo de un serial para armar su menú (fila del listado o detalle). */
export interface SerialAccionable {
  id: number;
  serial: string;
  estado: string;
  producto: ProductoRef;
  sucursal: { id: number; nombre: string } | null;
  venta: VentaSerial | null;
  cliente: TerceroRef | null;
  garantia: { meses: number | null; inicio: string | null; fin: string | null };
  reclamo?: { id: string; codigo: string | null; estado: string; rma: string | null } | null;
}

/** Plantilla de las etiquetas de serial: rollo de 50 × 25 mm, una por unidad. */
const PLANTILLA_SERIAL = 'rollo-50x25';


/**
 * Acciones de un serial (menú «⋯» del listado, hoja móvil y cabecera del
 * detalle) según su estado, con los diálogos que abren: reclamo de garantía,
 * «Marcar como dañado» con motivo e impresión de etiquetas. La RPC vuelve a
 * exigir el permiso; aquí solo se ocultan las acciones que no se pueden hacer.
 */
export function useAccionesSerial({ permisos, hoy, onCambio }: { permisos: PermisosSeriales; hoy: string; onCambio: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('inventarioSeriales.acciones');
  const [reclamoPara, setReclamoPara] = useState<number | null>(null);
  const [aDanar, setADanar] = useState<SerialAccionable[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorDano, setErrorDano] = useState<string | null>(null);

  const imprimirEtiquetas = useCallback(
    (seriales: readonly SerialAccionable[]) => {
      if (seriales.length === 0) return;
      const etiquetas: DatosEtiqueta[] = seriales.map((s) => ({
        productId: s.producto.id,
        nombre: s.producto.nombre,
        variante: null,
        precio: null,
        precioComparacion: null,
        sku: s.producto.sku,
        codigo: s.serial,
      }));
      const id = guardarTrabajo({
        plantillaId: PLANTILLA_SERIAL,
        inicio: 1,
        campos: { ...CAMPOS_POR_DEFECTO, variante: false, precio: false, precioComparacion: false },
        etiquetas,
        imprimirAlAbrir: true,
      });
      if (!id) {
        toast({ variant: 'destructive', title: t('errorEtiquetas') });
        return;
      }
      const ventana = window.open(`/imprimir/etiquetas?trabajo=${id}`, '_blank');
      if (!ventana) toast({ variant: 'destructive', title: t('ventanaBloqueada') });
    },
    [t, toast],
  );

  const puedeReclamar = useCallback(
    (s: SerialAccionable) => {
      if (!permisos.gestionar || s.estado !== 'sold') return false;
      const g = situacionGarantia({ estado: s.estado, garantia: s.garantia, reclamo: s.reclamo }, hoy);
      return g.tipo === 'vigente' || g.tipo === 'por_vencer';
    },
    [permisos.gestionar, hoy],
  );

  const accionesDe = useCallback(
    (s: SerialAccionable, opciones: { enDetalle?: boolean } = {}): AccionFila[] => {
      const venta = s.venta?.documento ?? null;
      const hrefVenta = rutaDocumento(venta);
      const hrefCliente = s.cliente ? rutaCliente(s.cliente.id) : null;
      const hrefProducto = rutaProducto(s.producto.uuid);
      const enBodega = s.estado === 'in_stock';
      const acciones: AccionFila[] = [];
      if (!opciones.enDetalle) {
        acciones.push({ id: 'historial', etiqueta: t('verHistorial'), icono: History, onSelect: () => router.push(rutaSerial(s.id)) });
      }
      if (hrefVenta && venta) {
        acciones.push({ id: 'venta', etiqueta: t('verVenta', { numero: numeroDocumento(venta) }), icono: Receipt, onSelect: () => router.push(hrefVenta) });
      }
      if (hrefCliente) acciones.push({ id: 'cliente', etiqueta: t('verCliente'), icono: Users, onSelect: () => router.push(hrefCliente) });
      if (puedeReclamar(s) && !opciones.enDetalle) {
        acciones.push({ id: 'reclamo', etiqueta: t('abrirReclamo'), icono: ShieldCheck, onSelect: () => setReclamoPara(s.id) });
      }
      if (s.reclamo && ['pending', 'approved', 'in_process'].includes(s.reclamo.estado)) {
        const id = s.reclamo.id;
        acciones.push({ id: 'verReclamo', etiqueta: t('verReclamo', { codigo: s.reclamo.codigo ?? '' }), icono: Eye, onSelect: () => router.push(`/app/inventario/garantias/${id}`) });
      }
      if (enBodega && permisos.trasladar) {
        acciones.push({
          id: 'trasladar',
          etiqueta: t('trasladar'),
          icono: ArrowLeftRight,
          onSelect: () => router.push(rutaNuevoTraslado(s.producto.id, s.sucursal?.id)),
        });
      }
      if (enBodega && !opciones.enDetalle) {
        acciones.push({ id: 'etiqueta', etiqueta: t('imprimirEtiqueta'), icono: Printer, onSelect: () => imprimirEtiquetas([s]) });
      }
      if (hrefProducto) acciones.push({ id: 'producto', etiqueta: t('verProducto'), icono: Package, onSelect: () => router.push(hrefProducto) });
      if (enBodega && (permisos.ajustar || permisos.editar_catalogo)) {
        acciones.push({ id: 'danado', etiqueta: t('marcarDanado'), icono: AlertTriangle, destructiva: true, onSelect: () => setADanar([s]) });
      }
      return acciones;
    },
    [t, router, puedeReclamar, permisos.trasladar, permisos.ajustar, permisos.editar_catalogo, imprimirEtiquetas],
  );

  const confirmarDano = async (motivo: string) => {
    if (!aDanar) return;
    setGuardando(true);
    setErrorDano(null);
    try {
      const r = await clienteSeriales.cambiarEstado({ ids: aDanar.map((s) => s.id), estado: 'damaged', nota: motivo });
      toast({
        title: t('danadosOk', { count: r.actualizados }),
        description: r.rechazados.length ? t('danadosRechazados', { count: r.rechazados.length }) : undefined,
      });
      setADanar(null);
      onCambio();
    } catch (e) {
      setErrorDano(e instanceof ErrorPeticionSeriales && e.sinPermiso ? t('sinPermiso') : t('errorGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  const dialogos = (
    <>
      <CreateClaimDialog
        open={reclamoPara !== null}
        onOpenChange={(v) => !v && setReclamoPara(null)}
        preselectedSerialId={reclamoPara}
        onCreated={(id) => {
          setReclamoPara(null);
          onCambio();
          if (id) router.push(`/app/inventario/garantias/${id}`);
        }}
      />
      <DialogoMotivo
        abierto={aDanar !== null}
        onAbiertoChange={(v) => {
          if (!v) {
            setADanar(null);
            setErrorDano(null);
          }
        }}
        titulo={aDanar && aDanar.length === 1 ? t('danadoTitulo', { serial: aDanar[0].serial }) : t('danadosTitulo', { count: aDanar?.length ?? 0 })}
        textoConfirmar={t('marcarDanado')}
        onConfirmar={confirmarDano}
        consecuencias={[t('danadoConsecuencia1'), t('danadoConsecuencia2')]}
        etiquetaMotivo={t('motivo')}
        motivosRapidos={[t('motivoGolpe'), t('motivoNoEnciende'), t('motivoIncompleto')]}
        cargando={guardando}
        error={errorDano}
        icono={AlertTriangle}
      />
    </>
  );

  return { accionesDe, imprimirEtiquetas, abrirReclamo: setReclamoPara, marcarDanados: setADanar, puedeReclamar, dialogos };
}
