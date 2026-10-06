'use client';

/**
 * Detalle de una carta (Figma B/13-02; F-flujos/1 carta por sede): TabBar
 * Contenido / Por sede / Variantes y extras (+ Horario en móvil).
 *
 * - Contenido (lg+): exactamente 13-02 — a la izquierda «Cuándo se muestra»,
 *   «En qué sedes» y el PDF; a la derecha las categorías con sus excepciones.
 *   En móvil el horario pasa a su propia pestaña.
 * - Por sede: disponibilidad, precio web y agotados de los productos de ESTA
 *   carta en cada sede (`PorSedeCarta`, controlado, sobre el servicio único de
 *   Carta por sede y `website_branch_products`).
 * - Variantes y extras: cuáles se muestran en esta carta (`VariantesCarta`);
 *   las opciones y sus precios se editan en Inventario (13-07 nota 1).
 *
 * Todo va al borrador de `useDetalleCarta` y se guarda en UN lote
 * (`PUT /api/sitio-web/carta/[menuId]`) con la única barra de guardado.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Copy, Eye, RefreshCw, Trash2 } from 'lucide-react';
import { AvisoTonal, ConfirmDialog, EmptyState, SettingsSaveBar, TabBar, Tarjeta, clasesBoton, idPanel, idPestana, useEsEscritorio, type AccionFila } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { ID_CARTA_PRINCIPAL_IMPLICITA, alternarOpcion } from '@/lib/website/carta';
import { cambioDeAccion } from '@/lib/services/website/cartaSede';
import { MarcoSitioWeb } from '../../MarcoSitioWeb';
import { ICONO_PESTANA_CARTA } from '../iconosSecciones';
import { useTextosConfiguracion } from '../textos';
import { CategoriasCarta } from './CategoriasCarta';
import { iconoCarta, resumenSedes } from './formatoCarta';
import { PanelHorarioCarta, PanelPdfCarta, PanelSedesCarta } from './PanelesDetalle';
import { RUTA_CARTA, rutaDetalleCarta, rutaVistaPreviaCarta } from './rutasCarta';
import { apiCarta, conCambioSede, useDetalleCarta } from './useCarta';
import { PorSedeCarta } from './PorSedeCarta';
import { VariantesCarta } from './VariantesCarta';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../../ui/iconosSitio';

type Pestana = 'contenido' | 'sede' | 'variantes' | 'horario';

function EsqueletoDetalle() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]" aria-busy="true">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

export function DetalleCarta({ menuId }: { menuId: string }) {
  const t = useTextosConfiguracion();
  const d = useDetalleCarta(menuId);
  const router = useRouter();
  const { toast } = useToast();
  const esEscritorio = useEsEscritorio();
  const [pestana, setPestana] = useState<Pestana>('contenido');
  const [eliminar, setEliminar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const datos = d.datos;
  const b = d.borrador;
  const implicita = menuId === ID_CARTA_PRINCIPAL_IMPLICITA;
  const sinPermiso = d.fallo === 'sin_permiso' || (!!datos && !datos.permisos.editar);
  const bloqueado = implicita || !datos?.disponible;
  // «Por sede» escribe en `website_branch_products`, que ya existe: sirve también con la carta implícita.
  const sinEdicion = !datos?.permisos.editar;
  const sedesCarta = useMemo(() => (datos && b ? (b.sedes ? datos.sedes.filter((s) => b.sedes!.includes(s.id)) : datos.sedes) : []), [datos, b]);

  const guardar = async () => {
    const ok = await d.guardar();
    toast(ok ? { title: t('detalle.guardado') } : { title: t('detalle.errorGuardar'), variant: 'destructive' });
  };

  const duplicar = async () => {
    if (!datos) return;
    setOcupado(true);
    try {
      const nombre = t('carta.copia', { nombre: datos.carta.nombre }).slice(0, 80);
      const id = await apiCarta.crear({ nombre, duplicarDe: datos.carta.id, todasLasCategorias: false });
      toast({ title: t('carta.duplicada', { nombre }) });
      router.push(rutaDetalleCarta(id));
    } catch {
      toast({ title: t('carta.errorAccion'), variant: 'destructive' });
    } finally {
      setOcupado(false);
    }
  };

  const borrar = async () => {
    setOcupado(true);
    try {
      await apiCarta.eliminar(menuId);
      toast({ title: t('carta.eliminada') });
      router.push(RUTA_CARTA);
    } catch {
      toast({ title: t('carta.errorAccion'), variant: 'destructive' });
    } finally {
      setOcupado(false);
      setEliminar(false);
    }
  };

  const vigentes = datos?.carta.vigenteEn ?? null;
  const subtitulo = !datos
    ? undefined
    : vigentes === null
      ? resumenSedes(t, datos.carta.sedes, datos.sedes)
      : vigentes.length > 0
        ? t('detalle.visibleEn', { sedes: datos.sedes.filter((s) => vigentes.includes(s.id)).map((s) => s.nombre).join(', ') })
        : t('detalle.fueraDeHorario');

  const pestanas = [
    { valor: 'contenido' as const, etiqueta: t('detalle.pestanas.contenido'), icono: ICONO_PESTANA_CARTA.contenido },
    ...(!esEscritorio ? [{ valor: 'horario' as const, etiqueta: t('detalle.pestanas.horario'), icono: ICONO_PESTANA_CARTA.horario }] : []),
    { valor: 'sede' as const, etiqueta: t('detalle.pestanas.sede'), icono: ICONO_PESTANA_CARTA.sede },
    { valor: 'variantes' as const, etiqueta: t('detalle.pestanas.variantes'), icono: ICONO_PESTANA_CARTA.variantes },
  ];
  const activa: Pestana = esEscritorio && pestana === 'horario' ? 'contenido' : pestana;

  // En escritorio Recargar ya está a la vista: el «⋯» solo lleva lo que no se ve.
  const menu: AccionFila[] = [
    { id: 'recargar', etiqueta: t('detalle.recargar'), icono: RefreshCw, onSelect: () => void d.recargar(), oculta: esEscritorio },
    { id: 'vista', etiqueta: t('detalle.vistaPrevia'), icono: Eye, onSelect: () => router.push(rutaVistaPreviaCarta({ menu: implicita ? null : menuId })), oculta: esEscritorio },
    { id: 'duplicar', etiqueta: t('carta.duplicar'), icono: Copy, onSelect: () => void duplicar(), oculta: bloqueado, deshabilitada: ocupado },
    { id: 'eliminar', etiqueta: t('carta.eliminar'), icono: Trash2, destructiva: true, onSelect: () => setEliminar(true), oculta: bloqueado },
  ];

  const izquierda = b && datos && (
    <div className="flex flex-col gap-4">
      {esEscritorio && <PanelHorarioCarta t={t} horario={b.horario} deshabilitado={bloqueado} onCambiar={(h) => d.editar((x) => ({ ...x, horario: h }))} />}
      <PanelSedesCarta t={t} sedes={b.sedes} todas={datos.sedes} deshabilitado={bloqueado} onCambiar={(s) => d.editar((x) => ({ ...x, sedes: s }))} />
      <PanelPdfCarta
        t={t}
        pdfUrl={b.pdfUrl}
        subiendo={d.subiendoPdf}
        deshabilitado={bloqueado}
        onSubir={(archivo) => void d.subirPdf(archivo).then((ok) => !ok && toast({ title: t('detalle.errorPdf'), variant: 'destructive' }))}
        onQuitar={() => d.editar((x) => ({ ...x, pdfUrl: null }))}
      />
    </div>
  );

  const contenido = () => {
    if (sinPermiso) return <EmptyState variante="forbidden" titulo={t('carta.sinPermisoTitulo')} descripcion={t('carta.sinPermisoDescripcion')} />;
    if (d.fallo === 'no_encontrada') {
      return (
        <EmptyState
          variante="error"
          titulo={t('detalle.noEncontradaTitulo')}
          descripcion={t('detalle.noEncontradaDescripcion')}
          accion={{ etiqueta: t('detalle.volverCarta'), href: RUTA_CARTA }}
        />
      );
    }
    if (d.fallo) return <EmptyState variante="error" titulo={t('carta.errorTitulo')} descripcion={t('carta.errorDescripcion')} onReintentar={() => void d.recargar()} />;
    if (!datos || !b) return null;

    return (
      <div className="flex flex-col gap-4 lg:gap-6">
        {bloqueado && <AvisoTonal tono="informacion" titulo={t('detalle.implicita')} />}
        <TabBar id="detalle-carta" etiqueta={t('detalle.pestanasEtiqueta')} pestanas={pestanas} valor={activa} onValorChange={setPestana} />
        <div role="tabpanel" id={idPanel('detalle-carta', activa)} aria-labelledby={idPestana('detalle-carta', activa)}>
          {activa === 'contenido' && (
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-6">
              {izquierda}
              <CategoriasCarta
                t={t}
                categorias={b.categorias}
                disponibles={datos.disponibles}
                moneda={datos.moneda}
                deshabilitado={bloqueado}
                onCambiar={(categorias) => d.editar((x) => ({ ...x, categorias }))}
              />
            </div>
          )}
          {activa === 'horario' && (
            <PanelHorarioCarta t={t} horario={b.horario} deshabilitado={bloqueado} onCambiar={(h) => d.editar((x) => ({ ...x, horario: h }))} />
          )}
          {activa === 'sede' && (
            <Tarjeta titulo={t('detalle.sedeTitulo')} descripcion={t('porSede.descripcion')} icono={ICONO_PESTANA_CARTA.sede}>
              <PorSedeCarta
                t={t}
                sedes={sedesCarta}
                categorias={b.categorias}
                moneda={datos.moneda}
                porSede={b.porSede ?? {}}
                deshabilitado={sinEdicion}
                recarga={datos}
                onCambiar={(sede, producto, parche) => d.editar((x) => conCambioSede(x, sede, producto, parche))}
                onCategoria={(sede, categoriaId, accion) =>
                  d.editar((x) => {
                    const productos = x.categorias.find((c) => c.id === categoriaId)?.productos ?? [];
                    return productos.reduce((acc, p) => conCambioSede(acc, sede, p.id, cambioDeAccion(p.id, accion)), x);
                  })
                }
              />
            </Tarjeta>
          )}
          {activa === 'variantes' && (
            <VariantesCarta
              t={t}
              categorias={b.categorias}
              disponible={datos.opcionesDisponibles === true}
              deshabilitado={bloqueado || sinEdicion}
              onCambiar={(producto, tipo, opcion, mostrar) => d.editar((x) => ({ ...x, categorias: alternarOpcion(x.categorias, producto, tipo, opcion, mostrar) }))}
            />
          )}
        </div>
        <SettingsSaveBar
          cambios={d.cambios}
          guardando={d.guardando}
          onGuardar={() => void guardar()}
          onDescartar={d.descartar}
          mensaje={d.errorGuardado ? t('detalle.errorGuardar') : undefined}
        />
      </div>
    );
  };

  return (
    <MarcoSitioWeb
      href={RUTA_CARTA}
      titulo={datos?.carta.nombre ?? t('carta.titulo')}
      icono={datos ? iconoCarta(datos.carta.icono) : undefined}
      migasPadre={[{ etiqueta: t('carta.titulo'), href: RUTA_CARTA }]}
      subtitulo={subtitulo}
      estado={d.cargando ? 'cargando' : 'listo'}
      esqueleto={<EsqueletoDetalle />}
      nombreContenido={t('detalle.nombreContenido')}
      sinVerSitio
      acciones={sinPermiso || d.fallo ? <></> : undefined}
      menu={menu}
      accionesSecundarias={
        <>
          <button
            type="button"
            className={clasesBoton({ variante: 'secundario', tamano: 'md', className: 'w-10 px-0' })}
            aria-label={t('detalle.recargar')}
            title={t('detalle.recargar')}
            onClick={() => void d.recargar()}
          >
            <RefreshCw aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          </button>
          <Link href={rutaVistaPreviaCarta({ menu: implicita ? null : menuId })} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
            <Eye aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
            {t('detalle.vistaPrevia')}
          </Link>
        </>
      }
      accionPrimaria={
        <button
          type="button"
          className={clasesBoton({ variante: 'primario', tamano: 'md' })}
          disabled={sinEdicion || d.cambios === 0 || d.guardando}
          onClick={() => void guardar()}
        >
          <Check aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          {t('detalle.guardar')}
        </button>
      }
    >
      {contenido()}
      <ConfirmDialog
        abierto={eliminar}
        onAbiertoChange={setEliminar}
        titulo={t('carta.eliminarTitulo', { nombre: datos?.carta.nombre ?? '' })}
        descripcion={t('carta.eliminarDescripcion')}
        textoConfirmar={t('carta.eliminar')}
        tono="peligro"
        icono={Trash2}
        cargando={ocupado}
        onConfirmar={borrar}
      />
    </MarcoSitioWeb>
  );
}
