'use client';

/**
 * /app/sitio-web/plantillas — «Plantillas» (Figma A/06b galería, A/06c diálogo,
 * A/06d cargando, A/06e error). Galería por giro con contador (la pestaña
 * inicial es el giro de la organización), TemplateCard con «En uso» y el diálogo
 * de vista previa con sus dos modos: «Plantilla completa» (el sitio entero con
 * los datos del negocio; lo anterior queda en el historial, con «Deshacer») y
 * «Solo estilo» (colores y fuentes, conserva el contenido). Sin permiso de
 * edición, la galería se ve y el botón queda deshabilitado con su motivo.
 *
 * Plantillas por SEDE (Figma «16 Sitio web» › «Plantillas por sede»): arriba, «Plantillas para»
 * elige el sitio principal o una sede con sitio (`?sede=<id>`, el enlace que abre el editor desde
 * «⋯ › Aplicar plantilla a esta sede»). Con una sede, la galería abre en la pestaña de SU giro (su
 * `branch_type`), el aviso dice si hereda el estilo del principal o tiene uno propio (con «Volver a
 * heredar»), la tarjeta en uso dice «En uso en <sede>» y el diálogo usa la plantilla EN LA SEDE
 * (`usePlantillasSede`). Sin sedes con sitio no hay selector: todo sigue como antes.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Link2, Palette } from 'lucide-react';
import { AvisoTonal, EmptyState, Skeleton, TabBar, idPanel, idPestana, useOpcionUrl, useParametrosUrl } from '@/components/kit';
import { MarcoSitioWeb } from '../MarcoSitioWeb';
import { RAIZ_SITIO_WEB } from '../rutasSitioWeb';
import { TemplateCard } from '../ui/TemplateCard';
import { DialogoConflicto } from '../paginas/DialogoConflicto';
import type { PlantillaCatalogo } from '@/lib/website/contrato/catalogoPlantillas';
import { validarPlantillaSede, type SedeParaPlantillas } from '@/lib/website/v2/plantillaSede';
import { modoPorDefecto, type ModoPlantilla } from '@/lib/website/v2/plantillaCompleta';
import { MiniaturaPlantilla, useShellDePlantilla } from './MiniaturaPlantilla';
import { DialogoVistaPreviaPlantilla } from './DialogoVistaPreviaPlantilla';
import { useContextoDiseno } from './useContextoDiseno';
import { pestanasGiro, usePlantillas, type PestanaGiro, type ResultadoUsoCompleto } from './usePlantillas';
import { usePlantillasSede } from './usePlantillasSede';
import { SITIO_PRINCIPAL, SelectorSedePlantillas } from './SelectorSedePlantillas';
import type { SedeDialogoPlantilla } from './DialogoVistaPreviaPlantilla';
import { useFuentesSitio } from './useFuentesSitio';
import { ICONO_GIRO_PLANTILLA, ICONO_SUBTITULO_SITIO } from '../ui/iconosSitio';
import { SubtituloConIcono } from '../ui/SubtituloConIcono';
import { useTextosDiseno, type TraductorDiseno } from './textos';

export const RUTA_PLANTILLAS = `${RAIZ_SITIO_WEB}/plantillas`;
const ID_PESTANAS = 'plantillas-giro';

/** A/06d: ocho tarjetas en esqueleto, en la misma grilla. */
function EsqueletoPlantillas() {
  return (
    <div className="flex flex-col gap-4 lg:gap-6" aria-busy="true">
      <Skeleton className="h-9 w-full max-w-xl rounded-lg" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3">
            <Skeleton className="aspect-[16/10] w-full rounded-lg" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-5 w-1/2 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Tarjeta de la galería: miniatura con SU encabezado y SU pie, y la línea con lo distintivo
 * («Logo al centro · Pie centrado con WhatsApp»), de `shellPorPlantilla.ts`.
 */
function TarjetaPlantilla({
  plantilla: p,
  enUso,
  etiquetaEnUso,
  onAbrir,
}: {
  plantilla: PlantillaCatalogo;
  enUso: boolean;
  etiquetaEnUso?: string;
  onAbrir: () => void;
}) {
  const t = useTextosDiseno();
  const shell = useShellDePlantilla(p);
  return (
    <TemplateCard
      nombre={p.nombre}
      descripcion={p.descripcion}
      detalle={shell.linea}
      miniatura={<MiniaturaPlantilla shell={shell} />}
      giro={t(`plantillas.giro.${p.giro}`)}
      iconoGiro={ICONO_GIRO_PLANTILLA[p.giro]}
      secciones={p.inicio.length}
      enUso={enUso}
      etiquetaEnUso={etiquetaEnUso}
      onSeleccionar={onAbrir}
      // A/06b: la plantilla en uso lleva el borde de marca además de la insignia.
      className={enUso ? 'h-full border-brand ring-1 ring-brand' : 'h-full'}
    />
  );
}

/**
 * Por qué una plantilla no se puede usar COMPLETA en la sede (la misma regla del servidor,
 * `validarPlantillaSede`); `null` si se puede.
 */
export function motivoSinCompletaEnSede(t: TraductorDiseno, plantilla: PlantillaCatalogo, sede: SedeParaPlantillas): string | null {
  const v = validarPlantillaSede(plantilla.id, sede.tipo, 'completa');
  if (v.ok) return null;
  if (v.motivo === 'plantilla_otro_giro' && sede.giro) {
    return t('dialogo.sede.otroGiro', { sede: sede.nombre, giro: t(`plantillas.giro.${sede.giro}`) });
  }
  return t('dialogo.sede.sinTipo', { sede: sede.nombre });
}

export function GaleriaPlantillas() {
  const t = useTextosDiseno();
  const router = useRouter();
  const ctx = useContextoDiseno({ leerBorradorSinPermiso: true });
  const plantillas = usePlantillas(ctx);
  const { leer, fijar } = useParametrosUrl();
  const parametroSede = leer('sede');
  const branchId = parametroSede && /^[1-9]\d{0,9}$/.test(parametroSede) ? Number(parametroSede) : null;
  const ps = usePlantillasSede(branchId, ctx.estado === 'listo');
  const sede = ps.sede;
  const pestanas = pestanasGiro(ctx.giro, sede?.giro ?? null);
  const giroInicial = sede?.giro ?? ctx.giro ?? 'todas';
  const [giro, setGiro] = useOpcionUrl<PestanaGiro>('giro', pestanas, giroInicial, 'replace');
  const [abierta, setAbierta] = useState<PlantillaCatalogo | null>(null);
  const [modo, setModo] = useState<ModoPlantilla>('completa');
  const sinCompleta = (p: PlantillaCatalogo) => (sede ? motivoSinCompletaEnSede(t, p, sede) : null);
  const abrir = (p: PlantillaCatalogo) => {
    setModo(sinCompleta(p) ? 'estilo' : modoPorDefecto(sede ? ps.sitio.sitio : ctx.sitio.sitio));
    setAbierta(p);
  };
  // Al cambiar de sitio, la galería vuelve a la pestaña de su giro (sin `giro` en la URL).
  const elegirSitio = (valor: string) => fijar({ sede: valor === SITIO_PRINCIPAL ? null : valor, giro: null }, 'replace');
  const lista = plantillas.delGiro(giro);
  useFuentesSitio(lista.map((p) => p.estilo.fuenteTitulos));

  const errorSitio = ctx.sitio.error && !ctx.sitio.error.esConflicto ? ctx.sitio.error.message : null;
  useEffect(() => {
    if (errorSitio && ctx.sitio.borrador) toast.error(t('dialogo.error', { mensaje: errorSitio }));
  }, [errorSitio, ctx.sitio.borrador, t]);

  const verDiseno = { label: t('dialogo.verDiseno'), onClick: () => router.push(`${RAIZ_SITIO_WEB}/diseno`) };

  /** Toast de «Plantilla completa» con «Deshacer» (sitio principal o sede). */
  const avisarCompleta = (
    plantilla: PlantillaCatalogo,
    r: Extract<ResultadoUsoCompleto, { ok: true }>,
    deshacer: (x: { sitioId: string; instantaneaId: string; version: number }) => Promise<boolean>,
    titulo: string,
  ) => {
    const ocultas = r.resumen.ocultas.length;
    toast.success(titulo, {
      description: ocultas === 0 ? undefined : ocultas === 1 ? t('dialogo.ocultasUna') : t('dialogo.ocultas', { n: ocultas }),
      duration: 10000,
      action: {
        label: t('dialogo.deshacer'),
        onClick: () =>
          void deshacer({ sitioId: r.sitioId, instantaneaId: r.instantaneaId, version: r.version }).then((ok) =>
            ok ? toast.success(t('dialogo.deshecho')) : toast.error(t('dialogo.noDeshecho')),
          ),
      },
    });
  };

  const usarEnSede = async (plantilla: PlantillaCatalogo, m: ModoPlantilla) => {
    if (!sede) return;
    const r = await ps.usar(plantilla, m);
    if (!r.ok) {
      toast.error(r.conflicto ? t('dialogo.conflicto') : t('dialogo.error', { mensaje: r.mensaje }));
      return;
    }
    setAbierta(null);
    const titulo = t('dialogo.sede.listo', { nombre: plantilla.nombre, sede: sede.nombre });
    if (r.resumen && r.instantaneaId) avisarCompleta(plantilla, { ...r, resumen: r.resumen, instantaneaId: r.instantaneaId }, ps.deshacer, titulo);
    else toast.success(titulo, { description: t('dialogo.sede.enBorrador') });
  };

  const heredar = async () => {
    if (!sede) return;
    const r = await ps.heredar();
    if (r.ok) toast.success(t('plantillas.sede.heredado', { sede: sede.nombre }));
    else toast.error(t('plantillas.sede.noHeredado', { mensaje: r.mensaje }));
  };

  const usarEstilo = async (plantilla: PlantillaCatalogo) => {
    const r = await plantillas.usar(plantilla);
    if (!r.ok) return;
    setAbierta(null);
    toast.success(t('dialogo.listo', { nombre: plantilla.nombre }), { action: verDiseno });
  };

  const usarCompleta = async (plantilla: PlantillaCatalogo) => {
    const r = await plantillas.usarCompleta(plantilla);
    if (!r.ok) {
      toast.error(r.conflicto ? t('dialogo.conflicto') : t('dialogo.error', { mensaje: r.mensaje }));
      return;
    }
    setAbierta(null);
    avisarCompleta(plantilla, r, plantillas.deshacer, t('dialogo.listoCompleta', { nombre: plantilla.nombre }));
  };

  const usar = (plantilla: PlantillaCatalogo, m: ModoPlantilla) =>
    void (sede ? usarEnSede(plantilla, m) : m === 'completa' ? usarCompleta(plantilla) : usarEstilo(plantilla));
  const enUso = sede ? ps.enUso : plantillas.enUso;
  const etiquetaEnUso = sede ? t('plantillas.sede.enUso', { sede: sede.nombre }) : undefined;
  const sedeDialogo: SedeDialogoPlantilla | null =
    sede && abierta
      ? {
          nombre: sede.nombre,
          estiloPropio: ps.estiloPropio,
          motivoSinCompleta: sinCompleta(abierta),
          onHeredar: () => void heredar(),
          heredando: ps.heredando,
        }
      : null;

  // A/06e: el error de esta página tiene su propio texto («Tu sitio no cambió…»).
  if (ctx.estado === 'error') {
    return (
      <MarcoSitioWeb href={RUTA_PLANTILLAS} subtitulo="" acciones={false}>
        <EmptyState
          variante="error"
          titulo={t('plantillas.errorTitulo')}
          descripcion={t('plantillas.errorDescripcion')}
          onReintentar={ctx.reintentar}
        />
      </MarcoSitioWeb>
    );
  }

  return (
    <MarcoSitioWeb
      href={RUTA_PLANTILLAS}
      estado={ctx.estado}
      onReintentar={ctx.reintentar}
      nombreContenido={t('plantillas.nombreContenido')}
      esqueleto={<EsqueletoPlantillas />}
      // A/06b: el subtítulo lleva su icono de 14 px, como el de Diseño lleva el del estado.
      subtitulo={<SubtituloConIcono icono={ICONO_SUBTITULO_SITIO.plantillas} texto={t('plantillas.subtitulo')} />}
      host={ctx.host}
      acciones={false}
    >
      {ctx.estado === 'listo' && (
        <div className="flex flex-col gap-4 lg:gap-6">
          {ps.sedes.length > 0 && (
            <SelectorSedePlantillas sedes={ps.sedes} valor={sede ? String(sede.branchId) : SITIO_PRINCIPAL} onValorChange={elegirSitio} />
          )}
          {sede && (
            <AvisoTonal
              tono={ps.estiloPropio ? 'neutro' : 'informacion'}
              icono={ps.estiloPropio ? Palette : Link2}
              rol="status"
              titulo={ps.estiloPropio ? t('plantillas.sede.propioTitulo', { sede: sede.nombre }) : t('plantillas.sede.heredaTitulo', { sede: sede.nombre })}
              descripcion={ps.estiloPropio ? t('plantillas.sede.propioDescripcion') : t('plantillas.sede.heredaDescripcion', { sede: sede.nombre })}
              accion={
                ps.estiloPropio && ctx.permisos.editar
                  ? { etiqueta: t('plantillas.sede.heredar'), onClick: () => void heredar(), cargando: ps.heredando }
                  : undefined
              }
            />
          )}
          <TabBar
            id={ID_PESTANAS}
            etiqueta={t('plantillas.pestanas')}
            pestanas={pestanas.map((g) => ({
              valor: g,
              etiqueta: t(`plantillas.giro.${g}`),
              contador: plantillas.contadores[g],
              icono: ICONO_GIRO_PLANTILLA[g],
            }))}
            valor={giro}
            onValorChange={setGiro}
          />
          <div role="tabpanel" id={idPanel(ID_PESTANAS, giro)} aria-labelledby={idPestana(ID_PESTANAS, giro)}>
            {lista.length === 0 ? (
              <EmptyState
                variante="empty"
                titulo={t('plantillas.vacio')}
                accion={{ etiqueta: t('plantillas.verTodas'), onClick: () => setGiro('todas') }}
              />
            ) : (
              <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
                {lista.map((p) => (
                  <li key={p.id} className="flex">
                    <TarjetaPlantilla plantilla={p} enUso={enUso?.id === p.id} etiquetaEnUso={etiquetaEnUso} onAbrir={() => abrir(p)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <DialogoVistaPreviaPlantilla
        plantilla={abierta}
        onCerrar={() => setAbierta(null)}
        documento={sede ? ps.documento : ctx.sitio.documento}
        puedeUsar={ctx.permisos.editar}
        usando={(sede ? ps.usando : plantillas.usando) !== null}
        modo={modo}
        onModoChange={setModo}
        onUsar={usar}
        sede={sedeDialogo}
      />
      <DialogoConflicto abierto={ctx.sitio.conflicto} onCerrar={() => void ctx.sitio.recargar()} onRecargar={() => ctx.sitio.recargar()} />
    </MarcoSitioWeb>
  );
}
