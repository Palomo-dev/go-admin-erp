'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Plus, RefreshCw, Ruler, Scale } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PageHeader, RowActionsMenu, TabBar, idPanel, idPestana, useListadoServidor, type AccionFila } from '@/components/kit';
import { DialogoConversion, type ConversionEditable, type ProductoConversion } from '@/components/kit/receta';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/use-toast';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import { getOrganizationId, ORGANIZATION_CHANGED_EVENT } from '@/lib/hooks/useOrganization';
import { usePermisosInventario } from '@/lib/inventario/usePermisosInventario';
import { ErrorConversion, unitConversionService } from '@/lib/services/unitConversionService';
import type { Conversion, ResumenUnidades, Unidad } from './tipos';
import { equivalencia, formatoFactor } from './logicaUnidades';
import { ErrorUnidades, unidadesService } from './servicioUnidades';
import { DialogoUnidad } from './DialogoUnidad';
import { PestanaUnidades, rutaProductosDeUnidad } from './PestanaUnidades';
import { PestanaConversiones } from './PestanaConversiones';

export type PestanaUnidadesYConversiones = 'unidades' | 'conversiones';
type Estado = 'cargando' | 'listo' | 'error' | 'sinPermiso';

interface EstadoDialogoConversion {
  de: string;
  a: string;
  alcance?: 'organizacion' | 'producto';
  producto: ProductoConversion | null;
  conversion: ConversionEditable | null;
}

const RUTA: Record<PestanaUnidadesYConversiones, string> = {
  unidades: '/app/inventario/unidades',
  conversiones: '/app/inventario/conversiones',
};

/**
 * «Unidades de medida» y «Conversiones de unidades» (Figma sección
 * `593:333686`): una página con dos pestañas; cada una tiene su ruta
 * (`/inventario/unidades`, `/inventario/conversiones`).
 *
 * Dónde se usan afuera: la unidad del producto (formulario, B7), las recetas y
 * la producción (conversión con `fn_unidad_factor`: producto > organización >
 * sistema), los productos por peso (KG, LB, GR) y la factura electrónica (la
 * unidad DIAN de cada unidad la toma el disparador de `invoice_items`). La
 * conversión «solo este producto» vale para las recetas de ese ingrediente y
 * no para otros.
 */
