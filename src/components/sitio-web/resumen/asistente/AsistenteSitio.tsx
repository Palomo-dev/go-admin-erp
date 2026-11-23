'use client';

/**
 * Asistente de creación del sitio (/app/sitio-web/primera-configuracion, Figma
 * A/03a-03j): seis pasos —giro y objetivo, plantilla, estilo, datos del
 * negocio, dominio, y revisar y publicar— a pantalla completa, con «Guardar y
 * salir» siempre visible y el avance guardado en cada paso
 * (`website_site_states.onboarding`).
 *
 * Nada se escribe dos veces: logo, nombre, horario y dirección salen de
 * Organización y de la sede principal; lo que se cambia aquí va SOLO al
 * borrador V2 del sitio (`useSitioV2`, compare-and-swap por versión). Publicar
 * usa el mismo punto único que el Resumen, Diseño y el editor.
 *
 * Desde el 2026-11-22 (Figma «Asistente / Paso 2 — todas a la vista», aprobado):
 * - El paso 2 ofrece las plantillas reales del catálogo de Diseño y, al seguir, arma el sitio
 *   con la elegida: la misma «Plantilla completa» de Diseño (`apiPaginas.plantillaCompleta`; lo
 *   anterior queda en el historial). Con el sitio ya publicado, solo colores y fuentes («Solo
 *   estilo», `modoPorDefecto`), igual que Diseño. Si la plantilla ya está en el borrador, no se
 *   vuelve a armar: volver al paso 2 y seguir no pisa lo editado.
 * - Nada obliga a terminar: «Saltar configuración» (confirmación con «Ir al editor» y «Saltar e
 *   ir al resumen»), «Omitir este paso» en los pasos opcionales y el Stepper lleva a los pasos ya
 *   hechos. Saltar guarda dónde iba; el sitio queda en borrador y no se publica.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { AvisoTonal, Dialogo, EmptyState, Skeleton } from '@/components/kit';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { clienteSitiosV2 } from '@/lib/website/v2/clienteSitiosV2';
import {
  aplicarAcento,
  aplicarDatosNegocio,
  aplicarEstilo,
  enlaceWhatsapp,
  whatsappLegible,
} from '@/lib/website/v2/temaDesdePreset';
import { valorCampo } from '@/lib/website/v2/valorCampo';
import { aplicarEstiloPlantilla } from '@/lib/website/v2/usarPlantilla';
import { tokensExtendidosDisponibles } from '@/lib/website/v2/tokensEstilo';
import { modoPorDefecto } from '@/lib/website/v2/plantillaCompleta';
import { plantillaEnUso } from '@/lib/website/contrato/catalogoPlantillas';
import {
  objetivosPorDefecto,
  pasoDesdeParametro,
  TOTAL_PASOS_ASISTENTE,
  type GiroSitio,
  type ObjetivoSitio,
  type OnboardingSitio,
} from '@/lib/website/onboardingSitio';
import { activarAlPublicarSitio } from '@/lib/website/v2/activarAlPublicar';
import { useSitioV2 } from '../../useSitioV2';
import { RAIZ_SITIO_WEB, rutaEditorSitio } from '../../rutasSitioWeb';
import { apiPaginas, ErrorApiPaginas } from '../../paginas/apiPaginas';
import { CATALOGO_SITIO } from '../../diseno/catalogo';
import { esInicio } from '../../paginas/tipoPagina';
import { useTextosResumen } from '../textos';
import { MarcoAsistente } from './MarcoAsistente';
import { useOnboardingSitio } from './useOnboardingSitio';
import { PasoGiro } from './PasoGiro';
import { PasoPlantilla } from './PasoPlantilla';
import { PasoEstilo, type EstiloElegido } from './PasoEstilo';
import { PasoDatosNegocio, type DatosNegocioForm } from './PasoDatosNegocio';
import { PasoDominio } from './PasoDominio';
import { PasoRevisarPublicar } from './PasoRevisarPublicar';
import { VistaPreviaAsistente } from './VistaPreviaAsistente';
import {
  estilosConPlantilla,
  plantillaCatalogoPorId,
  plantillaPorId,
  type PlantillaAsistente,
  type PlantillaCatalogoAsistente,
} from './catalogoAsistente';

/** Pasos que se pueden omitir: el giro hace falta para sugerir y revisar es el final. */
export const PASOS_OMITIBLES: readonly number[] = [2, 3, 4, 5];

