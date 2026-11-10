'use client';

/**
 * Retención excesiva o indebida (rondas 3 y 4 del Contador). Con el cálculo correcto (base y tarifa) la base calcula
 * el exceso y lo reintegra al proveedor (D retención por pagar / C caja o banco); el anticipo no cambia. Exige la
 * solicitud escrita del afectado y sus pruebas, el cálculo, el certificado corregido y si la declaración requiere
 * corrección; con reteICA, las pruebas del procedimiento VALIDADO del municipio (sin él, la base lo bloquea). El período
 * de descuento no se elige: lo fija la regla del impuesto. `POST /api/anticipos-proveedor/[id]/retencion-exceso`.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Scale } from 'lucide-react';
import { CampoNumero, Dialogo, FilaDato, FormField, SelectorMetodoPago, simboloMoneda } from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastSuccess } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import type { ContextoSaldoFavor } from '@/lib/finanzas/saldosAFavor/contrato';
import type { ClaseRetencionAnticipo, FilaAnticipoProveedor } from '@/lib/finanzas/anticiposProveedor/contrato';
import { nuevaClaveIdempotencia } from '@/components/finanzas/saldos-a-favor/saldosAFavorService';
import { metodoInicial, opcionesMetodoSaldo } from '@/components/finanzas/saldos-a-favor/metodosSaldo';
import { textoErrorSaldo } from '@/components/finanzas/saldos-a-favor/textosSaldo';
import { anticiposProveedorService } from './anticiposProveedorService';
import { CamposPruebasIca } from './CamposPruebasIca';

const NS = 'finanzasTercerosR4.anticipos';
/** Ronda 5 del Contador: manifestación de no imputación (reteIVA) y período por impuesto. */
const NS_R5 = 'finanzasTercerosR5.anticipos';
/** Ronda 6 del Contador: en exceso, el saldo de reteIVA va a los dos períodos siguientes (DUR 1.3.2.3.1). */
const NS_R6 = 'finanzasTercerosR6.anticipos';

export interface ExcesoRetencionDialogProps {
  anticipo: Pick<FilaAnticipoProveedor, 'id' | 'proveedor' | 'sucursalId' | 'retenciones' | 'pruebasIca'> | null;
  onCerrar: () => void;
  onReintegrado: () => void;
}

