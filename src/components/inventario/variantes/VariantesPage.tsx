'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpDown, DatabaseZap, Download, Layers, Plus, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { PageHeader, RowActionsMenu, TabBar, idPanel, idPestana, useListadoServidor, type AccionFila } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId, ORGANIZATION_CHANGED_EVENT } from '@/lib/hooks/useOrganization';
import { usePermisosInventario } from '@/lib/inventario/usePermisosInventario';
import type { EstiloTipo, ResumenVariantes, TipoVariante, ValorVariante } from './tipos';
import { moverEnLista } from './logicaVariantes';
import { ErrorVariantes, variantesService } from './variantesService';
import { DialogoTipo } from './DialogoTipo';
import { DialogoValor } from './DialogoValor';
import { DialogoFusionar, type ElementoFusion } from './DialogoFusionar';
import { DialogoOrdenar, type ElementoOrden } from './DialogoOrdenar';
import { PestanaTipos } from './PestanaTipos';
import { PestanaValores } from './PestanaValores';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';

type Pestana = 'tipos' | 'valores';
type Estado = 'cargando' | 'listo' | 'error' | 'sinPermiso';

type Fusion = { clase: 'tipos'; elementos: TipoVariante[]; destino?: number | null } | { clase: 'valores'; elementos: ValorVariante[] };
type Orden = { tipo: TipoVariante | null };
type Eliminar = { tipos: TipoVariante[]; valores: ValorVariante[] };

/**
 * «Variantes» (`/app/inventario/variantes`): el catálogo de tipos y valores de
 * la organización en una página con dos pestañas (Figma sección `969:595070`).
 * Las rutas viejas `/variantes/tipos` y `/variantes/valores?tipo=` redirigen
 * aquí.
 *
 * Qué se ve afuera de esta página: el orden y la muestra de color los usan el
 * formulario del producto (sugerencias en el orden del catálogo), el selector
 * de variantes del POS y la tienda (`ordenarAtributosSegunCatalogo`); el
 * código para el SKU, el generador de SKU de variantes; renombrar y fusionar
 * reescriben las variantes en una sola transacción (los SKU no cambian).
 */
