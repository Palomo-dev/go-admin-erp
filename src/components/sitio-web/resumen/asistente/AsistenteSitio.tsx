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
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { AvisoTonal, Dialogo, EmptyState, Skeleton } from '@/components/kit';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { clienteSitiosV2 } from '@/lib/website/v2/clienteSitiosV2';
import {
  aplicarAcento,
  aplicarDatosNegocio,
  aplicarEstilo,
  aplicarPlantilla,
  enlaceWhatsapp,
  whatsappLegible,
} from '@/lib/website/v2/temaDesdePreset';
import { valorCampo } from '@/lib/website/v2/valorCampo';
import {
  objetivosPorDefecto,
  pasoDesdeParametro,
  TOTAL_PASOS_ASISTENTE,
  type GiroSitio,
  type ObjetivoSitio,
  type OnboardingSitio,
} from '@/lib/website/onboardingSitio';
import { useSitioV2 } from '../../useSitioV2';
import { RAIZ_SITIO_WEB } from '../../rutasSitioWeb';
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
import { plantillaPorId, type PlantillaAsistente } from './catalogoAsistente';

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
  const [plantilla, setPlantilla] = useState<PlantillaAsistente | null>(null);
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
    const p = plantillaPorId(plantillaUrl) ?? plantillaPorId(o.pasos?.plantilla) ?? plantillaPorId(valorCampo(doc?.tema.plantillaBase));
    setPlantilla(p);
    const e = plantillaPorId(o.pasos?.estilo);
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

  const guardarPaso = async (): Promise<boolean | 'invalido'> => {
    switch (paso) {
      case 1:
        return ob.guardar({ giro, objetivos, pasoActual: 2 });
      case 2: {
        if (!plantilla) return false;
        if (!(await sitio.guardar((d) => aplicarPlantilla(d, plantilla.preset)))) return false;
        return ob.guardar({ pasos: { plantilla: plantilla.id }, pasoActual: 3 });
      }
      case 3: {
        const e = estilo ?? (plantilla ? { preset: plantilla, acentoLogo: null } : null);
        if (!e) return ob.guardar({ pasoActual: 4 });
        const ok = await sitio.guardar((d) => {
          const conEstilo = aplicarEstilo(d, e.preset.preset);
          return e.acentoLogo ? aplicarAcento(conEstilo, e.acentoLogo) : conEstilo;
        });
        if (!ok) return false;
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
      const r = await sitio.publicar(null);
      if (!r) {
        if (!sitio.conflicto) toast.error(t('asistente.publicar.noSePudo', { mensaje: sitio.error?.message ?? '' }).trim());
        return;
      }
      await ob.guardar({ completado: true, pasoActual: TOTAL_PASOS_ASISTENTE });
      toast.success(t('asistente.publicar.enLinea'));
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
    contenido = <PasoPlantilla giro={giro} seleccionada={plantilla?.id ?? null} onSeleccionar={setPlantilla} />;
  } else if (paso === 3) {
    contenido = <PasoEstilo giro={giro} elegido={estilo} onElegir={setEstilo} logoUrl={datos.logoUrl} onVistaPrevia={() => setVistaMovilAbierta(true)} />;
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
    </>
  );
}
