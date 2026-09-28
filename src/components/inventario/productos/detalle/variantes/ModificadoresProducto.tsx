'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ListPlus } from 'lucide-react';
import { EmptyState } from '@/components/kit/EmptyState';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { ProductModifiersService } from '@/lib/services/productModifiersService';
import { useProductoDetalle } from '../ContextoProducto';
import {
  EditorGrupoModificadores,
  NuevoGrupoModificadores,
  mover,
  type CambioGrupo,
  type CambioOpcion,
  type GrupoEditable,
  type ModoSeleccion,
} from './EditorGrupoModificadores';

/**
 * Sub-pestaña «Modificadores» del detalle (PARIDAD A.5): extras que no
 * cambian el producto ni su SKU (se guardan en la venta, `sale_items.notes`).
 * Cada cambio se guarda al instante con `ProductModifiersService`
 * (operaciones de una sola tabla con RLS por pertenencia). Las opciones
 * inactivas se muestran aquí (para reactivarlas) aunque el POS no las ofrezca.
 */
interface OpcionBD {
  id: number;
  name: string;
  extra_price: number | string | null;
  is_active: boolean | null;
  display_order: number | null;
}

interface GrupoBD {
  id: number;
  name: string;
  selection_mode: ModoSeleccion;
  min_selections: number | null;
  max_selections: number | null;
  required: boolean | null;
  display_order: number | null;
  product_modifiers: OpcionBD[] | null;
}

interface GrupoDetalle extends GrupoEditable {
  id: number;
  display_order: number;
  opciones: (GrupoEditable['opciones'][number] & { id: number; display_order: number })[];
}

type Carga = 'cargando' | 'listo' | 'error';
type Confirmacion = { tipo: 'grupo'; grupo: GrupoDetalle } | { tipo: 'opcion'; grupo: GrupoDetalle; opcionId: number; nombre: string } | null;

