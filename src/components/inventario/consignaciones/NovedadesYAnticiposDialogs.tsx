'use client';

/**
 * Dos acciones de la nota recibida que pidió el Contador (Ronda 2):
 * - «Registrar faltante o daño» (punto 7): evidencia, responsable y obligación.
 *   Saca la mercancía del control físico y de las cuentas de orden; NO genera
 *   gasto ni cuenta por pagar: deja un pendiente contable para acreditar la pérdida.
 * - «Cruzar anticipo» (punto 6): un anticipo a proveedor del consignante contra la
 *   obligación real del mandato (D auxiliar 281510 / C cuenta del anticipo). Sin
 *   compra ni documento soporte fabricados.
 * - «Reconocer remuneración» (Ronda 3, punto 1): cuando el contrato condiciona el
 *   devengo a una obligación posterior real, la comisión se reconoce al cumplirse,
 *   con evidencia (D auxiliar 281510 / C auxiliar 413512), nunca por la fecha de
 *   liquidación.
 * Cada una es UNA ruta y UNA RPC.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeftRight, BadgeCheck, TriangleAlert } from 'lucide-react';
import { CampoNumero, Dialogo, FormField } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toastSuccess } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { nuevaClaveIdempotencia } from '@/components/finanzas/saldos-a-favor/saldosAFavorService';
import { textoErrorSaldo } from '@/components/finanzas/saldos-a-favor/textosSaldo';
import { textoErrorConsignacion } from './textoErrorConsignacion';
import { enTuPoder, type NotaRecibida } from '@/lib/inventario/consignaciones/recibidas';
import { consignacionesRecibidasService } from './consignacionesRecibidasService';

const NS = 'consignacionesR4';
/** Rondas 5 y 6 del Contador: errores nuevos del cruce (el orden de aplicación debe incluir anticipos). */
const NS_R5 = 'consignacionesR5';
const NS_R6 = 'consignacionesR6';
const RESPONSABLES = ['dueno', 'consignatario', 'tercero', 'por_determinar'] as const;

interface PropsDialogo {
  nota: NotaRecibida;
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  onHecho: () => void;
}

