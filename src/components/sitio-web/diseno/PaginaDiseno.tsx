'use client';

/**
 * /app/sitio-web/diseno — «Diseño» (Figma A/06a escritorio, A/06f sin permiso,
 * A/06g móvil, notas A/06h-06i). Tres pestañas sobre el borrador V2:
 * - Estilo: `EstiloDelSitioPanel` + «Vista previa en vivo · Inicio».
 * - Encabezado y pie: acceso directo al editor con el elemento seleccionado.
 * - Logo y favicon: el mismo componente y dato que Configuración.
 *
 * Datos: `useContextoDiseno` (resumen del servidor + `useSitioV2`). Publicar va
 * por el hook único (`useSitioV2().publicar`) y el diálogo «Revisar cambios» del
 * Resumen; un 409 abre el conflicto y nunca pisa a nadie. Estados: cargando,
 * error con «Reintentar», sin permiso (A/06f) y listo; la primera vez crea el
 * sitio V2 al entrar.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Eye, RotateCcw, Send } from 'lucide-react';
import {
  AvisoTonal,
  ConfirmDialog,
  EmptyState,
  PanelAdaptable,
  Skeleton,
  TabBar,
  clasesBoton,
  idPanel,
  idPestana,
  useEsEscritorio,
  useOpcionUrl,
  type AccionFila,
} from '@/components/kit';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { MarcoSitioWeb, type EstadoVistaSitio } from '../MarcoSitioWeb';
import { RAIZ_SITIO_WEB } from '../rutasSitioWeb';
import { useEtiquetaPublicacion } from '../ui/PublishStatusBadge';
import { SubtituloConEstado } from '../ui/IconoEstadoPublicacion';
import { CLASE_TAMANO_ICONO, ICONO_PESTANA_DISENO, TRAZO_ICONO } from '../ui/iconosSitio';
import { DialogoRevisarCambios } from '../resumen/DialogoRevisarCambios';
import { DialogoConflicto } from '../paginas/DialogoConflicto';
import { esInicio } from '../paginas/tipoPagina';
import { estiloEnUso, estilosDelGiro, plantillaEnUso } from '@/lib/website/contrato/catalogoPlantillas';
import { escribirEstilo, temaParaLienzo, tokensExtendidosDisponibles } from '@/lib/website/v2/tokensEstilo';
import { valorCampo } from '@/lib/website/v2/valorCampo';
import { CATALOGO_SITIO } from './catalogo';
import { EstiloDelSitioPanel } from './EstiloDelSitioPanel';
import { VistaPreviaEnVivo } from './VistaPreviaEnVivo';
import { PestanaEncabezadoPie } from './PestanaEncabezadoPie';
import { PestanaLogoFavicon } from './PestanaLogoFavicon';
import { useContextoDiseno } from './useContextoDiseno';
import { useEstiloSitio } from './useEstiloSitio';
import { useAvisoFalloSitio } from './useAvisoFalloSitio';
import { useColoresLogo } from './useColoresLogo';
import { useVistaPreviaBorrador } from './useVistaPreviaBorrador';
import { useTextosDiseno } from './textos';

export const RUTA_DISENO = `${RAIZ_SITIO_WEB}/diseno`;
export const PESTANAS_DISENO = ['estilo', 'encabezado-pie', 'logo'] as const;
export type PestanaDiseno = (typeof PESTANAS_DISENO)[number];
const ID_PESTANAS = 'diseno-pestanas';

/** Esqueleto de dos columnas (panel 360 px y vista previa), como A/06d en Plantillas. */
function EsqueletoDiseno() {
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-6" aria-busy="true">
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <Skeleton className="h-4 w-1/2" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-[16/12] rounded-xl" />
          ))}
        </div>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10 rounded-lg" />
        ))}
      </div>
      <div className="hidden flex-col gap-3 rounded-xl border border-line bg-surface p-4 lg:flex">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="aspect-[16/10] w-full rounded-lg" />
      </div>
    </div>
  );
}

