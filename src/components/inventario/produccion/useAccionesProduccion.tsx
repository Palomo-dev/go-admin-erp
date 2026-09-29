'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Ban, CircleCheck, Eye, History, Play, Send, Trash2, Check } from 'lucide-react';
import { Dialogo, DialogoMotivo, type AccionFila } from '@/components/kit';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { puede } from '@/lib/inventario/permisos';
import type { PermisosInventario } from '@/lib/inventario/nucleo/tipos';
import { productionOrderService, type OrdenProduccionFila, type ResultadoCompletar } from '@/lib/services/productionOrderService';
import { DialogoCompletarOrden } from './DialogoCompletarOrden';
import { accionesDisponibles, rutaDistribuirOrden, rutaKardexOrden, rutaOrdenProduccion } from './logica';
import { useMensajeErrorProduccion } from './piezas';

/**
 * Acciones de una orden de producción (menú ⋯ de la fila, hoja móvil, cabecera
 * del detalle y pestaña Producción del producto; Figma 603:153432 y §3.3):
 * Borrador → Confirmar · Eliminar; Confirmada → Iniciar · Completar · Cancelar;
 * En proceso → Completar · Cancelar (con motivo); Completada → Distribuir · Ver
 * kardex. Todas son RPC que vuelven a exigir `producir` en el servidor; aquí
 * solo se ocultan las que no se pueden hacer.
 */