/** La plantilla que ya está en el borrador (la que dejó Diseño o este asistente), por su id. */
export function plantillaDelBorrador(tema: { preset?: string | null; plantillaBase?: string | null; fuenteTitulos?: string | null }): PlantillaCatalogoAsistente | null {
  const enUso = plantillaEnUso(CATALOGO_SITIO, tema);
  return enUso ? plantillaCatalogoPorId(enUso.id) : null;
}

/** Ajustes que el sitio aplica en vivo en la vista previa (`goadmin:settings`, columnas legacy). */
export function ajustesEnVivo(estilo: EstiloElegido | null, plantilla: PlantillaAsistente | null, logoUrl: string | null): Record<string, unknown> | undefined {
  const base = estilo?.preset ?? plantilla;
  if (!base && !logoUrl) return undefined;
  return {
    ...(base
      ? {
          primary_color: estilo?.acentoLogo ?? base.preset.primario,
          secondary_color: base.preset.secundario,
          theme_mode: base.preset.modo,
        }
      : {}),
    ...(logoUrl ? { logo_url: logoUrl } : {}),
  };
}

function Estado({ variante, onReintentar }: { variante: 'error' | 'forbidden'; onReintentar?: () => void }) {
  const t = useTextosResumen();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas p-4">
      <EmptyState
        variante={variante}
        titulo={variante === 'error' ? t('asistente.errorTitulo') : t('asistente.sinPermisoTitulo')}
        descripcion={variante === 'error' ? t('asistente.errorDescripcion') : t('asistente.sinPermisoDescripcion')}
        onReintentar={onReintentar}
        // Con «Reintentar» (error), volver al Resumen queda como secundaria.
        {...(onReintentar
          ? { accionSecundaria: { etiqueta: t('asistente.volverResumen'), href: RAIZ_SITIO_WEB } }
          : { accion: { etiqueta: t('asistente.volverResumen'), href: RAIZ_SITIO_WEB } })}
      />
    </div>
  );
}

