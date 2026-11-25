'use client';

/**
 * Entregar (Figma 2802:10233).
 *
 * 1. Prueba de entrega: en contraentrega, el CÓDIGO de 4 dígitos que el domiciliario le pide al
 *    cliente (la pantalla nunca lo conoce) y una foto opcional; sin contraentrega, foto o firma.
 *    Quién recibió y su relación.
 * 2. Cobrar contraentrega: efectivo (con «Exacto» y billetes rápidos, y el cambio a devolver),
 *    datáfono (número de aprobación) o transferencia (foto del comprobante).
 *
 * Una sola RPC: `logistica_marcar_entregado` (deliveryIntegrationService.markAsDelivered). Con un
 * código errado la base devuelve los intentos restantes; con 5 errores bloquea y un administrador
 * lo reinicia. Lo que se registra como cobrado es el total de la contraentrega; el efectivo
 * recibido y el cambio quedan en la nota de la prueba.
 *
 * Fase 2026-11-25: «¿El cliente no tiene el código?» abre una hoja con tres salidas y ninguna para
 * saltarse el código; al confirmar se ve «Entrega confirmada» con la siguiente parada; sin señal
 * no se confirma (la cola sin conexión va en otra fase).
 */
import { useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CircleCheck, HelpCircle } from 'lucide-react';
import { AvisoTonal, CampoNumero, ChipsOpcion, EmptyState, FormField, PageHeader, Skeleton, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useBranch } from '@/lib/context/BranchContext';
import { deliveryIntegrationService, EnvioError } from '@/lib/services/deliveryIntegrationService';
import { subirImagenEnvio } from '@/lib/services/logistica/misEnviosService';
import {
  MEDIOS_COBRO_APP,
  RELACIONES_RECEPTOR,
  cambioADevolver,
  faltanteEntrega,
  lugarDeEntrega,
  montosRapidos,
  notaEntrega,
  porCobrar,
  puedeReportarNovedad,
  type MedioCobroApp,
  type PruebaEntrega,
  type RelacionReceptor,
} from '@/lib/logistica/misEnvios';
import { MAX_INTENTOS_CODIGO } from '@/lib/logistica/contraentrega';
import { puedeEntregarse } from '@/lib/logistica/estadosEnvio';
import { avisarCliente } from '../logisticaApi';
import { useParada } from './useMiRuta';
import { ubicacionActual } from './ubicacion';
import { useEnLinea } from './useEnLinea';
import { HojaSinCodigo } from './HojaSinCodigo';
import { HojaNovedad } from './HojaNovedad';
import { EntregaConfirmada, type DatosEntrega } from './EntregaConfirmada';
import { CampoCodigo } from './CampoCodigo';
import { CapturaFoto } from './CapturaFoto';
import { PadFirma, type PadFirmaRef } from './PadFirma';
import { AvisoPausaSinConexion, BarraInferior, Bloque } from './piezas';
import { RUTA_MIS_ENVIOS, rutaNoEntregado, rutaParada } from './rutas';