export function VariantesPage() {
  const t = useTranslations('inventarioVariantes');
  const locale = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname() ?? '/app/inventario/variantes';
  const params = useSearchParams();
  const pestana: Pestana = params?.get('tab') === 'valores' ? 'valores' : 'tipos';
  const permisosInv = usePermisosInventario();
  const permisos = { editar: permisosInv.editar_catalogo, eliminar: permisosInv.eliminar };

  const listadoTipos = useListadoServidor({
    filtros: ['estado', 'estilo'],
    camposOrden: ['orden', 'nombre', 'valores', 'variantes'],
    ordenPorDefecto: { campo: 'orden', direccion: 'asc' },
    tamanoPorDefecto: 25,
  });
  const listadoValores = useListadoServidor({
    filtros: ['tipo', 'estado'],
    camposOrden: ['orden', 'valor', 'variantes'],
    ordenPorDefecto: { campo: 'orden', direccion: 'asc' },
    tamanoPorDefecto: 25,
    prefijo: 'v_',
  });

  const [resumen, setResumen] = useState<ResumenVariantes | null>(null);
  const [estado, setEstado] = useState<Estado>('cargando');
  const [dialogoTipo, setDialogoTipo] = useState<{ tipo: TipoVariante | null } | null>(null);
  const [dialogoValor, setDialogoValor] = useState<{ valor: ValorVariante | null; tipo: number | null } | null>(null);
  const [fusion, setFusion] = useState<Fusion | null>(null);
  const [orden, setOrden] = useState<Orden | null>(null);
  const [eliminar, setEliminar] = useState<Eliminar | null>(null);
  const [unificar, setUnificar] = useState<{ tipo?: TipoVariante; valor?: ValorVariante } | null>(null);
  const [procesando, setProcesando] = useState(false);

  const cargar = useCallback(async () => {
    const org = getOrganizationId();
    if (!org) return;
    setEstado((e) => (e === 'listo' ? 'listo' : 'cargando'));
    try {
      setResumen(await variantesService.resumen(org));
      setEstado('listo');
    } catch (e) {
      setEstado(e instanceof ErrorVariantes && e.clave === 'sinPermiso' ? 'sinPermiso' : 'error');
    }
  }, []);

  useEffect(() => {
    void cargar();
    window.addEventListener(ORGANIZATION_CHANGED_EVENT, cargar);
    return () => window.removeEventListener(ORGANIZATION_CHANGED_EVENT, cargar);
  }, [cargar]);

  const avisarError = useCallback(
    (e: unknown) => {
      const clave = e instanceof ErrorVariantes ? e.clave : 'desconocido';
      toast({ variant: 'destructive', title: t(`errores.${clave}`) });
    },
    [t, toast],
  );

  /** Ejecuta una escritura, avisa y recarga el resumen. */
  const ejecutar = useCallback(
    async (fn: () => Promise<unknown>, mensaje: string) => {
      setProcesando(true);
      try {
        await fn();
        toast({ title: mensaje });
        await cargar();
      } catch (e) {
        avisarError(e);
        throw e;
      } finally {
        setProcesando(false);
      }
    },
    [avisarError, cargar, toast],
  );

  const cambiarPestana = (p: Pestana) => {
    const qs = new URLSearchParams(params?.toString() ?? '');
    if (p === 'tipos') qs.delete('tab');
    else qs.set('tab', p);
    router.replace(qs.toString() ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const verValores = (tipo: TipoVariante) => {
    const qs = new URLSearchParams(params?.toString() ?? '');
    qs.set('tab', 'valores');
    qs.set('v_tipo', String(tipo.id));
    qs.delete('v_pagina');
    router.push(`${pathname}?${qs}`, { scroll: false });
  };

  const tipos = useMemo(() => resumen?.tipos ?? [], [resumen]);
  const valores = useMemo(() => resumen?.valores ?? [], [resumen]);
  const valoresDe = useCallback((tipo: number) => valores.filter((v) => v.tipo_id === tipo).sort((a, b) => a.orden - b.orden || a.id - b.id), [valores]);

  const exportarTipos = (lista: TipoVariante[]) =>
    descargarCsv(
      'variantes-tipos.csv',
      aCsv([
        [t('csv.id'), t('csv.orden'), t('csv.tipo'), t('csv.estilo'), t('csv.estado'), t('csv.valores'), t('csv.variantes')],
        ...lista.map((x) => [
          x.id,
          x.orden + 1,
          x.nombre,
          t(`estilos.${x.estilo}`),
          x.activo ? t('estados.activo') : t('estados.inactivo'),
          valoresDe(x.id).map((v) => v.valor).join(' | '),
          x.variantes,
        ]),
      ]),
    );
  const exportarValores = (lista: ValorVariante[]) => {
    const nombre = new Map(tipos.map((x) => [x.id, x.nombre]));
    descargarCsv(
      'variantes-valores.csv',
      aCsv([
        [t('csv.id'), t('csv.tipo'), t('csv.orden'), t('csv.valor'), t('csv.hex'), t('csv.sku'), t('csv.estado'), t('csv.variantes')],
        ...lista.map((v) => [
          v.id,
          nombre.get(v.tipo_id) ?? '',
          v.orden + 1,
          v.valor,
          v.hex ?? '',
          v.sku ?? '',
          v.activo ? t('estados.activo') : t('estados.inactivo'),
          v.variantes,
        ]),
      ]),
    );
  };

  const moverValor = (v: ValorVariante, delta: -1 | 1) => {
    const lista = valoresDe(v.tipo_id);
    const ids = moverEnLista(lista, lista.findIndex((x) => x.id === v.id), delta).map((x) => x.id);
    void ejecutar(() => variantesService.reordenar(v.tipo_id, ids), t('toast.ordenGuardado')).catch(() => undefined);
  };

  const elementosFusion: ElementoFusion[] = useMemo(() => {
    if (!fusion) return [];
    if (fusion.clase === 'tipos') {
      return fusion.elementos.map((x) => ({ id: x.id, nombre: x.nombre, variantes: x.variantes, detalle: t('fusion.detalleTipo', { n: valoresDe(x.id).length }) }));
    }
    return fusion.elementos.map((v) => ({ id: v.id, nombre: v.valor, variantes: v.variantes, detalle: v.sku ? t('valores.codigoSku', { codigo: v.sku }) : undefined }));
  }, [fusion, t, valoresDe]);

  /** Un solo elemento elegido desde «Fusionar con…»: se ofrecen los de su mismo grupo o todos. */
  const abrirFusionTipos = (lista: TipoVariante[], destino?: number | null) => {
    const elementos = lista.length > 1 ? lista : [lista[0], ...tipos.filter((x) => x.id !== lista[0].id)];
    setFusion({ clase: 'tipos', elementos, destino: destino ?? (lista.length === 1 ? null : undefined) });
  };
  const abrirFusionValores = (lista: ValorVariante[]) => {
    const elementos = lista.length > 1 ? lista : [lista[0], ...valoresDe(lista[0].tipo_id).filter((x) => x.id !== lista[0].id)];
    setFusion({ clase: 'valores', elementos });
  };

  const elementosOrden: ElementoOrden[] = useMemo(() => {
    if (!orden) return [];
    if (orden.tipo) return valoresDe(orden.tipo.id).map((v) => ({ id: v.id, nombre: v.valor, hex: orden.tipo?.estilo === 'color' ? v.hex : null }));
    return [...tipos].sort((a, b) => a.orden - b.orden || a.id - b.id).map((x) => ({ id: x.id, nombre: x.nombre }));
  }, [orden, tipos, valoresDe]);

  const fueraCatalogo = resumen?.fuera_catalogo.pares ?? 0;
  const masAcciones: AccionFila[] = [
    {
      id: 'ordenar-tipos',
      etiqueta: t('acciones.ordenarTipos'),
      icono: ArrowUpDown,
      onSelect: () => setOrden({ tipo: null }),
      oculta: !permisos.editar || tipos.length < 2,
    },
    {
      id: 'completar',
      etiqueta: t('acciones.completar'),
      descripcion: t('acciones.completarDetalle', { n: fueraCatalogo }),
      icono: DatabaseZap,
      onSelect: () =>
        void ejecutar(async () => {
          const r = await variantesService.completarCatalogo();
          return r;
        }, t('toast.completado')).catch(() => undefined),
      oculta: !permisos.editar || fueraCatalogo === 0,
    },
    {
      id: 'sugeridos',
      etiqueta: t('acciones.sugeridos'),
      descripcion: t('acciones.sugeridosDetalle'),
      icono: Sparkles,
      onSelect: () => void ejecutar(() => variantesService.usarSugeridos(null), t('toast.sugeridos')).catch(() => undefined),
      oculta: !permisos.editar || !(resumen?.globales.length ?? 0),
    },
    {
      id: 'exportar',
      etiqueta: t('acciones.exportar'),
      icono: Download,
      onSelect: () => (pestana === 'tipos' ? exportarTipos(tipos) : exportarValores(valores)),
      oculta: !tipos.length,
    },
    { id: 'actualizar', etiqueta: t('acciones.actualizar'), icono: RefreshCw, onSelect: () => void cargar() },
  ];

  const nuevo = () => (pestana === 'tipos' ? setDialogoTipo({ tipo: null }) : setDialogoValor({ valor: null, tipo: Number(listadoValores.filtros.tipo) || null }));
  const textoNuevo = pestana === 'tipos' ? t('nuevoTipo') : t('nuevoValor');
  const puedeNuevo = permisos.editar && (pestana === 'tipos' || tipos.length > 0);

  const subtitulo =
    estado === 'cargando' && !resumen
      ? t('cargando')
      : t('subtitulo', { tipos: tipos.length, valores: valores.length, variantes: (resumen?.variantes ?? 0).toLocaleString(locale) });

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        titulo={t('titulo')}
        icono={Layers}
        migas={[{ etiqueta: t('migaInventario'), href: '/app/inventario' }, { etiqueta: t('titulo') }]}
        subtitulo={subtitulo}
        cargando={estado === 'cargando'}
        acciones={
          <>
            {puedeNuevo && (
              <Button className="h-10 gap-2" onClick={nuevo}>
                <Plus aria-hidden className="size-4" strokeWidth={1.5} />
                {textoNuevo}
              </Button>
            )}
            <RowActionsMenu acciones={masAcciones} orientacion="horizontal" tamano="md" titulo={t('titulo')} />
          </>
        }
        movil={{
          subtitulo: t('subtituloMovil', { tipos: tipos.length, valores: valores.length }),
          accion: (
            <div className="flex items-center gap-1">
              {puedeNuevo && (
                <button
                  type="button"
                  onClick={nuevo}
                  aria-label={textoNuevo}
                  className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Plus aria-hidden className="size-5" strokeWidth={1.5} />
                </button>
              )}
              <RowActionsMenu acciones={masAcciones} orientacion="horizontal" tamano="sm" titulo={t('titulo')} className="size-10" />
            </div>
          ),
        }}
        debajo={
          <TabBar<Pestana>
            id="variantes"
            etiqueta={t('titulo')}
            valor={pestana}
            onValorChange={cambiarPestana}
            pestanas={[
              { valor: 'tipos', etiqueta: t('pestanas.tipos'), contador: resumen ? tipos.length : undefined },
              { valor: 'valores', etiqueta: t('pestanas.valores'), contador: resumen ? valores.length : undefined },
            ]}
          />
        }
      />

      {fueraCatalogo > 0 && permisos.editar && estado === 'listo' && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-warning-subtle bg-warning-subtle p-3 text-sm text-warning-text">
          <TriangleAlert aria-hidden className="size-4 shrink-0" strokeWidth={1.5} />
          <span className="min-w-0 flex-1">{t('avisoFuera', { n: fueraCatalogo })}</span>
          <Button
            type="button"
            variant="outline"
            className="h-9"
            disabled={procesando}
            onClick={() => void ejecutar(() => variantesService.completarCatalogo(), t('toast.completado')).catch(() => undefined)}
          >
            {t('acciones.completar')}
          </Button>
        </div>
      )}

      <div role="tabpanel" id={idPanel('variantes', pestana)} aria-labelledby={idPestana('variantes', pestana)}>
        {pestana === 'tipos' ? (
          <PestanaTipos
            resumen={resumen}
            estado={estado}
            listado={listadoTipos}
            permisos={permisos}
            onReintentar={() => void cargar()}
            acciones={{
              nuevo: () => setDialogoTipo({ tipo: null }),
              editar: (tipo) => setDialogoTipo({ tipo }),
              verValores,
              ordenarValores: (tipo) => setOrden({ tipo }),
              unificar: (tipo) => setUnificar({ tipo }),
              fusionar: (lista) => abrirFusionTipos(lista),
              activar: (lista, activo) =>
                void ejecutar(
                  () => variantesService.cambiar({ tipos: lista.map((x) => x.id), activo }),
                  activo ? t('toast.activados', { n: lista.length }) : t('toast.desactivados', { n: lista.length }),
                ).catch(() => undefined),
              estilo: (lista, estilo: EstiloTipo) =>
                void ejecutar(() => variantesService.cambiar({ tipos: lista.map((x) => x.id), estilo }), t('toast.estilo', { n: lista.length })).catch(
                  () => undefined,
                ),
              eliminar: (lista) => setEliminar({ tipos: lista, valores: [] }),
              copiarId: (tipo) => {
                void navigator.clipboard?.writeText(String(tipo.id));
                toast({ title: t('toast.idCopiado', { id: tipo.id }) });
              },
              exportar: exportarTipos,
            }}
          />
        ) : (
          <PestanaValores
            resumen={resumen}
            estado={estado}
            listado={listadoValores}
            permisos={permisos}
            onReintentar={() => void cargar()}
            acciones={{
              nuevo: (tipo) => setDialogoValor({ valor: null, tipo }),
              editar: (valor) => setDialogoValor({ valor, tipo: valor.tipo_id }),
              mover: moverValor,
              ordenar: (tipo) => setOrden({ tipo }),
              unificar: (valor) => setUnificar({ valor }),
              fusionar: abrirFusionValores,
              activar: (lista, activo) =>
                void ejecutar(
                  () => variantesService.cambiar({ valores: lista.map((v) => v.id), activo }),
                  activo ? t('toast.activados', { n: lista.length }) : t('toast.desactivados', { n: lista.length }),
                ).catch(() => undefined),
              eliminar: (lista) => setEliminar({ tipos: [], valores: lista }),
              exportar: exportarValores,
            }}
          />
        )}
      </div>

      <DialogoTipo
        abierto={dialogoTipo !== null}
        onAbiertoChange={(v) => !v && setDialogoTipo(null)}
        tipo={dialogoTipo?.tipo ?? null}
        tipos={tipos}
        onGuardado={(mensaje) => {
          toast({ title: mensaje });
          void cargar();
        }}
        onFusionarCon={(existente, actual) => abrirFusionTipos(actual ? [existente, actual] : [existente], existente.id)}
      />

      <DialogoValor
        abierto={dialogoValor !== null}
        onAbiertoChange={(v) => !v && setDialogoValor(null)}
        valor={dialogoValor?.valor ?? null}
        tipoInicial={dialogoValor?.tipo ?? null}
        tipos={tipos}
        valores={valores}
        onGuardado={(mensaje) => {
          toast({ title: mensaje });
          void cargar();
        }}
      />

      <DialogoFusionar
        abierto={fusion !== null}
        onAbiertoChange={(v) => !v && setFusion(null)}
        clase={fusion?.clase ?? 'tipos'}
        elementos={elementosFusion}
        destinoInicial={fusion?.clase === 'tipos' ? fusion.destino : undefined}
        onConfirmar={async (destino, origen) => {
          if (!fusion) return;
          await ejecutar(async () => {
            const r =
              fusion.clase === 'tipos' ? await variantesService.fusionarTipos(origen, destino) : await variantesService.fusionarValores(origen, destino);
            return r;
          }, t('toast.fusionados', { n: origen.length + 1 }));
        }}
      />

      <DialogoOrdenar
        abierto={orden !== null}
        onAbiertoChange={(v) => !v && setOrden(null)}
        titulo={orden?.tipo ? t('ordenar.tituloValores', { tipo: orden.tipo.nombre }) : t('ordenar.tituloTipos')}
        elementos={elementosOrden}
        onGuardar={(ids) => ejecutar(() => variantesService.reordenar(orden?.tipo?.id ?? null, ids), t('toast.ordenGuardado'))}
      />

      <ConfirmDialog
        open={unificar !== null}
        onOpenChange={(v) => !v && !procesando && setUnificar(null)}
        title={t('unificar.titulo', { nombre: unificar?.tipo?.nombre ?? unificar?.valor?.valor ?? '' })}
        description={t('unificar.descripcion', {
          escrituras: (unificar?.tipo?.escrituras ?? unificar?.valor?.escrituras ?? []).map((e) => `«${e.texto}»`).join(', '),
          n: (unificar?.tipo?.escrituras ?? unificar?.valor?.escrituras ?? []).reduce((s, e) => s + e.variantes, 0),
          nombre: unificar?.tipo?.nombre ?? unificar?.valor?.valor ?? '',
        })}
        confirmLabel={t('unificar.confirmar')}
        loading={procesando}
        onConfirm={async () => {
          const u = unificar;
          if (!u) return;
          await ejecutar(
            () =>
              u.tipo
                ? variantesService.guardarTipo(u.tipo.id, { nombre: u.tipo.nombre, unificar: true })
                : variantesService.guardarValor(u.valor!.id, { valor: u.valor!.valor, unificar: true }),
            t('toast.unificado'),
          ).catch(() => undefined);
          setUnificar(null);
        }}
      />

      <ConfirmDialog
        open={eliminar !== null}
        onOpenChange={(v) => !v && !procesando && setEliminar(null)}
        title={
          eliminar?.tipos.length === 1 && !eliminar.valores.length
            ? t('eliminar.tituloTipo', { nombre: eliminar.tipos[0].nombre })
            : eliminar?.valores.length === 1 && !eliminar.tipos.length
              ? t('eliminar.tituloValor', { nombre: eliminar.valores[0].valor })
              : t('eliminar.tituloVarios', { n: (eliminar?.tipos.length ?? 0) + (eliminar?.valores.length ?? 0) })
        }
        description={eliminar?.tipos.length ? t('eliminar.descripcionTipos') : t('eliminar.descripcionValores')}
        confirmLabel={t('acciones.eliminar')}
        variant="destructive"
        loading={procesando}
        onConfirm={async () => {
          const e = eliminar;
          if (!e) return;
          await ejecutar(
            () => variantesService.eliminar({ tipos: e.tipos.map((x) => x.id), valores: e.valores.map((v) => v.id) }),
            t('toast.eliminados', { n: e.tipos.length + e.valores.length }),
          ).catch(() => undefined);
          setEliminar(null);
        }}
      />
    </div>
  );
}