export function UnidadesPage({ pestana }: { pestana: PestanaUnidadesYConversiones }) {
  const t = useTranslations('inventarioUnidades');
  const router = useRouter();
  const { toast } = useToast();
  const permisosInv = usePermisosInventario();
  const permisos = { editar: permisosInv.editar_catalogo, eliminar: permisosInv.eliminar };
  const org = getOrganizationId();

  const listadoUnidades = useListadoServidor({
    filtros: ['tipo', 'ambito', 'uso', 'conversiones'],
    camposOrden: ['codigo', 'nombre', 'productos'],
    tamanoPorDefecto: 25,
  });
  const listadoConversiones = useListadoServidor({
    filtros: ['tipo', 'ambito', 'unidad', 'revisar'],
    tamanoPorDefecto: 25,
  });

  const [resumen, setResumen] = useState<ResumenUnidades | null>(null);
  const [estado, setEstado] = useState<Estado>('cargando');
  const [dialogoUnidad, setDialogoUnidad] = useState<{ unidad: Unidad | null } | null>(null);
  const [dialogoConversion, setDialogoConversion] = useState<EstadoDialogoConversion | null>(null);
  const [eliminarUnidades, setEliminarUnidades] = useState<Unidad[] | null>(null);
  const [eliminarConversiones, setEliminarConversiones] = useState<Conversion[] | null>(null);
  const [procesando, setProcesando] = useState(false);

  const cargar = useCallback(async () => {
    const o = getOrganizationId();
    if (!o) return;
    setEstado((e) => (e === 'listo' ? 'listo' : 'cargando'));
    try {
      setResumen(await unidadesService.resumen(o));
      setEstado('listo');
    } catch (e) {
      setEstado(e instanceof ErrorUnidades && e.sqlstate === '42501' ? 'sinPermiso' : 'error');
    }
  }, []);

  useEffect(() => {
    void cargar();
    window.addEventListener(ORGANIZATION_CHANGED_EVENT, cargar);
    return () => window.removeEventListener(ORGANIZATION_CHANGED_EVENT, cargar);
  }, [cargar]);

  const unidades = useMemo(() => resumen?.unidades ?? [], [resumen]);
  const conversiones = useMemo(() => resumen?.conversiones ?? [], [resumen]);
  const unidadesReceta = useMemo(() => unidades.filter((u) => u.activo).map((u) => ({ code: u.codigo, name: u.nombre, unit_type: u.tipo })), [unidades]);
  const buscarProducto = useCallback((texto: string, senal: AbortSignal) => unidadesService.buscarProductos(getOrganizationId(), texto, senal), []);

  const nuevaConversion = (de = '', a = '', producto: ProductoConversion | null = null) => setDialogoConversion({ de, a, producto, conversion: null });
  const editarConversion = (c: Conversion) =>
    setDialogoConversion({
      de: c.de,
      a: c.a,
      producto: null,
      conversion: { id: c.id, de: c.de, a: c.a, factor: c.factor, producto: c.producto, inversaId: c.inversa_id },
    });

  const irA = (p: PestanaUnidadesYConversiones, qs?: string) => router.push(qs ? `${RUTA[p]}?${qs}` : RUTA[p], { scroll: false });

  const exportarUnidades = (lista: Unidad[]) =>
    descargarCsv(
      'unidades.csv',
      aCsv([
        [t('csv.codigo'), t('csv.nombre'), t('csv.tipo'), t('csv.ambito'), t('csv.dian'), t('csv.productos'), t('csv.conversiones')],
        ...lista.map((u) => [u.codigo, u.nombre, u.tipo ? t(`tipos.${u.tipo}`) : '', t(`ambitos.${u.ambito}`), u.dian_codigo ?? '', u.productos, u.conversiones]),
      ]),
    );
  const exportarConversiones = (lista: Conversion[]) =>
    descargarCsv(
      'conversiones.csv',
      aCsv([
        [t('csv.de'), t('csv.a'), t('csv.factor'), t('csv.ambito'), t('csv.producto'), t('csv.recetas')],
        ...lista.map((c) => [c.de, c.a, formatoFactor(c.factor), t(`ambitos.${c.ambito}`), c.producto?.nombre ?? '', c.recetas]),
      ]),
    );

  const masAcciones: AccionFila[] = [
    {
      id: 'exportar',
      etiqueta: t('acciones.exportar'),
      icono: Download,
      onSelect: () => (pestana === 'unidades' ? exportarUnidades(unidades) : exportarConversiones(conversiones)),
      oculta: estado !== 'listo',
    },
    { id: 'actualizar', etiqueta: t('acciones.actualizar'), icono: RefreshCw, onSelect: () => void cargar() },
  ];

  const nuevo = () => (pestana === 'unidades' ? setDialogoUnidad({ unidad: null }) : nuevaConversion());
  const textoNuevo = pestana === 'unidades' ? t('nuevaUnidad') : t('nuevaConversion');
  const sistema = unidades.filter((u) => u.ambito === 'sistema').length;
  const propias = unidades.length - sistema;
  const conversionesSistema = conversiones.filter((c) => c.ambito === 'sistema').length;
  const subtitulo =
    estado === 'cargando' && !resumen
      ? t('cargando')
      : pestana === 'unidades'
        ? t('subtituloUnidades', { sistema, propias })
        : t('subtituloConversiones', { total: conversiones.length, sistema: conversionesSistema });

  const eliminarConversionesConfirmado = async () => {
    if (!eliminarConversiones) return;
    setProcesando(true);
    try {
      const n = await unitConversionService.deleteConversions(eliminarConversiones.map((c) => c.id));
      toast({ title: t('toast.conversionesEliminadas', { n }) });
      setEliminarConversiones(null);
      void cargar();
    } catch (e) {
      const codigo = e instanceof ErrorConversion ? e.codigo : '';
      toast({
        variant: 'destructive',
        title:
          codigo === 'conversion_en_uso'
            ? t('errores.conversionEnUso', { n: e instanceof ErrorConversion ? (e.relacionado ?? 1) : 1 })
            : e instanceof ErrorConversion && e.sqlstate === '42501'
              ? t('errores.sinPermiso')
              : t('errores.desconocido'),
      });
    } finally {
      setProcesando(false);
    }
  };

  const eliminarUnidadesConfirmado = async () => {
    if (!eliminarUnidades) return;
    setProcesando(true);
    try {
      const n = await unidadesService.eliminar(org, eliminarUnidades.map((u) => u.codigo));
      toast({ title: t('toast.unidadesEliminadas', { n }) });
      setEliminarUnidades(null);
      void cargar();
    } catch (e) {
      const codigo = e instanceof ErrorUnidades ? e.codigo : '';
      toast({
        variant: 'destructive',
        title: codigo === 'en_uso' ? t('errores.unidadEnUso') : e instanceof ErrorUnidades && e.sqlstate === '42501' ? t('errores.sinPermiso') : t('errores.desconocido'),
      });
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        titulo={pestana === 'unidades' ? t('tituloUnidades') : t('tituloConversiones')}
        icono={pestana === 'unidades' ? Ruler : Scale}
        migas={[{ etiqueta: t('migaInventario'), href: '/app/inventario' }, { etiqueta: pestana === 'unidades' ? t('migaUnidades') : t('migaConversiones') }]}
        subtitulo={subtitulo}
        cargando={estado === 'cargando'}
        acciones={
          <>
            {permisos.editar && (
              <Button className="h-10 gap-2" onClick={nuevo}>
                <Plus aria-hidden className="size-4" strokeWidth={1.5} />
                {textoNuevo}
              </Button>
            )}
            <RowActionsMenu acciones={masAcciones} orientacion="horizontal" tamano="md" titulo={t('tituloUnidades')} />
          </>
        }
        movil={{
          subtitulo: pestana === 'unidades' ? t('subtituloMovilUnidades', { n: unidades.length }) : t('subtituloMovilConversiones', { n: conversiones.length }),
          accion: permisos.editar ? (
            <button
              type="button"
              onClick={nuevo}
              aria-label={textoNuevo}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden className="size-5" strokeWidth={1.5} />
            </button>
          ) : undefined,
        }}
        debajo={
          <TabBar<PestanaUnidadesYConversiones>
            id="unidades"
            etiqueta={t('tituloUnidades')}
            valor={pestana}
            onValorChange={(p) => irA(p)}
            pestanas={[
              { valor: 'unidades', etiqueta: t('pestanas.unidades'), contador: resumen ? unidades.length : undefined },
              { valor: 'conversiones', etiqueta: t('pestanas.conversiones'), contador: resumen ? conversiones.length : undefined },
            ]}
          />
        }
      />

      <div role="tabpanel" id={idPanel('unidades', pestana)} aria-labelledby={idPestana('unidades', pestana)}>
        {pestana === 'unidades' ? (
          <PestanaUnidades
            resumen={resumen}
            estado={estado}
            listado={listadoUnidades}
            permisos={permisos}
            onReintentar={() => void cargar()}
            acciones={{
              nueva: () => setDialogoUnidad({ unidad: null }),
              verProductos: (u) => router.push(rutaProductosDeUnidad(u.codigo)),
              editar: (unidad) => setDialogoUnidad({ unidad }),
              eliminar: (lista) => setEliminarUnidades(lista),
              verConversiones: (u) => irA('conversiones', `unidad=${encodeURIComponent(u.codigo)}`),
              nuevaConversionDesde: (u) => nuevaConversion(u.codigo),
              exportar: exportarUnidades,
            }}
          />
        ) : (
          <PestanaConversiones
            resumen={resumen}
            estado={estado}
            listado={listadoConversiones}
            permisos={permisos}
            onReintentar={() => void cargar()}
            acciones={{
              nueva: () => nuevaConversion(),
              verRecetas: () => router.push('/app/inventario/recetas'),
              editar: editarConversion,
              crearInversa: (c) => nuevaConversion(c.a, c.de, c.producto),
              versionOrganizacion: (c) => nuevaConversion(c.de, c.a),
              porProducto: (c) => setDialogoConversion({ de: c.de, a: c.a, alcance: 'producto', producto: null, conversion: null }),
              verInversa: (c) => {
                const inv = conversiones.find((x) => x.id === c.inversa_id);
                if (inv) listadoConversiones.setBusqueda(`${inv.de}`);
              },
              eliminar: (lista) => setEliminarConversiones(lista),
              exportar: exportarConversiones,
            }}
          />
        )}
      </div>

      <DialogoUnidad
        abierto={dialogoUnidad !== null}
        onAbiertoChange={(v) => !v && setDialogoUnidad(null)}
        organizacionId={org}
        unidad={dialogoUnidad?.unidad ?? null}
        unidades={unidades}
        dian={resumen?.dian ?? []}
        onGuardada={(mensaje) => {
          toast({ title: mensaje });
          void cargar();
        }}
      />

      {dialogoConversion && (
        <DialogoConversion
          abierto
          onAbiertoChange={(v) => !v && setDialogoConversion(null)}
          organizacionId={org}
          de={dialogoConversion.de}
          a={dialogoConversion.a}
          unidades={unidadesReceta}
          libre
          producto={dialogoConversion.producto}
          buscarProducto={buscarProducto}
          conversion={dialogoConversion.conversion}
          alcanceInicial={dialogoConversion.alcance}
          onCreada={() => {
            toast({ title: dialogoConversion.conversion ? t('toast.conversionActualizada') : t('toast.conversionCreada') });
            void cargar();
          }}
        />
      )}

      <ConfirmDialog
        open={eliminarConversiones !== null}
        onOpenChange={(v) => !v && !procesando && setEliminarConversiones(null)}
        title={
          eliminarConversiones?.length === 1
            ? t('eliminar.tituloConversion', { equivalencia: equivalencia(eliminarConversiones[0].de, eliminarConversiones[0].a, eliminarConversiones[0].factor) })
            : t('eliminar.tituloConversiones', { n: eliminarConversiones?.length ?? 0 })
        }
        description={t('eliminar.descripcionConversiones')}
        confirmLabel={t('acciones.eliminar')}
        variant="destructive"
        loading={procesando}
        onConfirm={eliminarConversionesConfirmado}
      />

      <ConfirmDialog
        open={eliminarUnidades !== null}
        onOpenChange={(v) => !v && !procesando && setEliminarUnidades(null)}
        title={
          eliminarUnidades?.length === 1
            ? t('eliminar.tituloUnidad', { codigo: eliminarUnidades[0].codigo })
            : t('eliminar.tituloUnidades', { n: eliminarUnidades?.length ?? 0 })
        }
        description={t('eliminar.descripcionUnidades')}
        confirmLabel={t('acciones.eliminar')}
        variant="destructive"
        loading={procesando}
        onConfirm={eliminarUnidadesConfirmado}
      />
    </div>
  );
}