export function AsistenteSitio() {
  const t = useTextosResumen();
  const router = useRouter();
  const parametros = useSearchParams();
  const { organization } = useOrganization();
  const paso = pasoDesdeParametro(parametros?.get('paso'));
  const plantillaUrl = parametros?.get('plantilla') ?? null;

  const ob = useOnboardingSitio();
  const sinPermiso = ob.fallo === 'sin_permiso';
  const sitio = useSitioV2({ crearSiFalta: true, deshabilitado: ob.cargando || !!ob.fallo });
  const contexto = ob.contexto;

  const [inicializado, setInicializado] = useState(false);
  const [giro, setGiro] = useState<GiroSitio>('otro');
  const [objetivos, setObjetivos] = useState<ObjetivoSitio[]>([]);
  const [plantilla, setPlantilla] = useState<PlantillaCatalogoAsistente | null>(null);
  const [saltarAbierto, setSaltarAbierto] = useState(false);
  // Plantilla ya armada en esta visita: volver al paso 2 y seguir con la misma no la rearma.
  const armada = useRef<string | null>(null);
  const [estilo, setEstilo] = useState<EstiloElegido | null>(null);
  const [datos, setDatos] = useState<DatosNegocioForm>({ nombre: '', whatsapp: '', logoUrl: null });
  const [errores, setErrores] = useState<{ nombre?: string | null; whatsapp?: string | null }>({});
  const [vistaUrl, setVistaUrl] = useState<string | null>(null);
  const [vistaMovilAbierta, setVistaMovilAbierta] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  // Estado inicial: lo guardado en el asistente, luego el borrador, luego el ERP.
  useEffect(() => {
    if (inicializado || !contexto || sitio.cargando) return;
    const o: OnboardingSitio = ob.onboarding;
    const doc = sitio.documento;
    const g = o.giro ?? contexto.organizacion.giro;
    setGiro(g);
    setObjetivos(o.objetivos ? [...o.objetivos] : objetivosPorDefecto(g));
    const enBorrador = doc
      ? plantillaDelBorrador({
          preset: valorCampo(doc.tema.preset),
          plantillaBase: valorCampo(doc.tema.plantillaBase),
          fuenteTitulos: valorCampo(doc.tema.tipografia.titulos),
        })
      : null;
    const p = plantillaCatalogoPorId(plantillaUrl) ?? plantillaCatalogoPorId(o.pasos?.plantilla) ?? enBorrador;
    setPlantilla(p);
    // Lo que el asistente ya dejó en el borrador no se vuelve a armar.
    if (p && o.pasos?.plantilla && enBorrador?.id === p.id) armada.current = p.id;
    const e = plantillaPorId(o.pasos?.estilo) ?? (p && o.pasos?.estilo === p.id ? p : null);
    if (e) setEstilo({ preset: e, acentoLogo: null });
    const redes = valorCampo(doc?.contenido.redesSociales);
    setDatos({
      nombre: valorCampo(doc?.identidad.nombre) ?? contexto.organizacion.nombre,
      logoUrl: valorCampo(doc?.identidad.logoUrl) ?? contexto.organizacion.logoUrl,
      whatsapp: whatsappLegible(redes?.whatsapp ?? contexto.whatsapp),
    });
    setInicializado(true);
  }, [inicializado, contexto, sitio.cargando, sitio.documento, ob.onboarding, plantillaUrl]);

  // Enlace privado de la vista previa del borrador; sin él, el sitio publicado.
  const sitioId = sitio.sitio?.id ?? null;
  const urlSitio = contexto?.direccion.url ?? null;
  useEffect(() => {
    if (!sitioId || !urlSitio) {
      setVistaUrl(urlSitio);
      return;
    }
    let vigente = true;
    clienteSitiosV2
      .vistaPrevia(sitioId, null)
      .then(({ token }) => vigente && setVistaUrl(`${urlSitio.replace(/\/$/, '')}/vista-previa/${token}`))
      .catch(() => vigente && setVistaUrl(urlSitio));
    return () => {
      vigente = false;
    };
  }, [sitioId, urlSitio]);

  // Al entrar al paso 3 sin estilo, se parte del de la plantilla elegida.
  useEffect(() => {
    if (paso === 3 && !estilo && plantilla) setEstilo({ preset: plantilla, acentoLogo: null });
  }, [paso, estilo, plantilla]);

  // Conflicto 409: otra persona guardó. Se recarga y se avisa; nunca se pisa su trabajo.
  useEffect(() => {
    if (!sitio.conflicto) return;
    toast.error(t('asistente.conflicto'));
    void sitio.recargar();
  }, [sitio.conflicto, sitio, t]);

  const irA = useCallback((n: number) => router.replace(`${RAIZ_SITIO_WEB}/primera-configuracion?paso=${n}`), [router]);

  const fallar = (mensaje?: string | null) => toast.error(t('asistente.errorGuardar', { mensaje: mensaje ?? '' }).trim());

  // Con una revisión publicada el sitio ya es del dueño: de la plantilla, solo colores y fuentes.
  const soloEstilo = modoPorDefecto(sitio.sitio) === 'estilo';
  const extendidos = tokensExtendidosDisponibles();

  /**
   * Paso 2: arma el sitio con la plantilla (la «Plantilla completa» de Diseño) o solo su estilo.
   * `'invalido'` = ya se avisó (conflicto o error del servidor): no se repite el aviso genérico.
   */
  const usarPlantilla = async (p: PlantillaCatalogoAsistente): Promise<boolean | 'invalido'> => {
    if (armada.current === p.id) return true;
    if (soloEstilo) {
      if (!(await sitio.guardar((d) => aplicarEstiloPlantilla(d, p.catalogo, extendidos)))) return false;
      armada.current = p.id;
      return true;
    }
    const actual = await sitio.asegurar();
    if (!actual) return false;
    try {
      await apiPaginas.plantillaCompleta({ branchId: actual.branchId, version: sitio.borrador?.version ?? actual.versionBorrador }, p.id);
      await sitio.recargar();
      armada.current = p.id;
      return true;
    } catch (error) {
      if (error instanceof ErrorApiPaginas && error.esConflicto) {
        toast.error(t('asistente.conflicto'));
        await sitio.recargar();
        return 'invalido';
      }
      fallar(error instanceof Error ? error.message : null);
      return 'invalido';
    }
  };

  const guardarPaso = async (): Promise<boolean | 'invalido'> => {
    switch (paso) {
      case 1:
        return ob.guardar({ giro, objetivos, pasoActual: 2 });
      case 2: {
        if (!plantilla) return false;
        const ok = await usarPlantilla(plantilla);
        if (ok !== true) return ok;
        return ob.guardar({ pasos: { plantilla: plantilla.id }, pasoActual: 3 });
      }
      case 3: {
        const e = estilo ?? (plantilla ? { preset: plantilla, acentoLogo: null } : null);
        if (!e) return ob.guardar({ pasoActual: 4 });
        // El estilo de la plantilla ya lo escribió el paso 2 (con sus tokens): no se reescribe.
        const delaPlantilla = !!plantilla && e.preset.id === plantilla.id;
        if (!delaPlantilla || e.acentoLogo) {
          const ok = await sitio.guardar((d) => {
            const conEstilo = delaPlantilla ? d : aplicarEstilo(d, e.preset.preset);
            return e.acentoLogo ? aplicarAcento(conEstilo, e.acentoLogo) : conEstilo;
          });
          if (!ok) return false;
        }
        return ob.guardar({ pasos: { estilo: e.acentoLogo ? 'logo' : e.preset.id }, pasoActual: 4 });
      }
      case 4: {
        const whatsapp = enlaceWhatsapp(datos.whatsapp);
        const nuevos = {
          nombre: datos.nombre.trim() ? null : t('asistente.datos.nombreObligatorio'),
          whatsapp: whatsapp === null ? t('asistente.datos.whatsappInvalido') : null,
        };
        setErrores(nuevos);
        if (nuevos.nombre || nuevos.whatsapp) return 'invalido';
        const ok = await sitio.guardar((d) => aplicarDatosNegocio(d, { nombre: datos.nombre, logoUrl: datos.logoUrl, whatsapp: whatsapp || null }));
        if (!ok) return false;
        return ob.guardar({ pasos: { datos: true }, pasoActual: 5 });
      }
      case 5:
        return ob.guardar({ pasos: { dominio: contexto?.direccion.hostEsPropio ? 'conectar' : 'gratis' }, pasoActual: 6 });
      default:
        return true;
    }
  };

  const siguiente = async () => {
    setTrabajando(true);
    try {
      const ok = await guardarPaso();
      if (ok === 'invalido') return;
      if (!ok) {
        fallar(sitio.error?.message ?? ob.errorGuardar);
        return;
      }
      irA(Math.min(paso + 1, TOTAL_PASOS_ASISTENTE));
    } finally {
      setTrabajando(false);
    }
  };

  const guardarYSalir = async () => {
    await ob.guardar({ pasoActual: paso });
    router.push(RAIZ_SITIO_WEB);
  };

  /** «Omitir este paso»: sin validar ni escribir nada del paso; solo se recuerda el avance. */
  const omitirPaso = async () => {
    const destino = Math.min(paso + 1, TOTAL_PASOS_ASISTENTE);
    setTrabajando(true);
    try {
      await ob.guardar({ pasoActual: destino });
    } finally {
      setTrabajando(false);
    }
    irA(destino);
  };

  // Editor de Inicio para «Ir al editor»; sin página aún, Diseño (que arma lo que falte).
  const paginaInicioId = sitio.documento?.paginas.find(esInicio)?.id ?? null;
  const rutaEditor = paginaInicioId ? rutaEditorSitio(paginaInicioId) : `${RAIZ_SITIO_WEB}/diseno`;

  /** «Saltar configuración»: guarda dónde iba y sale; el sitio queda en borrador, sin publicar. */
  const saltar = async (destino: 'resumen' | 'editor') => {
    setSaltarAbierto(false);
    await ob.guardar({ pasoActual: paso });
    router.push(destino === 'editor' ? rutaEditor : RAIZ_SITIO_WEB);
  };

  const guardarBorrador = async () => {
    setTrabajando(true);
    const ok = await ob.guardar({ completado: false, pasoActual: TOTAL_PASOS_ASISTENTE });
    setTrabajando(false);
    if (ok) router.push(RAIZ_SITIO_WEB);
    else fallar(ob.errorGuardar);
  };

  const publicar = async () => {
    setTrabajando(true);
    try {
      const r = await sitio.publicar(null, { activar: activarAlPublicarSitio(!!sitio.sitio?.v2Adoptado) });
      if (!r) {
        if (!sitio.conflicto) toast.error(t('asistente.publicar.noSePudo', { mensaje: sitio.error?.message ?? '' }).trim());
        return;
      }
      await ob.guardar({ completado: true, pasoActual: TOTAL_PASOS_ASISTENTE });
      if (r.activacion === 'fallo') toast.warning(t('asistente.publicar.activarFallo'));
      else toast.success(t('asistente.publicar.enLinea'));
      router.push(RAIZ_SITIO_WEB);
    } finally {
      setTrabajando(false);
    }
  };

  const ajustes = useMemo(() => ajustesEnVivo(estilo, plantilla, datos.logoUrl), [estilo, plantilla, datos.logoUrl]);
  const claveRecarga = sitio.borrador?.version ?? 0;

  if (sinPermiso) return <Estado variante="forbidden" />;
  if (ob.fallo === 'error' || (sitio.error && !sitio.borrador && !sitio.cargando)) {
    return (
      <Estado
        variante="error"
        onReintentar={() => {
          void ob.recargar();
          void sitio.recargar();
        }}
      />
    );
  }

  const cargando = !inicializado || !contexto;
  const vista = (conSelector?: boolean) => (
    <VistaPreviaAsistente url={vistaUrl} host={contexto?.direccion.host ?? null} ajustes={ajustes} claveRecarga={claveRecarga} conSelector={conSelector} />
  );
  const puedePublicar = !!contexto?.permisos.publicar;

  let contenido: React.ReactNode;
  if (cargando) {
    contenido = (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
          ))}
        </div>
      </div>
    );
  } else if (paso === 1) {
    contenido = (
      <PasoGiro
        giro={giro}
        objetivos={objetivos}
        onGiro={(g) => {
          setGiro(g);
          setObjetivos(objetivosPorDefecto(g));
        }}
        onObjetivos={setObjetivos}
      />
    );
  } else if (paso === 2) {
    contenido = <PasoPlantilla giro={giro} seleccionada={plantilla?.id ?? null} onSeleccionar={setPlantilla} soloEstilo={soloEstilo} />;
  } else if (paso === 3) {
    contenido = (
      <PasoEstilo
        giro={giro}
        elegido={estilo}
        onElegir={setEstilo}
        logoUrl={datos.logoUrl}
        onVistaPrevia={() => setVistaMovilAbierta(true)}
        catalogo={estilosConPlantilla(plantilla, giro)}
      />
    );
  } else if (paso === 4) {
    contenido = (
      <PasoDatosNegocio
        organizationId={organization?.id ?? 0}
        datos={datos}
        onCambiar={setDatos}
        errores={errores}
        sede={contexto.sede}
      />
    );
  } else if (paso === 5) {
    contenido = <PasoDominio subdominio={contexto.organizacion.subdominio} direccion={contexto.direccion} />;
  } else {
    contenido = (
      <>
        <PasoRevisarPublicar
          giro={[t(`asistente.giro.giros.${giro}`), objetivos.map((o) => t(`asistente.giro.objetivos.${o}`).toLowerCase()).join(', ')].filter(Boolean).join(' · ')}
          plantilla={plantilla?.nombre ?? null}
          estilo={estilo ? [estilo.preset.nombre, estilo.preset.fuentes, estilo.acentoLogo ? t('asistente.estilo.estiloDelLogo').toLowerCase() : null].filter(Boolean).join(' · ') : null}
          documento={sitio.documento}
          host={contexto.direccion.host}
          pasarela={contexto.pasarela}
        />
        {!puedePublicar && <AvisoTonal tono="informacion" titulo={t('resumen.sinPermisoPublicar')} />}
      </>
    );
  }

  const ultimo = paso === TOTAL_PASOS_ASISTENTE;
  return (
    <>
      <MarcoAsistente
        paso={paso}
        onGuardarSalir={() => void guardarYSalir()}
        onAtras={paso > 1 ? () => irA(paso - 1) : undefined}
        onSaltar={cargando ? undefined : () => setSaltarAbierto(true)}
        onIrAPaso={cargando || trabajando ? undefined : irA}
        omitir={
          !cargando && PASOS_OMITIBLES.includes(paso)
            ? { etiqueta: t('asistente.omitir'), etiquetaCorta: t('asistente.omitirCorto'), onClick: () => void omitirPaso(), deshabilitado: trabajando }
            : undefined
        }
        guardando={sitio.guardando || ob.guardando}
        primario={
          ultimo
            ? { etiqueta: trabajando ? t('asistente.publicar.publicando') : t('asistente.publicar.publicarSitio'), onClick: () => void publicar(), cargando: trabajando, deshabilitado: cargando || !puedePublicar }
            : { etiqueta: t('asistente.siguiente'), onClick: () => void siguiente(), cargando: trabajando, deshabilitado: cargando || (paso === 2 && !plantilla) }
        }
        secundario={ultimo ? { etiqueta: t('asistente.publicar.guardarBorrador'), onClick: () => void guardarBorrador(), deshabilitado: trabajando } : undefined}
        vistaPrevia={paso === 2 ? undefined : vista(ultimo)}
      >
        {contenido}
      </MarcoAsistente>
      <Dialogo
        abierto={vistaMovilAbierta}
        onAbiertoChange={setVistaMovilAbierta}
        titulo={t('asistente.vistaPreviaBoton')}
        textoCancelar={t('resumen.qr.cerrar')}
        primario={{ etiqueta: t('resumen.qr.cerrar'), onClick: () => setVistaMovilAbierta(false) }}
      >
        {vista(false)}
      </Dialogo>
      <Dialogo
        abierto={saltarAbierto}
        onAbiertoChange={setSaltarAbierto}
        titulo={t('asistente.saltar.titulo')}
        descripcion={t('asistente.saltar.descripcion')}
        ancho={560}
        textoCancelar={t('asistente.saltar.seguir')}
        secundarios={[{ etiqueta: t('asistente.saltar.irEditor'), onClick: () => void saltar('editor') }]}
        primario={{ etiqueta: t('asistente.saltar.irResumen'), onClick: () => void saltar('resumen') }}
      />
    </>
  );
}