export function NovedadDialog({ nota, abierto, onAbiertoChange, onHecho }: PropsDialogo) {
  const t = useTranslations(NS);
  const [lineaId, setLineaId] = useState<string>('');
  const [tipo, setTipo] = useState<'faltante' | 'dano' | ''>('');
  const [cantidad, setCantidad] = useState<number | null>(null);
  const [responsable, setResponsable] = useState<(typeof RESPONSABLES)[number] | ''>('');
  const [evidencia, setEvidencia] = useState('');
  const [obligacion, setObligacion] = useState('');
  const [tocado, setTocado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = useRef('');

  useEffect(() => {
    if (!abierto) return;
    setLineaId('');
    setTipo('');
    setCantidad(null);
    setResponsable('');
    setEvidencia('');
    setObligacion('');
    setTocado(false);
    setError(null);
    clave.current = nuevaClaveIdempotencia('consignacion-novedad');
  }, [abierto]);

  const lineas = nota.lineas.filter((l) => enTuPoder(l) > 0);
  const linea = lineas.find((l) => l.id === lineaId) ?? null;
  const errores = {
    linea: !linea ? t('novedad.validacion.linea') : null,
    tipo: !tipo ? t('novedad.validacion.tipo') : null,
    cantidad: !(cantidad && cantidad > 0) || (linea && cantidad > enTuPoder(linea)) ? t('novedad.validacion.cantidad') : null,
    responsable: !responsable ? t('novedad.validacion.responsable') : null,
    evidencia: evidencia.trim().length < 5 ? t('errores.evidencia_obligatoria') : null,
  };
  const hayErrores = Object.values(errores).some(Boolean);

  const confirmar = async () => {
    setTocado(true);
    if (hayErrores || !linea || !tipo || !responsable || !cantidad) return;
    setEnviando(true);
    setError(null);
    try {
      await consignacionesRecibidasService.novedad(nota.id, {
        linea_id: linea.id,
        tipo,
        cantidad,
        responsable,
        evidencia: evidencia.trim(),
        obligacion: obligacion.trim() || null,
        clave_idempotencia: clave.current,
      });
      toastSuccess(t('novedad.exito'));
      onAbiertoChange(false);
      onHecho();
    } catch (e) {
      setError(textoErrorSaldo(t, e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={t('novedad.titulo')}
      descripcion={t('novedad.descripcion')}
      icono={TriangleAlert}
      ancho={560}
      primario={{ etiqueta: t('novedad.confirmar'), onClick: () => void confirmar(), cargando: enviando }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('novedad.producto')} obligatorio error={tocado ? errores.linea : null}>
          {(c) => (
            <Select value={lineaId} onValueChange={setLineaId}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-invalid={c['aria-invalid']} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={t('condiciones.elegir')} />
              </SelectTrigger>
              <SelectContent>
                {lineas.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {t('novedad.productoEnTuPoder', { producto: l.productoConsignante ?? l.producto, n: enTuPoder(l) })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField etiqueta={t('novedad.tipo')} obligatorio error={tocado ? errores.tipo : null}>
            {(c) => (
              <Select value={tipo} onValueChange={(v) => setTipo(v as 'faltante' | 'dano')}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-invalid={c['aria-invalid']} className="h-10 border-line-strong bg-surface">
                  <SelectValue placeholder={t('condiciones.elegir')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="faltante">{t('novedad.tipos.faltante')}</SelectItem>
                  <SelectItem value="dano">{t('novedad.tipos.dano')}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('novedad.cantidad')} obligatorio error={tocado ? errores.cantidad : null}>
            {(c) => <CampoNumero id={c.id} valor={cantidad} onValorChange={setCantidad} minimo={0} maximo={linea ? enTuPoder(linea) : undefined} decimales={3} alinear="derecha" />}
          </FormField>
          <FormField etiqueta={t('novedad.responsable')} obligatorio error={tocado ? errores.responsable : null}>
            {(c) => (
              <Select value={responsable} onValueChange={(v) => setResponsable(v as (typeof RESPONSABLES)[number])}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-invalid={c['aria-invalid']} className="h-10 border-line-strong bg-surface">
                  <SelectValue placeholder={t('condiciones.elegir')} />
                </SelectTrigger>
                <SelectContent>
                  {RESPONSABLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`novedad.responsables.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        </div>
        <FormField etiqueta={t('novedad.evidencia')} obligatorio ayuda={t('novedad.evidenciaAyuda')} error={tocado ? errores.evidencia : null}>
          {(c) => <Textarea id={c.id} aria-labelledby={c.idEtiqueta} value={evidencia} maxLength={2000} rows={3} onChange={(e) => setEvidencia(e.target.value)} />}
        </FormField>
        <FormField etiqueta={t('novedad.obligacion')} ayuda={t('novedad.obligacionAyuda')}>
          {(c) => <Textarea id={c.id} aria-labelledby={c.idEtiqueta} value={obligacion} maxLength={2000} rows={2} onChange={(e) => setObligacion(e.target.value)} />}
        </FormField>
        <p className="text-xs text-fg-muted">{t('novedad.asiento')}</p>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}

export function ReconocerRemuneracionDialog({ nota, abierto, onAbiertoChange, onHecho }: PropsDialogo) {
  const t = useTranslations(NS);
  const fmt = useMonedaOrganizacion().formatear;
  const [evidencia, setEvidencia] = useState('');
  const [tocado, setTocado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = useRef('');
  useEffect(() => {
    if (!abierto) return;
    setEvidencia('');
    setTocado(false);
    setError(null);
    clave.current = nuevaClaveIdempotencia('consignacion-reconocer');
  }, [abierto]);
  const errEvidencia = evidencia.trim().length < 10 ? t('reconocer.validacionEvidencia') : null;
  const confirmar = async () => {
    setTocado(true);
    if (errEvidencia) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await consignacionesRecibidasService.reconocer(nota.id, { evidencia: evidencia.trim(), clave_idempotencia: clave.current });
      toastSuccess(t('reconocer.exito', { valor: fmt(r.monto) }));
      onAbiertoChange(false);
      onHecho();
    } catch (e) {
      setError(textoErrorSaldo(t, e));
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={t('reconocer.titulo')}
      descripcion={t('reconocer.descripcion', { valor: fmt(nota.remuneracionPorReconocer) })}
      icono={BadgeCheck}
      ancho={560}
      primario={{ etiqueta: t('reconocer.confirmar'), onClick: () => void confirmar(), cargando: enviando }}
    >
      <div className="flex flex-col gap-4">
        {nota.obligacionPosterior && (
          <div className="rounded-md bg-subtle p-3 text-sm">
            <p className="text-xs text-fg-muted">{t('condiciones.obligacionPosterior')}</p>
            <p className="text-fg">{nota.obligacionPosterior}</p>
          </div>
        )}
        <FormField etiqueta={t('reconocer.evidencia')} obligatorio ayuda={t('reconocer.evidenciaAyuda')} error={tocado ? errEvidencia : null}>
          {(c) => <Textarea id={c.id} aria-labelledby={c.idEtiqueta} value={evidencia} maxLength={2000} rows={3} onChange={(e) => setEvidencia(e.target.value)} />}
        </FormField>
        <p className="text-xs text-fg-muted">{t('reconocer.asiento', { recaudo: nota.cuentas.recaudo ?? '281510', remuneracion: nota.cuentas.remuneracion ?? '413512' })}</p>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}

export function CruceAnticipoDialog({ nota, abierto, onAbiertoChange, onHecho }: PropsDialogo) {
  const t = useTranslations(NS);
  const tR5 = useTranslations(NS_R5);
  const tR6 = useTranslations(NS_R6);
  const fmt = useMonedaOrganizacion().formatear;
  const { formatDate } = useFormatDate();
  const [anticipos, setAnticipos] = useState<{ id: string; saldo: number; cuenta: string; creado: string }[] | null>(null);
  const [anticipoId, setAnticipoId] = useState('');
  const [monto, setMonto] = useState<number | null>(null);
  const [tocado, setTocado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = useRef('');

  useEffect(() => {
    if (!abierto) return;
    setAnticipos(null);
    setAnticipoId('');
    setMonto(null);
    setTocado(false);
    setError(null);
    clave.current = nuevaClaveIdempotencia('consignacion-cruce');
    let vigente = true;
    consignacionesRecibidasService
      .anticipos(nota.id)
      .then((a) => vigente && setAnticipos(a))
      .catch((e) => vigente && (setAnticipos([]), setError(textoErrorSaldo(t, e))));
    return () => {
      vigente = false;
    };
  }, [abierto, nota.id, t]);

  const anticipo = anticipos?.find((a) => a.id === anticipoId) ?? null;
  const errorMonto = !(monto && monto > 0) || (anticipo && monto > anticipo.saldo) ? t('cruce.validacionMonto') : null;

  const confirmar = async () => {
    setTocado(true);
    if (!anticipo || errorMonto || !monto) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await consignacionesRecibidasService.cruzarAnticipo(nota.id, { anticipo_id: anticipo.id, monto, clave_idempotencia: clave.current });
      toastSuccess(t('cruce.exito', { valor: fmt(r.monto) }));
      onAbiertoChange(false);
      onHecho();
    } catch (e) {
      setError(textoErrorConsignacion(t, tR5, e, tR6));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={t('cruce.titulo')}
      descripcion={t('cruce.descripcion', { consignante: nota.consignante })}
      icono={ArrowLeftRight}
      ancho={560}
      primario={{ etiqueta: t('cruce.confirmar'), onClick: () => void confirmar(), cargando: enviando, deshabilitada: !anticipos || anticipos.length === 0 }}
    >
      <div className="flex flex-col gap-4">
        {anticipos && anticipos.length === 0 && !error && <p className="text-sm text-fg-muted">{t('cruce.sinAnticipos')}</p>}
        {anticipos && anticipos.length > 0 && (
          <>
            <FormField etiqueta={t('cruce.anticipo')} obligatorio error={tocado && !anticipo ? t('cruce.validacionAnticipo') : null}>
              {(c) => (
                <Select value={anticipoId} onValueChange={setAnticipoId}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-invalid={c['aria-invalid']} className="h-10 border-line-strong bg-surface">
                    <SelectValue placeholder={t('condiciones.elegir')} />
                  </SelectTrigger>
                  <SelectContent>
                    {anticipos.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {t('cruce.opcion', { fecha: formatDate(a.creado), saldo: fmt(a.saldo) })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('cruce.monto')} obligatorio error={tocado ? errorMonto : null}>
              {(c) => <CampoNumero id={c.id} valor={monto} onValorChange={setMonto} minimo={0} maximo={anticipo?.saldo} decimales={2} alinear="derecha" />}
            </FormField>
            <p className="text-xs text-fg-muted">{t('cruce.asiento', { recaudo: nota.cuentas.recaudo ?? '281510', cuenta: anticipo?.cuenta ?? '1330' })}</p>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