export function ExcesoRetencionDialog({ anticipo, onCerrar, onReintegrado }: ExcesoRetencionDialogProps) {
  const t = useTranslations(NS);
  const tR5 = useTranslations(NS_R5);
  const tR6 = useTranslations(NS_R6);
  const moneda = useMonedaOrganizacion();
  const idCorreccion = useId();
  const vigentes = useMemo(() => (anticipo?.retenciones ?? []).filter((r) => r.vigente > 0), [anticipo]);
  const [contexto, setContexto] = useState<ContextoSaldoFavor | null>(null);
  const [clase, setClase] = useState<ClaseRetencionAnticipo | ''>('');
  const [base, setBase] = useState<number | null>(null);
  const [tarifa, setTarifa] = useState<number | null>(null);
  const [metodo, setMetodo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [calculo, setCalculo] = useState('');
  const [certificado, setCertificado] = useState('');
  const [solicitud, setSolicitud] = useState('');
  const [pruebas, setPruebas] = useState('');
  const [manifestacion, setManifestacion] = useState('');
  const [ica, setIca] = useState<Record<string, string>>({});
  const [requiereCorreccion, setRequiereCorreccion] = useState(false);
  const [tocado, setTocado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = useRef('');

  useEffect(() => {
    if (!anticipo) return;
    let vigente = true;
    setClase('');
    setBase(null);
    setTarifa(null);
    setMetodo(null);
    setMotivo('');
    setCalculo('');
    setCertificado('');
    setSolicitud('');
    setPruebas('');
    setManifestacion('');
    setIca({});
    setRequiereCorreccion(false);
    setTocado(false);
    setError(null);
    clave.current = nuevaClaveIdempotencia('exceso');
    anticiposProveedorService
      .contexto(anticipo.sucursalId)
      .then((c) => vigente && setContexto(c))
      .catch((e) => vigente && setError(textoErrorSaldo(t, e)));
    return () => {
      vigente = false;
    };
  }, [anticipo, t]);

  const opciones = useMemo(() => opcionesMetodoSaldo(contexto, t('devolver.sinCaja')), [contexto, t]);
  useEffect(() => {
    if (contexto && metodo === null) setMetodo(metodoInicial(opciones));
  }, [contexto, metodo, opciones]);

  const retencion = vigentes.find((r) => r.clase === clase) ?? null;
  const camposIca = useMemo(() => ['solicitud', 'certificado', ...(anticipo?.pruebasIca ?? [])], [anticipo]);
  const correcta = base !== null && tarifa !== null ? Math.round((base * tarifa) / 100) : null;
  const exceso = retencion && correcta !== null ? retencion.vigente - correcta : null;
  const faltas = {
    clase: !retencion,
    calculo: base === null || tarifa === null || exceso === null || exceso <= 0,
    motivo: motivo.trim().length < 3,
    soportes: calculo.trim().length < 3 || certificado.trim().length < 3 || solicitud.trim().length < 3 || pruebas.trim().length < 3,
    // Ronda 5 (DUR 1.3.2.3.1): la reteIVA en exceso exige además la manifestación escrita de no imputación del retenido.
    manifestacion: clase === 'reteiva' && manifestacion.trim().length < 3,
    // reteICA: sin procedimiento validado del municipio no se puede (la base lo bloquea); con él, todas sus pruebas.
    ica: clase === 'reteica' && (!anticipo?.pruebasIca || camposIca.some((k) => (ica[k] ?? '').trim().length < 3)),
  };

  const cerrar = () => !enviando && onCerrar();
  const confirmar = async () => {
    setTocado(true);
    if (!anticipo || !metodo || Object.values(faltas).some(Boolean) || base === null || tarifa === null || !clase) return;
    setEnviando(true);
    setError(null);
    try {
      await anticiposProveedorService.reintegrarExceso(anticipo.id, {
        clase,
        baseCorrecta: base,
        tarifaCorrecta: tarifa,
        metodo,
        motivo,
        soportes: {
          calculo: calculo.trim(),
          certificado: certificado.trim(),
          solicitud: solicitud.trim(),
          pruebas: pruebas.trim(),
          manifestacion_no_imputacion: clase === 'reteiva' ? manifestacion.trim() : null,
          ica: clase === 'reteica' ? Object.fromEntries(camposIca.map((k) => [k, (ica[k] ?? '').trim()])) : null,
        },
        requiereCorreccion,
        claveIdempotencia: clave.current,
      });
      toastSuccess(t('exceso.exito', { monto: moneda.formatear(exceso ?? 0), proveedor: anticipo.proveedor || t('sinProveedor') }));
      onCerrar();
      onReintegrado();
    } catch (e) {
      setError(textoErrorSaldo(t, e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={!!anticipo}
      onAbiertoChange={(v) => !v && cerrar()}
      titulo={t('exceso.titulo')}
      descripcion={t('exceso.descripcion')}
      icono={Scale}
      ancho={560}
      primario={{ etiqueta: t('exceso.confirmar'), onClick: () => void confirmar(), cargando: enviando, deshabilitada: !contexto || !metodo, motivo: t('cargando') }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('exceso.clase')} obligatorio error={tocado && faltas.clase ? t('validacion.retencionesDevolucion') : null}>
          {(c) => (
            <Select value={clase} onValueChange={(v) => setClase(v as ClaseRetencionAnticipo)}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={t('exceso.clasePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {vigentes.map((r) => (
                  <SelectItem key={r.clase} value={r.clase}>
                    {t(`retenciones.clases.${r.clase}`)} · {moneda.formatear(r.vigente)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField etiqueta={t('exceso.baseCorrecta')} obligatorio>
            {(c) => (
              <CampoNumero id={c.id} aria-describedby={c['aria-describedby']} valor={base} onValorChange={setBase} minimo={0} prefijo={simboloMoneda(moneda.paraDocumento(null))} />
            )}
          </FormField>
          <FormField etiqueta={t('exceso.tarifaCorrecta')} obligatorio>
            {(c) => <CampoNumero id={c.id} aria-describedby={c['aria-describedby']} valor={tarifa} onValorChange={setTarifa} minimo={0} maximo={100} decimales={4} sufijo="%" />}
          </FormField>
        </div>
        {exceso !== null && (
          <dl className="flex flex-col">
            <FilaDato etiqueta={t('exceso.correcta')} valor={moneda.formatear(correcta ?? 0)} />
            <FilaDato etiqueta={t('exceso.exceso')} valor={moneda.formatear(Math.max(0, exceso))} tono={exceso > 0 ? 'fuerte' : 'peligro'} />
          </dl>
        )}
        {tocado && faltas.calculo && (
          <p role="alert" className="text-xs text-danger-text">
            {t('errores.sin_exceso')}
          </p>
        )}
        <FormField etiqueta={t('exceso.como')}>
          {(c) =>
            contexto ? (
              <SelectorMetodoPago metodos={opciones} valor={metodo} onValorChange={setMetodo} etiqueta={t('exceso.como')} />
            ) : (
              <p id={c.id} className="text-sm text-fg-muted">
                {t('cargando')}
              </p>
            )
          }
        </FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField etiqueta={t('devolver.procedimiento.calculo')} obligatorio error={tocado && faltas.soportes && calculo.trim().length < 3 ? t('validacion.soporte') : null}>
            <Input value={calculo} onChange={(e) => setCalculo(e.target.value)} maxLength={500} />
          </FormField>
          <FormField etiqueta={t('devolver.procedimiento.certificado')} obligatorio error={tocado && faltas.soportes && certificado.trim().length < 3 ? t('validacion.soporte') : null}>
            <Input value={certificado} onChange={(e) => setCertificado(e.target.value)} maxLength={500} />
          </FormField>
          <FormField etiqueta={t('exceso.solicitud')} obligatorio error={tocado && faltas.soportes && solicitud.trim().length < 3 ? t('validacion.soporte') : null}>
            <Input value={solicitud} onChange={(e) => setSolicitud(e.target.value)} maxLength={500} />
          </FormField>
          <FormField etiqueta={t('exceso.pruebas')} obligatorio error={tocado && faltas.soportes && pruebas.trim().length < 3 ? t('validacion.soporte') : null}>
            <Input value={pruebas} onChange={(e) => setPruebas(e.target.value)} maxLength={500} />
          </FormField>
        </div>
        {clase === 'reteiva' && (
          <FormField
            etiqueta={tR5('exceso.manifestacion')}
            obligatorio
            ayuda={tR5('exceso.manifestacionAyuda')}
            error={tocado && faltas.manifestacion ? t('validacion.soporte') : null}
          >
            <Input value={manifestacion} onChange={(e) => setManifestacion(e.target.value)} maxLength={500} />
          </FormField>
        )}
        {clase === 'reteica' && (
          <CamposPruebasIca pruebas={anticipo?.pruebasIca ?? null} valores={ica} onCambio={setIca} tocado={tocado} />
        )}
        <p className="text-xs text-fg-muted">{tR6('exceso.periodoRegla')}</p>
        <div className="flex items-start gap-2">
          <Checkbox id={idCorreccion} checked={requiereCorreccion} onCheckedChange={(v) => setRequiereCorreccion(v === true)} className="mt-0.5" />
          <Label htmlFor={idCorreccion} className="flex flex-col gap-0.5 font-normal">
            <span className="text-sm text-fg">{t('devolver.procedimiento.requiereCorreccion')}</span>
            <span className="text-xs text-fg-muted">{t('devolver.procedimiento.requiereCorreccionAyuda')}</span>
          </Label>
        </div>
        <FormField etiqueta={t('devolver.motivo')} obligatorio error={tocado && faltas.motivo ? t('validacion.motivo') : null}>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} />
        </FormField>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