export function EntregarPantalla({ shipmentId }: { shipmentId: string }) {
  const t = useTranslations('logistica.misEnvios.entregar');
  const tm = useTranslations('logistica.misEnvios');
  const router = useRouter();
  const moneda = useMonedaOrganizacion();
  const idAyudaCodigo = useId();
  const { orgId, envio, estado, recargar } = useParada(shipmentId);
  const { branches } = useBranch();
  const enLinea = useEnLinea();
  const [confirmada, setConfirmada] = useState<DatosEntrega | null>(null);
  const [sinCodigo, setSinCodigo] = useState(false);
  const [novedad, setNovedad] = useState(false);

  const [codigo, setCodigo] = useState('');
  const [prueba, setPrueba] = useState<PruebaEntrega | null>(null);
  const [fotos, setFotos] = useState<Blob[]>([]);
  const [hayFirma, setHayFirma] = useState(false);
  const firma = useRef<PadFirmaRef>(null);
  const [receptor, setReceptor] = useState<string | null>(null);
  const [relacion, setRelacion] = useState<RelacionReceptor>('customer');
  const [medio, setMedio] = useState<MedioCobroApp | null>('cash');
  const [efectivo, setEfectivo] = useState<number | null>(null);
  const [aprobacion, setAprobacion] = useState('');
  const [comprobante, setComprobante] = useState<Blob[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const [errorCodigo, setErrorCodigo] = useState<{ restantes: number } | 'bloqueado' | null>(null);

  const total = envio ? porCobrar(envio) : 0;
  const codigoRequerido = !!envio?.delivery_code_required;
  const pruebaElegida: PruebaEntrega = prueba ?? (codigoRequerido ? 'codigo' : 'foto');
  const nombreReceptor = receptor ?? envio?.delivery_contact_name ?? envio?.customer?.full_name ?? '';
  const rapidos = useMemo(() => montosRapidos(total), [total]);
  const cambio = medio === 'cash' && efectivo != null ? cambioADevolver(total, efectivo) : null;

  if (confirmada) return <EntregaConfirmada datos={confirmada} />;

  if (estado === 'cargando') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-3" aria-busy="true">
        <PageHeader titulo={t('titulo', { numero: '' })} variante="form" volverA={RUTA_MIS_ENVIOS} cargando />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }
  if (!envio || !orgId || !puedeEntregarse(String(envio.status))) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-4">
        <PageHeader titulo={tm('titulo')} variante="form" volverA={RUTA_MIS_ENVIOS} />
        <EmptyState
          variante="empty"
          compacto
          titulo={envio ? t('noEntregable.titulo') : tm('parada.noEncontrada.titulo')}
          descripcion={envio ? t('noEntregable.descripcion') : tm('parada.noEncontrada.descripcion')}
          accion={{ etiqueta: tm('volver'), onClick: () => router.push(envio ? rutaParada(envio.id) : RUTA_MIS_ENVIOS) }}
        />
      </div>
    );
  }

  const faltante = faltanteEntrega({
    codigoRequerido,
    codigo,
    prueba: pruebaElegida,
    fotos: fotos.length,
    firma: hayFirma,
    receptor: nombreReceptor,
    totalCobrar: total,
    medio,
    recibidoEfectivo: efectivo,
    aprobacion,
    comprobante: comprobante.length > 0,
  });

  const confirmar = async () => {
    setIntentado(true);
    if (faltante || errorCodigo === 'bloqueado' || !enLinea) return;
    setEnviando(true);
    try {
      const [urlsFotos, urlFirma, urlsComprobante, ubicacion] = await Promise.all([
        Promise.all(fotos.map((f) => subirImagenEnvio(supabase, orgId, envio.id, f, 'foto'))),
        pruebaElegida === 'firma' && firma.current
          ? firma.current.aBlob().then((b) => (b ? subirImagenEnvio(supabase, orgId, envio.id, b, 'firma') : null))
          : Promise.resolve(null),
        medio === 'transfer' && total > 0 ? Promise.all(comprobante.map((f) => subirImagenEnvio(supabase, orgId, envio.id, f, 'comprobante'))) : Promise.resolve([]),
        ubicacionActual(4000),
      ]);
      const nota = notaEntrega({
        medio: total > 0 ? medio : null,
        recibidoEfectivo: efectivo,
        cambio,
        aprobacion,
        etiquetas: { efectivo: t('nota.efectivo'), cambio: t('nota.cambio'), aprobacion: t('nota.aprobacion') },
      });
      const r = await deliveryIntegrationService.markAsDelivered(
        envio.id,
        {
          recipientName: nombreReceptor.trim(),
          recipientRelationship: relacion,
          photoUrls: [...urlsFotos, ...urlsComprobante],
          signatureUrl: urlFirma ?? undefined,
          notes: nota ?? undefined,
          latitude: ubicacion?.latitude,
          longitude: ubicacion?.longitude,
          locationType: lugarDeEntrega(relacion),
        },
        {
          codigo: codigoRequerido ? codigo : null,
          cobro: total > 0 && medio ? { metodo: medio, monto: total } : null,
        },
      );
      if (!r.ok) {
        setErrorCodigo(r.intentosRestantes > 0 ? { restantes: r.intentosRestantes } : 'bloqueado');
        setCodigo('');
        return;
      }
      void avisarCliente(envio, r.aviso);
      toastSuccess(t('hecho'));
      setConfirmada({
        envio,
        receptor: nombreReceptor.trim(),
        relacion: t(`receptor.relaciones.${relacion}`),
        codigoVerificado: codigoRequerido,
        entregadoEn: new Date(),
        total,
        medio: total > 0 ? medio : null,
        recibidoEfectivo: medio === 'cash' ? efectivo : null,
        cambio,
      });
    } catch (err) {
      const codigoError = err instanceof EnvioError ? err.codigo : 'ERROR';
      if (codigoError === 'CODIGO_BLOQUEADO') setErrorCodigo('bloqueado');
      else toastError(tm('errores.titulo'), tm.has(`errores.${codigoError}`) ? tm(`errores.${codigoError}`) : tm('errores.ERROR'));
    } finally {
      setEnviando(false);
    }
  };

  const opcionesPrueba = (codigoRequerido ? (['codigo', 'foto'] as const) : (['foto', 'firma'] as const)).map((p) => ({ valor: p, etiqueta: t(`prueba.${p}`) }));
  const mostrarError = (campo: string) => intentado && faltante === campo;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-3">
      <PageHeader
        titulo={t('titulo', { numero: envio.shipment_number })}
        subtitulo={[envio.delivery_contact_name, envio.delivery_address].filter(Boolean).join(' · ')}
        variante="form"
        migas={[
          { etiqueta: tm('titulo'), href: RUTA_MIS_ENVIOS },
          { etiqueta: tm('parada.titulo', { numero: envio.shipment_number }), href: rutaParada(envio.id) },
        ]}
        volverA={rutaParada(envio.id)}
      />

      <Bloque titulo={t('prueba.titulo')}>
        <ChipsOpcion<PruebaEntrega> etiqueta={t('prueba.titulo')} valor={pruebaElegida} onValorChange={setPrueba} opciones={opcionesPrueba} />

        {codigoRequerido && pruebaElegida === 'codigo' && (
          <div className="flex flex-col gap-2">
            <CampoCodigo
              valor={codigo}
              onValorChange={(v) => {
                setCodigo(v);
                if (errorCodigo !== 'bloqueado') setErrorCodigo(null);
              }}
              etiqueta={t('codigo.etiqueta')}
              invalido={!!errorCodigo || mostrarError('codigo')}
              deshabilitado={errorCodigo === 'bloqueado' || enviando}
              idDescripcion={idAyudaCodigo}
            />
            {errorCodigo === 'bloqueado' ? (
              <AvisoTonal tono="peligro" compacto titulo={t('codigo.bloqueado.titulo')} descripcion={t('codigo.bloqueado.descripcion', { max: MAX_INTENTOS_CODIGO })} rol="alert" />
            ) : errorCodigo ? (
              <p role="alert" className="text-sm font-medium text-danger-text">
                {t('codigo.incorrecto', { n: errorCodigo.restantes })}
              </p>
            ) : mostrarError('codigo') ? (
              <p role="alert" className="text-sm font-medium text-danger-text">
                {t('codigo.falta')}
              </p>
            ) : null}
            <p id={idAyudaCodigo} className="text-[13px] text-fg-muted">
              {t('codigo.ayuda')}
            </p>
            <button
              type="button"
              onClick={() => setSinCodigo(true)}
              className="inline-flex items-center gap-1.5 self-start rounded-lg py-1 text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <HelpCircle aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {tm('sinCodigo.titulo')}
            </button>
          </div>
        )}

        {codigoRequerido && pruebaElegida === 'foto' && <p className="text-[13px] text-fg-muted">{t('codigo.sigueObligatorio')}</p>}

        {pruebaElegida === 'firma' ? (
          <>
            <PadFirma ref={firma} etiqueta={t('firma.etiqueta')} textoBorrar={t('firma.borrar')} onTrazoChange={setHayFirma} />
            {mostrarError('foto_o_firma') && (
              <p role="alert" className="text-sm font-medium text-danger-text">
                {t('firma.falta')}
              </p>
            )}
          </>
        ) : (
          <>
            <CapturaFoto
              titulo={t('foto.titulo')}
              descripcion={codigoRequerido ? t('foto.opcional') : t('foto.obligatoria')}
              fotos={fotos}
              onFotosChange={setFotos}
              textoQuitar={t('foto.quitar')}
              invalido={mostrarError('foto_o_firma')}
            />
            {mostrarError('foto_o_firma') && (
              <p role="alert" className="text-sm font-medium text-danger-text">
                {t('foto.falta')}
              </p>
            )}
          </>
        )}

        <FormField etiqueta={t('receptor.etiqueta')} obligatorio error={mostrarError('receptor') ? t('receptor.falta') : null}>
          <Input value={nombreReceptor} onChange={(e) => setReceptor(e.target.value)} autoComplete="off" className="h-12 text-base" />
        </FormField>
        <ChipsOpcion<RelacionReceptor>
          etiqueta={t('receptor.relacion')}
          valor={relacion}
          onValorChange={setRelacion}
          opciones={RELACIONES_RECEPTOR.map((r) => ({ valor: r, etiqueta: t(`receptor.relaciones.${r}`) }))}
        />
      </Bloque>

      {total > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border border-line-warning bg-warning-subtle p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-fg">{t('cobro.titulo')}</h2>
            <span className="text-lg font-semibold text-fg">{moneda.formatear(total)}</span>
          </div>
          <ChipsOpcion<MedioCobroApp>
            etiqueta={t('cobro.medio')}
            valor={medio}
            onValorChange={setMedio}
            opciones={MEDIOS_COBRO_APP.map((m) => ({ valor: m, etiqueta: t(`cobro.medios.${m}`) }))}
          />
          {medio === 'cash' && (
            <>
              <FormField etiqueta={t('cobro.recibido')} obligatorio error={mostrarError('efectivo_insuficiente') ? t('cobro.insuficiente') : null}>
                <CampoNumero valor={efectivo} onValorChange={setEfectivo} minimo={0} decimales={0} inputMode="numeric" className="h-12 text-base" />
              </FormField>
              <ChipsOpcion<string>
                etiqueta={t('cobro.rapidos')}
                valor={efectivo == null ? null : String(efectivo)}
                onValorChange={(v) => setEfectivo(Number(v))}
                opciones={[
                  { valor: String(total), etiqueta: t('cobro.exacto') },
                  ...rapidos.map((m) => ({ valor: String(m), etiqueta: moneda.formatear(m) })),
                ]}
              />
              <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
                <span className="text-[15px] text-fg">{t('cobro.cambio')}</span>
                <span className="text-xl font-semibold text-fg" aria-live="polite">
                  {cambio == null ? '—' : moneda.formatear(cambio)}
                </span>
              </div>
            </>
          )}
          {medio === 'card' && (
            <FormField etiqueta={t('cobro.aprobacion')} obligatorio error={mostrarError('aprobacion') ? t('cobro.faltaAprobacion') : null}>
              <Input value={aprobacion} onChange={(e) => setAprobacion(e.target.value)} inputMode="numeric" className="h-12 text-base" />
            </FormField>
          )}
          {medio === 'transfer' && (
            <CapturaFoto
              titulo={t('cobro.comprobante')}
              descripcion={t('cobro.comprobanteAyuda')}
              fotos={comprobante}
              onFotosChange={setComprobante}
              maximo={1}
              textoQuitar={t('foto.quitar')}
              invalido={mostrarError('comprobante')}
            />
          )}
          {mostrarError('medio') && (
            <p role="alert" className="text-sm font-medium text-danger-text">
              {t('cobro.faltaMedio')}
            </p>
          )}
          <p className="text-[13px] text-fg-secondary">{t('cobro.nota')}</p>
        </section>
      )}

      {!enLinea && <AvisoPausaSinConexion />}

      <BarraInferior>
        <button
          type="button"
          onClick={confirmar}
          disabled={enviando || errorCodigo === 'bloqueado' || !enLinea}
          aria-busy={enviando}
          className={clasesBoton({ tamano: 'lg', anchoCompleto: true })}
        >
          <CircleCheck aria-hidden="true" className="size-5" strokeWidth={1.5} />
          {enviando ? tm('guardando') : total > 0 ? t('confirmarCon', { monto: moneda.formatear(total) }) : t('confirmar')}
        </button>
        {errorCodigo === 'bloqueado' && puedeReportarNovedad(String(envio.status)) && (
          <button type="button" onClick={() => router.push(rutaNoEntregado(envio.id))} className={clasesBoton({ variante: 'secundario', tamano: 'lg', anchoCompleto: true })}>
            {tm('pasos.boton.noEntregado')}
          </button>
        )}
      </BarraInferior>

      <HojaSinCodigo
        abierto={sinCodigo}
        onAbiertoChange={setSinCodigo}
        subtitulo={[envio.shipment_number, envio.delivery_contact_name || envio.customer?.full_name].filter(Boolean).join(' · ')}
        telefonoTienda={branches.find((b) => b.id === envio.branch_id)?.phone ?? null}
        onNovedad={
          puedeReportarNovedad(String(envio.status))
            ? () => {
                setSinCodigo(false);
                setNovedad(true);
              }
            : null
        }
      />
      <HojaNovedad
        envio={novedad ? envio : null}
        orgId={orgId}
        onCerrar={() => setNovedad(false)}
        onHecho={() => {
          setNovedad(false);
          recargar();
          router.push(RUTA_MIS_ENVIOS);
        }}
      />
    </div>
  );
}
