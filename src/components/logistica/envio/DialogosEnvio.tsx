'use client';

/**
 * Diálogos del detalle del envío: marcar entregado, registrar intento fallido y cambiar la
 * dirección. Todo lo que mueve estado o dinero va por las RPC (`markAsDelivered` →
 * `logistica_marcar_entregado`, `registerFailedAttempt` → `logistica_registrar_novedad`); la
 * dirección es un dato del envío y se guarda con `shipmentsService.updateShipment`, el mismo de
 * Envíos.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, MapPin } from 'lucide-react';
import { CampoFecha, Dialogo, FormField } from '@/components/kit';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { deliveryIntegrationService, EnvioError } from '@/lib/services/deliveryIntegrationService';
import { shipmentsService } from '@/lib/services/shipmentsService';
import { MEDIOS_COBRO_CONTRAENTREGA, MAX_INTENTOS_CODIGO, type MedioCobroContraentrega } from '@/lib/logistica/contraentrega';
import { MOTIVOS_NOVEDAD, type MotivoNovedad } from '@/lib/logistica/estadosEnvio';
import { RELACIONES_RECEPTOR } from '@/lib/logistica/misEnvios';
import { faltanteEntregaAdmin } from '@/lib/logistica/detalleEnvio';

const claseCampo = 'h-10 border-line-strong bg-surface';

function useMensajeError() {
  const t = useTranslations('logistica.envio');
  return (e: unknown) => {
    const codigo = e instanceof EnvioError ? e.codigo : 'ERROR';
    return t.has(`errores.${codigo}`) ? t(`errores.${codigo}`) : t('errores.ERROR');
  };
}

// ── Marcar entregado ───────────────────────────────────────────────────────────

export interface DialogoEntregarProps {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  envio: { id: string; cliente: string | null; contraentrega: number; codStatus: string | null; codigoRequerido: boolean };
  onEntregado: (r: { aviso: 'entregado' }) => void;
}

export function DialogoEntregar({ abierto, onAbiertoChange, envio, onEntregado }: DialogoEntregarProps) {
  const t = useTranslations('logistica.envio.entregar');
  const mensajeError = useMensajeError();
  const moneda = useMonedaOrganizacion();
  const cobrar = envio.contraentrega > 0 && envio.codStatus !== 'collected' && envio.codStatus !== 'remitted';

  const [receptor, setReceptor] = useState('');
  const [relacion, setRelacion] = useState<string>('titular');
  const [documento, setDocumento] = useState('');
  const [codigo, setCodigo] = useState('');
  const [metodo, setMetodo] = useState<MedioCobroContraentrega | null>(null);
  const [monto, setMonto] = useState<string>('');
  const [notas, setNotas] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const [restantes, setRestantes] = useState<number | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setReceptor(envio.cliente ?? '');
    setRelacion('titular');
    setDocumento('');
    setCodigo('');
    setMetodo(cobrar ? 'cash' : null);
    setMonto(cobrar ? String(envio.contraentrega) : '');
    setNotas('');
    setIntentado(false);
    setRestantes(null);
  }, [abierto, envio.cliente, envio.contraentrega, cobrar]);

  const montoNum = monto.trim() === '' ? null : Number(monto.replace(',', '.'));
  const falta = faltanteEntregaAdmin({
    receptor,
    requiereCodigo: envio.codigoRequerido && cobrar,
    codigo,
    contraentrega: cobrar ? envio.contraentrega : 0,
    metodo,
    monto: montoNum,
  });

  const confirmar = async () => {
    setIntentado(true);
    if (falta) return;
    setEnviando(true);
    try {
      const r = await deliveryIntegrationService.markAsDelivered(
        envio.id,
        { recipientName: receptor.trim(), recipientRelationship: relacion, recipientDocNumber: documento.trim() || undefined, notes: notas.trim() || undefined },
        {
          codigo: envio.codigoRequerido && cobrar ? codigo.trim() : null,
          cobro: cobrar && metodo && montoNum ? { metodo, monto: montoNum } : null,
        },
      );
      if (!r.ok) {
        setRestantes(r.intentosRestantes);
        return;
      }
      toastSuccess(t('ok'));
      onAbiertoChange(false);
      onEntregado({ aviso: r.aviso });
    } catch (e) {
      toastError(t('error'), mensajeError(e));
    } finally {
      setEnviando(false);
    }
  };

  const err = (campo: typeof falta) => (intentado && falta === campo ? t(`faltante.${campo}`) : null);

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={CheckCircle2}
      ancho={520}
      primario={{ etiqueta: t('confirmar'), onClick: () => void confirmar(), cargando: enviando }}
      textoCancelar={t('cancelar')}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('receptor')} obligatorio error={err('receptor')}>
          {(cp) => <Input {...cp} value={receptor} onChange={(e) => setReceptor(e.target.value)} className={claseCampo} autoComplete="off" />}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('relacion')}>
            {(cp) => (
              <Select value={relacion} onValueChange={setRelacion}>
                <SelectTrigger id={cp.id} aria-labelledby={cp.idEtiqueta} className={claseCampo}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELACIONES_RECEPTOR.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`relaciones.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('documento')} ayuda={t('documentoAyuda')}>
            {(cp) => <Input {...cp} value={documento} onChange={(e) => setDocumento(e.target.value)} className={claseCampo} inputMode="numeric" autoComplete="off" />}
          </FormField>
        </div>

        {cobrar && (
          <>
            <AvisoTonal tono="advertencia" compacto titulo={t('cobroTitulo', { monto: moneda.formatear(envio.contraentrega) })} />
            {envio.codigoRequerido && (
              <FormField etiqueta={t('codigo')} obligatorio ayuda={t('codigoAyuda')} error={err('codigo')}>
                {(cp) => (
                  <Input
                    {...cp}
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className={`${claseCampo} w-32 tracking-[0.4em] tabular-nums`}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                )}
              </FormField>
            )}
            {restantes !== null && (
              <AvisoTonal
                tono="peligro"
                rol="alert"
                compacto
                titulo={restantes > 0 ? t('codigoErrado', { n: restantes, max: MAX_INTENTOS_CODIGO }) : t('codigoBloqueado')}
              />
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField etiqueta={t('metodo')} obligatorio error={err('metodo')}>
                {(cp) => (
                  <Select value={metodo ?? undefined} onValueChange={(v) => setMetodo(v as MedioCobroContraentrega)}>
                    <SelectTrigger id={cp.id} aria-labelledby={cp.idEtiqueta} className={claseCampo}>
                      <SelectValue placeholder={t('elegir')} />
                    </SelectTrigger>
                    <SelectContent>
                      {MEDIOS_COBRO_CONTRAENTREGA.map((m) => (
                        <SelectItem key={m} value={m}>
                          {t(`medios.${m}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('monto')} obligatorio error={err('monto')}>
                {(cp) => <Input {...cp} value={monto} onChange={(e) => setMonto(e.target.value)} className={claseCampo} inputMode="decimal" />}
              </FormField>
            </div>
          </>
        )}

        <FormField etiqueta={t('notas')}>
          {(cp) => <Textarea {...cp} value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="border-line-strong bg-surface" />}
        </FormField>
      </div>
    </Dialogo>
  );
}

// ── Intento fallido ─────────────────────────────────────────────────────────────

export interface DialogoNovedadProps {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  shipmentId: string;
  onRegistrada: () => void;
}

export function DialogoNovedad({ abierto, onAbiertoChange, shipmentId, onRegistrada }: DialogoNovedadProps) {
  const t = useTranslations('logistica.envio.novedad');
  const tEnvio = useTranslations('logistica.envio');
  const mensajeError = useMensajeError();
  const { getToday } = useFormatDate();
  const [motivo, setMotivo] = useState<MotivoNovedad | null>(null);
  const [detalle, setDetalle] = useState('');
  const [reprogramar, setReprogramar] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [intentado, setIntentado] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setMotivo(null);
    setDetalle('');
    setReprogramar(null);
    setIntentado(false);
  }, [abierto]);

  const falta = !motivo ? 'motivo' : motivo === 'other' && detalle.trim().length < 3 ? 'detalle' : null;

  const confirmar = async () => {
    setIntentado(true);
    if (falta || !motivo) return;
    setEnviando(true);
    try {
      await deliveryIntegrationService.registerFailedAttempt(shipmentId, {
        reasonCode: motivo,
        reasonText: detalle.trim() || undefined,
        rescheduleDate: reprogramar ?? undefined,
      });
      toastSuccess(t('ok'));
      onAbiertoChange(false);
      onRegistrada();
    } catch (e) {
      toastError(t('error'), mensajeError(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={AlertTriangle}
      ancho={520}
      primario={{ etiqueta: t('confirmar'), onClick: () => void confirmar(), cargando: enviando }}
      textoCancelar={t('cancelar')}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('motivo')} obligatorio error={intentado && falta === 'motivo' ? t('faltaMotivo') : null}>
          {(cp) => (
            <Select value={motivo ?? undefined} onValueChange={(v) => setMotivo(v as MotivoNovedad)}>
              <SelectTrigger id={cp.id} aria-labelledby={cp.idEtiqueta} className={claseCampo}>
                <SelectValue placeholder={t('elegir')} />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS_NOVEDAD.map((m) => (
                  <SelectItem key={m} value={m}>
                    {tEnvio(`motivos.${m}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField etiqueta={t('detalle')} error={intentado && falta === 'detalle' ? t('faltaDetalle') : null}>
          {(cp) => <Textarea {...cp} value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={3} className="border-line-strong bg-surface" />}
        </FormField>
        <FormField etiqueta={t('reprogramar')} ayuda={t('reprogramarAyuda')}>
          {(cp) => <CampoFecha id={cp.id} aria-labelledby={cp.idEtiqueta} valor={reprogramar} onValorChange={setReprogramar} min={getToday()} hoy={getToday()} limpiable />}
        </FormField>
        <p className="text-xs text-fg-muted">{t('avisoPendiente')}</p>
      </div>
    </Dialogo>
  );
}

// ── Cambiar dirección ───────────────────────────────────────────────────────────

export interface DialogoDireccionProps {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  envio: { id: string; direccion: string | null; ciudad: string | null; instrucciones: string | null };
  onGuardada: () => void;
}

export function DialogoDireccion({ abierto, onAbiertoChange, envio, onGuardada }: DialogoDireccionProps) {
  const t = useTranslations('logistica.envio.direccion');
  const [direccion, setDireccion] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [instrucciones, setInstrucciones] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [intentado, setIntentado] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setDireccion(envio.direccion ?? '');
    setCiudad(envio.ciudad ?? '');
    setInstrucciones(envio.instrucciones ?? '');
    setIntentado(false);
  }, [abierto, envio.direccion, envio.ciudad, envio.instrucciones]);

  const confirmar = async () => {
    setIntentado(true);
    if (direccion.trim().length < 4) return;
    setEnviando(true);
    try {
      await shipmentsService.updateShipment(envio.id, {
        delivery_address: direccion.trim(),
        delivery_city: ciudad.trim() || undefined,
        delivery_instructions: instrucciones.trim() || undefined,
      });
      toastSuccess(t('ok'));
      onAbiertoChange(false);
      onGuardada();
    } catch {
      toastError(t('error'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={MapPin}
      ancho={520}
      primario={{ etiqueta: t('guardar'), onClick: () => void confirmar(), cargando: enviando }}
      textoCancelar={t('cancelar')}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('direccion')} obligatorio error={intentado && direccion.trim().length < 4 ? t('faltaDireccion') : null}>
          {(cp) => <Input {...cp} value={direccion} onChange={(e) => setDireccion(e.target.value)} className={claseCampo} />}
        </FormField>
        <FormField etiqueta={t('ciudad')}>
          {(cp) => <Input {...cp} value={ciudad} onChange={(e) => setCiudad(e.target.value)} className={claseCampo} />}
        </FormField>
        <FormField etiqueta={t('instrucciones')}>
          {(cp) => <Textarea {...cp} value={instrucciones} onChange={(e) => setInstrucciones(e.target.value)} rows={2} className="border-line-strong bg-surface" />}
        </FormField>
      </div>
    </Dialogo>
  );
}