export function PaginaDiseno() {
  const t = useTextosDiseno();
  const etiquetaPublicacion = useEtiquetaPublicacion();
  const ctx = useContextoDiseno();
  const { organization } = useOrganization();
  const esEscritorio = useEsEscritorio();
  const [pestana, setPestana] = useOpcionUrl<PestanaDiseno>('tab', PESTANAS_DISENO, 'estilo', 'replace');
  const [revisarAbierto, setRevisarAbierto] = useState(false);
  const [restablecerAbierto, setRestablecerAbierto] = useState(false);
  const [vistaMovil, setVistaMovil] = useState(false);
  const extendidos = tokensExtendidosDisponibles();

  const { sitio, permisos } = ctx;
  const documento = sitio.documento;
  const presets = useMemo(() => estilosDelGiro(CATALOGO_SITIO, ctx.giro), [ctx.giro]);
  const enUso = useMemo(
    () =>
      plantillaEnUso(CATALOGO_SITIO, {
        preset: valorCampo(documento?.tema.preset),
        plantillaBase: valorCampo(documento?.tema.plantillaBase),
        fuenteTitulos: valorCampo(documento?.tema.tipografia.titulos),
      }),
    [documento],
  );
  const base = enUso?.estilo ?? presets[0] ?? CATALOGO_SITIO.plantillas[0]?.estilo ?? null;
  // Los avisos de fallo leen el motivo cuando el estado ya lo refleja (no del
  // render anterior al `await`): un 409 solo abre el diálogo de conflicto.
  const alFallar = useAvisoFalloSitio(sitio);
  const estilo = useEstiloSitio(sitio, base, extendidos, () =>
    alFallar(({ conflicto, mensaje }) => {
      if (!conflicto) toast.error(t('guardado.error', { mensaje }).trim());
    }),
  );
  const seleccionado = estilo.estilo ? estiloEnUso(presets, estilo.estilo, enUso) : null;
  // Tema en edición para la vista previa: el borrador con el estilo escrito igual que al guardar.
  const estiloActual = estilo.estilo;
  const temaVivo = useMemo(
    () =>
      documento && estiloActual
        ? temaParaLienzo(escribirEstilo(documento, estiloActual, extendidos), (sitio.sitio?.branchId ?? null) !== null, sitio.borrador?.basePrincipal)
        : null,
    [documento, estiloActual, extendidos, sitio.sitio, sitio.borrador],
  );
  const coloresLogo = useColoresLogo(valorCampo(documento?.identidad.logoUrl));
  const paginaInicioId = documento?.paginas.find(esInicio)?.id ?? ctx.paginaInicioId;
  const vista = useVistaPreviaBorrador(sitio.sitio?.id ?? null, ctx.host, paginaInicioId);

  const publicar = async () => {
    if (!(await estilo.guardarAhora())) return;
    const r = await sitio.publicar(null);
    if (r) {
      setRevisarAbierto(false);
      toast.success(t('publicar.listo'));
      ctx.recontar();
      return;
    }
    setRevisarAbierto(false);
    alFallar(({ conflicto, mensaje }) => {
      if (conflicto) toast.error(t('publicar.conflicto'));
      else if (mensaje) toast.error(t('publicar.error', { mensaje }));
    });
  };

  const abrirVistaPrevia = async () => {
    if (!esEscritorio) {
      setVistaMovil(true);
      return;
    }
    // La pestaña se abre en el clic (sin bloqueo de ventanas emergentes) y luego navega.
    const pestanaNueva = window.open('', '_blank');
    if (pestanaNueva) pestanaNueva.opener = null;
    try {
      await estilo.guardarAhora();
      const destino = (await vista.pedir()) ?? ctx.url;
      if (!destino) {
        pestanaNueva?.close();
        return;
      }
      if (pestanaNueva) pestanaNueva.location.href = destino;
      else window.open(destino, '_blank', 'noopener,noreferrer');
    } catch (error) {
      pestanaNueva?.close();
      toast.error(t('vista.errorAbrir', { mensaje: error instanceof Error ? error.message : '' }).trim());
    }
  };

  const restablecer = () => {
    if (seleccionado) estilo.aplicarPreset(seleccionado);
    setRestablecerAbierto(false);
  };

  const listo = ctx.estado === 'listo' && !!estilo.estilo;
  const estado: EstadoVistaSitio = ctx.estado === 'listo' && !estilo.estilo ? 'cargando' : ctx.estado;
  const seccion = t(pestana === 'estilo' ? 'subtitulo.estilo' : pestana === 'logo' ? 'subtitulo.logo' : 'subtitulo.encabezadoPie');
  // El subtítulo lleva el icono del estado (14 px, color del tono), como el resto del módulo.
  const subtitulo = listo ? (
    <SubtituloConEstado
      estado={ctx.estadoPublicacion}
      texto={t('subtitulo.conEstado', { seccion, estado: etiquetaPublicacion(ctx.estadoPublicacion) })}
    />
  ) : undefined;
  const puedePublicar = permisos.publicar && !!sitio.borrador;
  const motivoPublicar = permisos.publicar ? undefined : t('publicar.sinPermiso');

  const menu: AccionFila[] = [
    {
      id: 'restablecer',
      etiqueta: t('acciones.restablecer'),
      icono: RotateCcw,
      onSelect: () => setRestablecerAbierto(true),
      deshabilitada: !seleccionado,
      motivo: seleccionado ? undefined : t('restablecer.sinPreset'),
    },
    {
      id: 'ver-sitio',
      etiqueta: t('acciones.verSitio'),
      icono: ExternalLink,
      onSelect: () => ctx.url && window.open(ctx.url, '_blank', 'noopener,noreferrer'),
      oculta: !ctx.url,
    },
  ];

  // Error (patrón A/06e): «No pudimos cargar el diseño» y «Reintentar».
  if (estado === 'error') {
    return (
      <MarcoSitioWeb href={RUTA_DISENO} subtitulo="" acciones={false}>
        <EmptyState variante="error" titulo={t('estados.errorTitulo')} descripcion={t('estados.errorDescripcion')} onReintentar={ctx.reintentar} />
      </MarcoSitioWeb>
    );
  }

  // Sin permiso (A/06f): cabecera «Diseño» sin acciones y el vacío con candado y «Ver sitio».
  if (estado === 'sin_permiso') {
    return (
      <MarcoSitioWeb href={RUTA_DISENO} subtitulo="" acciones={false}>
        <EmptyState
          variante="forbidden"
          titulo={t('estados.sinPermisoTitulo')}
          descripcion={t('estados.sinPermisoDescripcion')}
          accion={ctx.url ? { etiqueta: t('acciones.verSitio'), href: ctx.url, icono: ExternalLink } : undefined}
        />
      </MarcoSitioWeb>
    );
  }

  return (
    <MarcoSitioWeb
      href={RUTA_DISENO}
      estado={estado}
      esqueleto={<EsqueletoDiseno />}
      subtitulo={subtitulo}
      host={ctx.host}
      sinVerSitio
      // A/06g: en el celular la cabecera es «Diseño» con la sección activa debajo y la flecha de volver.
      movil={{ subtitulo: seccion, volverA: RAIZ_SITIO_WEB }}
      menu={menu}
      accionesSecundarias={
        <button type="button" onClick={() => void abrirVistaPrevia()} disabled={!listo} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
          <Eye aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          {t('acciones.vistaPrevia')}
        </button>
      }
      accionPrimaria={
        <button
          type="button"
          onClick={() => setRevisarAbierto(true)}
          disabled={!listo || !puedePublicar}
          title={motivoPublicar}
          className={clasesBoton({ variante: 'primario', tamano: 'md' })}
        >
          <Send aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          {t('acciones.publicar')}
        </button>
      }
    >
      {listo && estilo.estilo && (
        <div className="flex flex-col gap-4 pb-20 lg:gap-6 lg:pb-0">
          <TabBar
            id={ID_PESTANAS}
            etiqueta={t('pestanas.etiqueta')}
            pestanas={[
              { valor: 'estilo', etiqueta: t('pestanas.estilo'), icono: ICONO_PESTANA_DISENO.estilo },
              { valor: 'encabezado-pie', etiqueta: t('pestanas.encabezadoPie'), icono: ICONO_PESTANA_DISENO['encabezado-pie'] },
              { valor: 'logo', etiqueta: t('pestanas.logo'), icono: ICONO_PESTANA_DISENO.logo },
            ]}
            valor={pestana}
            onValorChange={setPestana}
          />

          {ctx.estadoPublicacion.tipo === 'cambios' && sitio.sitio && !sitio.sitio.v2Adoptado && (
            <AvisoTonal tono="informacion" compacto titulo={t('adopcion.titulo')} descripcion={t('adopcion.descripcion')} />
          )}

          <div role="tabpanel" id={idPanel(ID_PESTANAS, pestana)} aria-labelledby={idPestana(ID_PESTANAS, pestana)}>
            {pestana === 'estilo' && (
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-6">
                <EstiloDelSitioPanel
                  estilo={estilo.estilo}
                  presets={presets}
                  seleccionado={seleccionado}
                  onElegirPreset={estilo.aplicarPreset}
                  onCambiar={estilo.cambiar}
                  giro={ctx.giro}
                  coloresLogo={coloresLogo}
                  extendidos={extendidos}
                  // A/06g: en el celular el panel va sin tarjeta ni título (ya están en la cabecera).
                  cabeceraSoloEscritorio
                  className="max-lg:gap-4 max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent max-lg:p-0"
                />
                <VistaPreviaEnVivo
                  className="hidden lg:sticky lg:top-4 lg:flex"
                  url={vista.url}
                  host={ctx.host}
                  estilo={estilo.estilo}
                  tema={temaVivo}
                  esPublicado={vista.esPublicado}
                />
              </div>
            )}
            {pestana === 'encabezado-pie' && <PestanaEncabezadoPie paginaInicioId={paginaInicioId} />}
            {pestana === 'logo' && <PestanaLogoFavicon sitio={sitio} organizationId={organization?.id} />}
          </div>

          {/* Móvil (A/06g): barra fija con «Vista previa» y «Publicar». */}
          <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-line bg-surface p-4 lg:hidden">
            <button
              type="button"
              onClick={() => setVistaMovil(true)}
              className={clasesBoton({ variante: 'secundario', tamano: 'md', anchoCompleto: true })}
            >
              <Eye aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
              {t('movil.vistaPrevia')}
            </button>
            <button
              type="button"
              onClick={() => setRevisarAbierto(true)}
              disabled={!puedePublicar}
              title={motivoPublicar}
              className={clasesBoton({ variante: 'primario', tamano: 'md', anchoCompleto: true })}
            >
              <Send aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
              {t('movil.publicar')}
            </button>
          </div>
        </div>
      )}

      <PanelAdaptable abierto={vistaMovil} onAbiertoChange={setVistaMovil} titulo={t('vista.celular')} icono={Eye}>
        <VistaPreviaEnVivo
          url={vista.url}
          host={ctx.host}
          estilo={estilo.estilo}
          tema={temaVivo}
          esPublicado={vista.esPublicado}
          dispositivoInicial="celular"
          sinCabecera
          className="border-0 p-0"
        />
      </PanelAdaptable>

      <DialogoRevisarCambios
        abierto={revisarAbierto}
        onAbiertoChange={setRevisarAbierto}
        areas={
          ctx.resumen?.sitio.cambiosSinPublicar.areas.length
            ? ctx.resumen.sitio.cambiosSinPublicar.areas
            : sitio.sitio?.cambiosSinPublicar
              ? [{ tipo: 'tema' as const }]
              : []
        }
        rutaEditor={null}
        puedePublicar={puedePublicar}
        publicando={sitio.publicando}
        onPublicar={() => void publicar()}
      />

      <ConfirmDialog
        abierto={restablecerAbierto}
        onAbiertoChange={setRestablecerAbierto}
        titulo={t('restablecer.titulo')}
        descripcion={t('restablecer.descripcion', { nombre: seleccionado?.nombre ?? '' })}
        textoConfirmar={t('restablecer.confirmar')}
        tono="advertencia"
        icono={RotateCcw}
        onConfirmar={restablecer}
      />

      <DialogoConflicto abierto={sitio.conflicto} onCerrar={() => void sitio.recargar()} onRecargar={() => sitio.recargar()} />
    </MarcoSitioWeb>
  );
}