export function useAccionesProduccion({
  permisos,
  onCambio,
  enDetalle = false,
}: {
  permisos: PermisosInventario;
  onCambio: (r?: ResultadoCompletar) => void;
  enDetalle?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('inventarioProduccion.acciones');
  const mensajeError = useMensajeErrorProduccion();
  const { formatear: moneda } = useMonedaOrganizacion();
  const [aCompletar, setACompletar] = useState<OrdenProduccionFila | null>(null);
  const [aCancelar, setACancelar] = useState<OrdenProduccionFila | null>(null);
  const [aEliminar, setAEliminar] = useState<OrdenProduccionFila | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeProducir = puede(permisos, 'producir');
  const puedeTrasladar = puede(permisos, 'trasladar');

  const cambiar = useCallback(
    async (o: OrdenProduccionFila, accion: 'confirmar' | 'iniciar') => {
      try {
        await productionOrderService.cambiarEstado(getOrganizationId(), o.id, accion);
        toast({ title: t(`${accion}.listo`, { numero: o.numero }) });
        onCambio();
      } catch (e) {
        toast({ variant: 'destructive', title: t(`${accion}.error`), description: mensajeError(e) });
      }
    },
    [onCambio, t, toast, mensajeError],
  );

  const accionesDe = useCallback(
    (o: OrdenProduccionFila): AccionFila[] => {
      const disponibles = accionesDisponibles(o.estado);
      const lista: AccionFila[] = [];
      if (!enDetalle) {
        lista.push({ id: 'ver', etiqueta: t('ver'), icono: Eye, onSelect: () => router.push(rutaOrdenProduccion(o.id)) });
      }
      if (puedeProducir && disponibles.includes('confirmar')) {
        lista.push({ id: 'confirmar', etiqueta: t('confirmar.boton'), icono: Check, onSelect: () => cambiar(o, 'confirmar') });
      }
      if (puedeProducir && disponibles.includes('iniciar')) {
        lista.push({ id: 'iniciar', etiqueta: t('iniciar.boton'), icono: Play, onSelect: () => cambiar(o, 'iniciar') });
      }
      if (puedeProducir && disponibles.includes('completar')) {
        lista.push({ id: 'completar', etiqueta: t('completar'), icono: CircleCheck, onSelect: () => setACompletar(o) });
      }
      if (disponibles.includes('distribuir')) {
        lista.push({
          id: 'distribuir',
          etiqueta: t('distribuir'),
          icono: Send,
          deshabilitada: !puedeTrasladar,
          motivo: !puedeTrasladar ? t('sinPermisoTrasladar') : undefined,
          onSelect: () => router.push(rutaDistribuirOrden(o.id)),
        });
      }
      if (o.estado === 'completed') {
        lista.push({ id: 'kardex', etiqueta: t('kardex'), icono: History, onSelect: () => router.push(rutaKardexOrden(o.producto.id)) });
      }
      if (puedeProducir && disponibles.includes('cancelar')) {
        lista.push({
          id: 'cancelar',
          etiqueta: t('cancelar.boton'),
          icono: Ban,
          destructiva: true,
          separadorAntes: true,
          onSelect: () => {
            setError(null);
            setACancelar(o);
          },
        });
      }
      if (puedeProducir && disponibles.includes('eliminar')) {
        lista.push({
          id: 'eliminar',
          etiqueta: t('eliminar.boton'),
          icono: Trash2,
          destructiva: true,
          separadorAntes: true,
          onSelect: () => {
            setError(null);
            setAEliminar(o);
          },
        });
      }
      return lista;
    },
    [cambiar, enDetalle, puedeProducir, puedeTrasladar, router, t],
  );

  const cancelar = async (motivo: string) => {
    if (!aCancelar) return;
    setTrabajando(true);
    setError(null);
    try {
      await productionOrderService.cambiarEstado(getOrganizationId(), aCancelar.id, 'cancelar', motivo);
      toast({ title: t('cancelar.listo', { numero: aCancelar.numero }) });
      setACancelar(null);
      onCambio();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setTrabajando(false);
    }
  };

  const eliminar = async () => {
    if (!aEliminar) return;
    setTrabajando(true);
    setError(null);
    try {
      await productionOrderService.cambiarEstado(getOrganizationId(), aEliminar.id, 'eliminar');
      toast({ title: t('eliminar.listo', { numero: aEliminar.numero }) });
      setAEliminar(null);
      onCambio();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setTrabajando(false);
    }
  };

  const dialogos = (
    <>
      <DialogoCompletarOrden
        orden={aCompletar}
        onAbiertoChange={(a) => !a && setACompletar(null)}
        onCompletada={(r) => {
          toast({
            title: t('completada.titulo', { numero: aCompletar?.numero ?? '' }),
            description:
              r.unit_cost !== null ? t('completada.conCosto', { costo: moneda(r.unit_cost) }) : t('completada.sinCosto'),
          });
          onCambio(r);
        }}
      />
      <DialogoMotivo
        abierto={!!aCancelar}
        onAbiertoChange={(a) => !a && !trabajando && setACancelar(null)}
        titulo={t('cancelar.titulo', { numero: aCancelar?.numero ?? '' })}
        descripcion={t('cancelar.descripcion')}
        textoConfirmar={t('cancelar.confirmar')}
        onConfirmar={cancelar}
        motivosRapidos={[t('cancelar.rapido1'), t('cancelar.rapido2'), t('cancelar.rapido3')]}
        minimo={3}
        destructiva
        cargando={trabajando}
        error={error}
        icono={Ban}
      />
      <Dialogo
        abierto={!!aEliminar}
        onAbiertoChange={(a) => !a && !trabajando && setAEliminar(null)}
        titulo={t('eliminar.titulo', { numero: aEliminar?.numero ?? '' })}
        descripcion={t('eliminar.descripcion')}
        icono={Trash2}
        ancho={440}
        primario={{ etiqueta: t('eliminar.confirmar'), onClick: eliminar, destructiva: true, cargando: trabajando }}
      >
        {error && (
          <p role="alert" className="text-[13px] text-danger-text">
            {error}
          </p>
        )}
      </Dialogo>
    </>
  );

  return {
    accionesDe,
    dialogos,
    puedeProducir,
    pedirCompletar: (o: OrdenProduccionFila) => setACompletar(o),
    pedirCancelar: (o: OrdenProduccionFila) => {
      setError(null);
      setACancelar(o);
    },
    confirmar: (o: OrdenProduccionFila) => cambiar(o, 'confirmar'),
    iniciar: (o: OrdenProduccionFila) => cambiar(o, 'iniciar'),
  };
}
