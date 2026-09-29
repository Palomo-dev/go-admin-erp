'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Ban, Calculator, Factory, History, Package, Pencil, RotateCcw } from 'lucide-react';
import { Dialogo, type AccionFila } from '@/components/kit';
import { useToast } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { puede } from '@/lib/inventario/permisos';
import type { PermisosInventario } from '@/lib/inventario/nucleo/tipos';
import { recipeService, type FilaReceta } from '@/lib/services/recipeService';
import { DialogoNuevaOrden, aProductoAProducir, type ProductoAProducir } from '../produccion/DialogoNuevaOrden';
import { rutaOrdenProduccion } from '../produccion/logica';
import { HojaVersiones } from './HojaVersiones';
import { rutaCostoRecetas, rutaEditarReceta, useMensajeErrorReceta } from './piezas';

/**
 * Acciones de una receta (menú ⋯ de la fila y de la pestaña «Producción» del
 * producto; Figma 598:142703 y D1 968:175070): Editar (el mismo editor), Ver
 * versiones, Crear orden de producción, Costo, Ver producto, Reactivar y
 * Desactivar (con confirmación: deja de descontar ingredientes; las órdenes
 * abiertas siguen con su versión). Todo por RPC con el permiso del servidor.
 */
export function useAccionesReceta({ permisos, onCambio }: { permisos: PermisosInventario; onCambio: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('inventarioRecetas.acciones');
  const mensajeError = useMensajeErrorReceta();
  const { branchFilter, branches } = useBranch();
  const [aDesactivar, setADesactivar] = useState<FilaReceta | null>(null);
  const [versionesDe, setVersionesDe] = useState<FilaReceta | null>(null);
  const [aProducir, setAProducir] = useState<ProductoAProducir | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeEditar = puede(permisos, 'editar_catalogo');
  const puedeProducir = puede(permisos, 'producir');

  const reactivar = useCallback(
    async (f: FilaReceta) => {
      try {
        const r = await recipeService.reactivar(getOrganizationId(), f.recipe_id);
        toast({ title: t('reactivada', { version: r.version }) });
        onCambio();
      } catch (e) {
        toast({ variant: 'destructive', title: t('errorReactivar'), description: mensajeError(e) });
      }
    },
    [mensajeError, onCambio, t, toast],
  );

  const accionesDe = useCallback(
    (f: FilaReceta): AccionFila[] => {
      const lista: AccionFila[] = [
        { id: 'editar', etiqueta: puedeEditar ? t('editar') : t('ver'), icono: Pencil, onSelect: () => router.push(rutaEditarReceta(f.product_id)) },
        { id: 'versiones', etiqueta: t('versiones'), icono: History, onSelect: () => setVersionesDe(f) },
      ];
      if (f.activa && puedeProducir) {
        lista.push({
          id: 'producir',
          etiqueta: t('crearOrden'),
          icono: Factory,
          deshabilitada: !f.producto.track_stock,
          motivo: !f.producto.track_stock ? t('sinInventario') : undefined,
          onSelect: () => setAProducir(aProductoAProducir(f)),
        });
      }
      lista.push(
        { id: 'costo', etiqueta: t('costo'), icono: Calculator, onSelect: () => router.push(`${rutaCostoRecetas()}?busqueda=${encodeURIComponent(f.producto.nombre)}`) },
        { id: 'producto', etiqueta: t('verProducto'), icono: Package, onSelect: () => router.push(`/app/inventario/productos/${f.product_id}`) },
      );
      if (puedeEditar && !f.activa) {
        lista.push({ id: 'reactivar', etiqueta: t('reactivar', { version: f.version }), icono: RotateCcw, separadorAntes: true, onSelect: () => reactivar(f) });
      }
      if (puedeEditar && f.activa) {
        lista.push({
          id: 'desactivar',
          etiqueta: t('desactivar'),
          icono: Ban,
          destructiva: true,
          separadorAntes: true,
          onSelect: () => {
            setError(null);
            setADesactivar(f);
          },
        });
      }
      return lista;
    },
    [puedeEditar, puedeProducir, reactivar, router, t],
  );

  const desactivar = async () => {
    if (!aDesactivar) return;
    setTrabajando(true);
    setError(null);
    try {
      const r = await recipeService.desactivar(getOrganizationId(), aDesactivar.recipe_id);
      toast({ title: t('desactivada', { producto: aDesactivar.producto.nombre }), description: r.ordenes_abiertas > 0 ? t('ordenesSiguen', { count: r.ordenes_abiertas }) : undefined });
      setADesactivar(null);
      onCambio();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setTrabajando(false);
    }
  };

  const dialogos = (
    <>
      <Dialogo
        abierto={!!aDesactivar}
        onAbiertoChange={(a) => !a && !trabajando && setADesactivar(null)}
        titulo={t('desactivarTitulo', { producto: aDesactivar?.producto.nombre ?? '' })}
        descripcion={t('desactivarDescripcion', { version: aDesactivar?.version ?? 1 })}
        icono={Ban}
        ancho={440}
        primario={{ etiqueta: t('desactivar'), onClick: desactivar, destructiva: true, cargando: trabajando }}
      >
        <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-fg-secondary">
          <li>{aDesactivar?.modo === 'al_producir' ? t('consecuenciaProducir') : t('consecuenciaVender')}</li>
          <li>{t('consecuenciaOrdenes', { count: aDesactivar?.ordenes_abiertas ?? 0 })}</li>
          <li>{t('consecuenciaReactivar')}</li>
        </ul>
        {error && (
          <p role="alert" className="mt-3 text-[13px] text-danger-text">
            {error}
          </p>
        )}
      </Dialogo>
      {versionesDe && (
        <HojaVersiones
          abierto
          onAbiertoChange={(a) => !a && setVersionesDe(null)}
          producto={{ id: versionesDe.product_id, nombre: versionesDe.producto.nombre }}
          sucursalId={branchFilter ?? branches[0]?.id ?? null}
          puedeEditar={puedeEditar}
          onReactivada={onCambio}
        />
      )}
      <DialogoNuevaOrden
        abierto={!!aProducir}
        onAbiertoChange={(a) => !a && setAProducir(null)}
        producto={aProducir}
        onCreada={(id) => router.push(rutaOrdenProduccion(id))}
      />
    </>
  );

  return { accionesDe, dialogos, puedeEditar, puedeProducir, pedirProducir: (f: FilaReceta) => setAProducir(aProductoAProducir(f)) };
}