const aNumero = (v: number | string | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function normalizar(filas: GrupoBD[]): GrupoDetalle[] {
  return filas
    .map((g) => ({
      clave: String(g.id),
      id: g.id,
      name: g.name,
      selection_mode: (g.selection_mode === 'single' ? 'single' : 'multiple') as ModoSeleccion,
      min_selections: aNumero(g.min_selections),
      max_selections: g.max_selections === null ? null : aNumero(g.max_selections),
      required: Boolean(g.required),
      display_order: aNumero(g.display_order),
      opciones: (g.product_modifiers ?? [])
        .map((o) => ({
          clave: String(o.id),
          id: o.id,
          name: o.name,
          extra_price: aNumero(o.extra_price),
          is_active: o.is_active !== false,
          display_order: aNumero(o.display_order),
        }))
        .sort((a, b) => a.display_order - b.display_order || a.id - b.id),
    }))
    .sort((a, b) => a.display_order - b.display_order || a.id - b.id);
}

export function ModificadoresProducto() {
  const t = useTranslations('productoDetalle.modificadores');
  const tc = useTranslations('productoDetalle.comun');
  const { producto, organizacionId, resumen, permisos, recargarResumen, moneda, mensajeError } = useProductoDetalle();
  const { toast } = useToast();

  const [grupos, setGrupos] = useState<GrupoDetalle[]>([]);
  const [carga, setCarga] = useState<Carga>('cargando');
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [nombresExistentes, setNombresExistentes] = useState<string[]>([]);
  const [sugerencias, setSugerencias] = useState<string[]>([]);
  const [confirmacion, setConfirmacion] = useState<Confirmacion>(null);
  const [eliminando, setEliminando] = useState(false);
  const turno = useRef(0);

  const cargar = useCallback(
    async (silencioso = false) => {
      const mio = ++turno.current;
      if (!silencioso) setCarga('cargando');
      try {
        const { data, error } = await supabase
          .from('product_modifier_groups')
          .select(
            'id, name, selection_mode, min_selections, max_selections, required, display_order, product_modifiers(id, name, extra_price, is_active, display_order)',
          )
          .eq('product_id', producto.id)
          .eq('organization_id', organizacionId)
          .order('display_order');
        if (error) throw error;
        if (mio === turno.current) {
          setGrupos(normalizar((data ?? []) as GrupoBD[]));
          setCarga('listo');
        }
      } catch {
        if (mio === turno.current) setCarga('error');
      }
    },
    [organizacionId, producto.id],
  );

  const cargarSugerencias = useCallback(async () => {
    const [nombres, valores] = await Promise.allSettled([
      ProductModifiersService.getExistingGroupNames(),
      ProductModifiersService.getVariantValueSuggestions(),
    ]);
    if (nombres.status === 'fulfilled') setNombresExistentes(nombres.value);
    if (valores.status === 'fulfilled') setSugerencias(valores.value);
  }, []);

  useEffect(() => {
    void cargar();
    void cargarSugerencias();
  }, [cargar, cargarSugerencias]);

  const permisosListos = resumen !== null;
  const puedeEditar = permisos.editar;
  const motivo = puedeEditar ? undefined : permisosListos ? tc('sinPermiso') : tc('cargando');

  const avisarError = (titulo: string, e: unknown) => toast({ variant: 'destructive', title: titulo, description: mensajeError(e) });

  /** Ejecuta una escritura sobre un grupo, recarga y avisa si falla. */
  const escribir = async (grupoId: number | null, accion: () => Promise<unknown>, tituloError: string, conteos = false): Promise<boolean> => {
    setOcupado(grupoId);
    try {
      await accion();
      await cargar(true);
      if (conteos) void recargarResumen();
      return true;
    } catch (e) {
      avisarError(tituloError, e);
      await cargar(true);
      return false;
    } finally {
      setOcupado(null);
    }
  };

  const cambiarGrupo = (g: GrupoDetalle, cambio: CambioGrupo) => {
    setGrupos((prev) => prev.map((x) => (x.id === g.id ? { ...x, ...cambio } : x)));
    void escribir(g.id, () => ProductModifiersService.updateGroup(g.id, cambio), t('toasts.errorGuardar'));
  };

  const moverGrupo = (indice: number, dir: -1 | 1) => {
    const nuevo = mover(grupos, indice, dir);
    if (!nuevo) return;
    setGrupos(nuevo);
    void escribir(
      nuevo[indice + dir].id,
      () =>
        Promise.all(
          nuevo.map((g, i) => (g.display_order !== i ? ProductModifiersService.updateGroup(g.id, { display_order: i }) : Promise.resolve())),
        ),
      t('toasts.errorOrden'),
    );
  };

  const agregarOpcion = (g: GrupoDetalle, nombre: string, precio: number) =>
    escribir(
      g.id,
      () =>
        ProductModifiersService.createModifier({
          group_id: g.id,
          name: nombre,
          extra_price: precio,
          is_active: true,
          display_order: g.opciones.reduce((m, o) => Math.max(m, o.display_order + 1), 0),
        }),
      t('toasts.errorOpcion'),
    );

  const cambiarOpcion = (g: GrupoDetalle, clave: string, cambio: CambioOpcion) => {
    const opcion = g.opciones.find((o) => o.clave === clave);
    if (!opcion) return;
    setGrupos((prev) =>
      prev.map((x) => (x.id === g.id ? { ...x, opciones: x.opciones.map((o) => (o.clave === clave ? { ...o, ...cambio } : o)) } : x)),
    );
    const datos: { name?: string; extra_price?: number; is_active?: boolean } = {};
    if (cambio.name !== undefined) datos.name = cambio.name;
    if (cambio.extra_price !== undefined) datos.extra_price = cambio.extra_price ?? 0;
    if (cambio.is_active !== undefined) datos.is_active = cambio.is_active;
    void escribir(g.id, () => ProductModifiersService.updateModifier(opcion.id, datos), t('toasts.errorGuardar'));
  };

  const moverOpcion = (g: GrupoDetalle, clave: string, dir: -1 | 1) => {
    const indice = g.opciones.findIndex((o) => o.clave === clave);
    const nuevo = mover(g.opciones, indice, dir);
    if (!nuevo) return;
    setGrupos((prev) => prev.map((x) => (x.id === g.id ? { ...x, opciones: nuevo } : x)));
    void escribir(
      g.id,
      () =>
        Promise.all(
          nuevo.map((o, i) => (o.display_order !== i ? ProductModifiersService.updateModifier(o.id, { display_order: i }) : Promise.resolve())),
        ),
      t('toasts.errorOrden'),
    );
  };

  const crearGrupo = (nombre: string, modo: ModoSeleccion) =>
    escribir(
      -1,
      async () => {
        await ProductModifiersService.createGroup({
          product_id: producto.id,
          name: nombre,
          selection_mode: modo,
          min_selections: 0,
          max_selections: modo === 'single' ? 1 : null,
          required: false,
          display_order: grupos.reduce((m, g) => Math.max(m, g.display_order + 1), 0),
        });
        toast({ title: t('toasts.grupoCreado'), description: nombre });
        void cargarSugerencias();
      },
      t('toasts.errorGrupo'),
      true,
    );

  const confirmarEliminar = async () => {
    if (!confirmacion) return;
    setEliminando(true);
    try {
      if (confirmacion.tipo === 'grupo') {
        await escribir(confirmacion.grupo.id, () => ProductModifiersService.deleteGroup(confirmacion.grupo.id), t('toasts.errorEliminar'), true);
      } else {
        await escribir(confirmacion.grupo.id, () => ProductModifiersService.deleteModifier(confirmacion.opcionId), t('toasts.errorEliminar'));
      }
    } finally {
      setEliminando(false);
    }
  };

  const existentesLibres = useMemo(
    () => nombresExistentes.filter((n) => !grupos.some((g) => g.name.trim().toLowerCase() === n.trim().toLowerCase())),
    [nombresExistentes, grupos],
  );

  if (carga === 'cargando') {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-4 w-3/4" />
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl border border-line p-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-8 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (carga === 'error') {
    return <EmptyState variante="error" titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={() => void cargar()} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-secondary">{t('ayuda')}</p>

      {grupos.length === 0 && (
        <EmptyState variante="empty" icono={ListPlus} titulo={t('vacio.titulo')} descripcion={t('vacio.descripcion')} compacto />
      )}

      {grupos.map((g, i) => (
        <EditorGrupoModificadores
          key={g.id}
          grupo={g}
          indice={i}
          total={grupos.length}
          moneda={moneda}
          sugerencias={sugerencias}
          deshabilitado={!puedeEditar}
          motivo={motivo}
          ocupado={ocupado === g.id}
          onCambiarGrupo={(cambio) => cambiarGrupo(g, cambio)}
          onMoverGrupo={(dir) => moverGrupo(i, dir)}
          onEliminarGrupo={() => setConfirmacion({ tipo: 'grupo', grupo: g })}
          onAgregarOpcion={(nombre, precio) => agregarOpcion(g, nombre, precio)}
          onCambiarOpcion={(clave, cambio) => cambiarOpcion(g, clave, cambio)}
          onMoverOpcion={(clave, dir) => moverOpcion(g, clave, dir)}
          onEliminarOpcion={(clave) => {
            const o = g.opciones.find((x) => x.clave === clave);
            if (o) setConfirmacion({ tipo: 'opcion', grupo: g, opcionId: o.id, nombre: o.name });
          }}
        />
      ))}

      <NuevoGrupoModificadores existentes={existentesLibres} onCrear={crearGrupo} deshabilitado={!puedeEditar || ocupado === -1} motivo={motivo} />

      <ConfirmDialog
        open={confirmacion !== null}
        onOpenChange={(abierto) => !abierto && !eliminando && setConfirmacion(null)}
        title={
          confirmacion?.tipo === 'grupo'
            ? t('confirmar.grupoTitulo', { nombre: confirmacion.grupo.name })
            : t('confirmar.opcionTitulo', { nombre: confirmacion?.tipo === 'opcion' ? confirmacion.nombre : '' })
        }
        description={confirmacion?.tipo === 'grupo' ? t('confirmar.grupoDescripcion') : t('confirmar.opcionDescripcion')}
        confirmLabel={tc('eliminar')}
        cancelLabel={tc('cancelar')}
        variant="destructive"
        loading={eliminando}
        onConfirm={confirmarEliminar}
      />
    </div>
  );
}
