'use client';

/**
 * «Registrar abono» de un procesador de pago (Figma «07 Finanzas» 2705:150495,
 * 2705:150725 y 2705:150924). Se copian los valores del extracto; a la derecha, el
 * cuadre en vivo y el asiento que se va a generar.
 *
 * Reglas del Contador (2026-11-21):
 * - no deja guardar si bruto ≠ neto + comisión + IVA de la comisión + retenciones;
 * - la factura del procesador es obligatoria solo cuando el IVA va al descontable;
 * - el tratamiento del IVA no se elige: sale del perfil tributario y del origen del
 *   procesador (exterior → pendiente por reverse charge).
 * La base vuelve a validar todo (`fn_procesador_abono_registrar`).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDownCircle } from 'lucide-react';
import { AvisoTonal, CampoFecha, CampoNumero, Dialogo, FormField } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastSuccess } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import {
  cuadreAbono,
  erroresAbono,
  facturaObligatoria,
  tratamientoDelIva,
  type CodigoProcesador,
  type RespuestaProcesadores,
} from '@/lib/finanzas/procesadoresPago/procesadoresLogica';

const NS = 'finanzasProcesadores';
export const RUTA_API_ABONOS = '/api/finanzas/procesadores-pago/abonos';

function cabeceras(): HeadersInit {
  const org = getOrganizationId();
  return { 'Content-Type': 'application/json', ...(org > 0 ? { 'x-organization-id': String(org) } : {}) };
}

function nuevaSolicitud(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export interface AbonoProcesadorDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  datos: RespuestaProcesadores;
  /** Día de hoy en la zona de la organización (`YYYY-MM-DD`). */
  hoy: string;
  procesadorInicial?: CodigoProcesador | null;
  onRegistrado: () => void;
}

export function AbonoProcesadorDialog({ abierto, onAbiertoChange, datos, hoy, procesadorInicial, onRegistrado }: AbonoProcesadorDialogProps) {
  const t = useTranslations(NS);
  const fmt = useMonedaOrganizacion().formatear;

  const [procesador, setProcesador] = useState<CodigoProcesador | null>(procesadorInicial ?? null);
  const [fecha, setFecha] = useState(hoy);
  const [banco, setBanco] = useState<number | null>(datos.bancos[0]?.id ?? null);
  const [bruto, setBruto] = useState<number | null>(null);
  const [neto, setNeto] = useState<number | null>(null);
  const [comision, setComision] = useState<number | null>(null);
  const [iva, setIva] = useState<number | null>(null);
  const [rf, setRf] = useState<number | null>(null);
  const [riva, setRiva] = useState<number | null>(null);
  const [rica, setRica] = useState<number | null>(null);
  const [factura, setFactura] = useState('');
  const [referencia, setReferencia] = useState('');
  const [solicitud, setSolicitud] = useState(nuevaSolicitud);
  const [guardando, setGuardando] = useState(false);
  const [errorBase, setErrorBase] = useState<string | null>(null);
  const [intentado, setIntentado] = useState(false);

  // Cada apertura es un abono nuevo (y una solicitud nueva).
  useEffect(() => {
    if (!abierto) return;
    setProcesador(procesadorInicial ?? null);
    setFecha(hoy);
    setBanco(datos.bancos[0]?.id ?? null);
    setBruto(null);
    setNeto(null);
    setComision(null);
    setIva(null);
    setRf(null);
    setRiva(null);
    setRica(null);
    setFactura('');
    setReferencia('');
    setSolicitud(nuevaSolicitud());
    setErrorBase(null);
    setIntentado(false);
  }, [abierto, procesadorInicial, hoy, datos.bancos]);

  const proc = datos.procesadores.find((p) => p.codigo === procesador) ?? null;
  const saldo = datos.saldos.find((s) => s.procesador === procesador)?.saldo ?? null;
  const valores = { bruto, neto, comision, ivaComision: iva, retencionFuente: rf, retencionIva: riva, retencionIca: rica };
  const cuadre = cuadreAbono(valores);
  const tratamiento = tratamientoDelIva(proc?.origen ?? 'nacional', datos.responsableIva, iva);
  const exigeFactura = facturaObligatoria(tratamiento);
  const errores = erroresAbono(valores, { procesador, fecha, factura, nit: proc?.nit ?? null, tratamiento });
  const hay = (e: (typeof errores)[number]) => errores.includes(e);
  const mostrar = (e: (typeof errores)[number]) => hay(e) && (intentado || e === 'descuadre' || e === 'nit' || e === 'perfil');

  const bancoSel = datos.bancos.find((b) => b.id === banco) ?? null;
  const lineasAsiento = useMemo(() => {
    if (!proc) return [];
    const ivaDesc = tratamiento === 'descontable' ? cuadre.ivaComision : 0;
    return [
      { lado: 'D' as const, cuenta: bancoSel?.cuenta ?? '1110', nombre: bancoSel?.nombre ?? t('abono.asiento.banco'), valor: cuadre.netoCalculado },
      { lado: 'D' as const, cuenta: '53051501', nombre: t('abono.asiento.comision'), valor: cuadre.comision + cuadre.ivaComision - ivaDesc },
      { lado: 'D' as const, cuenta: '24081001', nombre: t('abono.asiento.ivaDescontable'), valor: ivaDesc },
      { lado: 'D' as const, cuenta: '13551501', nombre: t('abono.asiento.retefuente'), valor: Math.round(rf ?? 0) },
      { lado: 'D' as const, cuenta: '13551701', nombre: t('abono.asiento.reteiva'), valor: Math.round(riva ?? 0) },
      { lado: 'D' as const, cuenta: '13551801', nombre: t('abono.asiento.reteica'), valor: Math.round(rica ?? 0) },
      { lado: 'C' as const, cuenta: proc.cuenta, nombre: proc.etiqueta, valor: cuadre.bruto },
    ].filter((l) => l.valor > 0);
  }, [proc, bancoSel, cuadre, tratamiento, rf, riva, rica, t]);

  const guardar = async () => {
    setIntentado(true);
    setErrorBase(null);
    if (errores.length > 0 || !procesador) return;
    setGuardando(true);
    try {
      const r = await fetch(RUTA_API_ABONOS, {
        method: 'POST',
        credentials: 'same-origin',
        headers: cabeceras(),
        body: JSON.stringify({
          solicitud,
          procesador,
          fecha,
          bruto: cuadre.bruto,
          neto: cuadre.neto,
          comision: cuadre.comision,
          iva_comision: cuadre.ivaComision,
          retencion_fuente: Math.round(rf ?? 0),
          retencion_iva: Math.round(riva ?? 0),
          retencion_ica: Math.round(rica ?? 0),
          cuenta_bancaria: banco,
          factura_comision: factura.trim() || null,
          referencia: referencia.trim() || null,
          notas: null,
        }),
      });
      if (!r.ok) {
        const cuerpo = (await r.json().catch(() => ({}))) as { codigo?: string };
        const codigo = cuerpo.codigo && t.has(`errores.${cuerpo.codigo}`) ? cuerpo.codigo : 'DESCONOCIDO';
        setErrorBase(t(`errores.${codigo}`));
        return;
      }
      toastSuccess(t('abono.registrado', { procesador: proc?.etiqueta ?? '' }));
      onAbiertoChange(false);
      onRegistrado();
    } catch {
      setErrorBase(t('errores.DESCONOCIDO'));
    } finally {
      setGuardando(false);
    }
  };

  const campoDinero = (etiqueta: string, valor: number | null, set: (v: number | null) => void, opts?: { obligatorio?: boolean; error?: string | null; ayuda?: string }) => (
    <FormField etiqueta={etiqueta} obligatorio={opts?.obligatorio} error={opts?.error ?? null} ayuda={opts?.ayuda}>
      {(c) => <CampoNumero {...c} valor={valor} onValorChange={set} prefijo="$" decimales={0} minimo={0} />}
    </FormField>
  );

  const textoTratamiento = {
    descontable: t('abono.iva.descontable'),
    gasto: t('abono.iva.gasto'),
    proporcional: t('abono.iva.descontable'),
    exterior: t('abono.iva.exterior'),
    sin_iva: t('abono.iva.sinIva'),
    sin_perfil: t('abono.iva.sinPerfil'),
  }[tratamiento];

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={proc ? t('abono.tituloDe', { procesador: proc.etiqueta }) : t('abono.titulo')}
      descripcion={t('abono.descripcion')}
      icono={ArrowDownCircle}
      ancho={880}
      primario={{
        etiqueta: t('abono.registrar'),
        onClick: () => void guardar(),
        cargando: guardando,
        deshabilitada: intentado && errores.length > 0,
        motivo: intentado && errores.length > 0 ? t('abono.corregir') : undefined,
      }}
      textoCancelar={t('acciones.cancelar')}
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField etiqueta={t('abono.procesador')} obligatorio error={mostrar('procesador') ? t('abono.validacion.procesador') : null}>
              {(c) => (
                <Select value={procesador ?? ''} onValueChange={(v) => setProcesador(v as CodigoProcesador)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-invalid={c['aria-invalid']} className="h-10 border-line-strong bg-surface">
                    <SelectValue placeholder={t('abono.elegirProcesador')} />
                  </SelectTrigger>
                  <SelectContent>
                    {datos.procesadores.map((p) => (
                      <SelectItem key={p.codigo} value={p.codigo}>
                        {p.etiqueta}
                        {p.origen === 'exterior' ? ` · ${t('origen.exterior')}` : p.nit ? ` · ${t('nitCorto', { nit: p.nit })}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('abono.fecha')} obligatorio error={mostrar('fecha') ? t('abono.validacion.fecha') : null}>
              {(c) => <CampoFecha {...c} valor={fecha} onValorChange={setFecha} max={hoy} hoy={hoy} />}
            </FormField>
          </div>

          {mostrar('nit') && proc && (
            <AvisoTonal tono="peligro" compacto titulo={t('abono.validacion.nit', { procesador: proc.etiqueta })} />
          )}

          <FormField etiqueta={t('abono.banco')} obligatorio ayuda={datos.bancos.length === 0 ? t('abono.sinBancos') : undefined}>
            {(c) => (
              <Select value={banco ? String(banco) : ''} onValueChange={(v) => setBanco(Number(v))} disabled={datos.bancos.length === 0}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue placeholder={t('abono.elegirBanco')} />
                </SelectTrigger>
                <SelectContent>
                  {datos.bancos.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {[b.nombre, b.final ? `··${b.final}` : null].filter(Boolean).join(' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
            {campoDinero(t('abono.bruto'), bruto, setBruto, { obligatorio: true, error: mostrar('bruto') ? t('abono.validacion.bruto') : null })}
            {campoDinero(t('abono.neto'), neto, setNeto, {
              obligatorio: true,
              error: mostrar('neto') ? t('abono.validacion.neto') : mostrar('descuadre') ? t('abono.validacion.descuadre', { calculado: fmt(cuadre.netoCalculado) }) : null,
            })}
          </div>

          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold text-fg">{t('abono.descuentos')}</h3>
            <p className="text-xs text-fg-secondary">{t('abono.descuentosAyuda')}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {campoDinero(t('abono.comision'), comision, setComision)}
            {campoDinero(t('abono.ivaComision'), iva, setIva)}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {campoDinero(t('abono.retencionFuente'), rf, setRf)}
            {campoDinero(t('abono.retencionIva'), riva, setRiva)}
            {campoDinero(t('abono.retencionIca'), rica, setRica)}
          </div>

          {proc && (
            <div
              className={
                tratamiento === 'exterior'
                  ? 'flex flex-col items-start gap-1.5 rounded-lg border border-line-info bg-info-subtle px-3 py-2.5'
                  : 'flex flex-col items-start gap-1.5 rounded-lg border border-line bg-subtle px-3 py-2.5'
              }
            >
              <Badge tono={tratamiento === 'exterior' ? 'informacion' : tratamiento === 'sin_perfil' ? 'advertencia' : 'marca'} apariencia="suave" tamano="sm">
                {t(`abono.ivaInsignia.${tratamiento}`)}
              </Badge>
              <p className="text-xs text-fg-secondary">{textoTratamiento}</p>
            </div>
          )}

          <FormField
            etiqueta={exigeFactura ? t('abono.factura') : t('abono.facturaOpcional')}
            obligatorio={exigeFactura}
            error={mostrar('factura') ? t('abono.validacion.factura') : null}
            ayuda={exigeFactura ? t('abono.facturaAyuda') : t('abono.facturaOpcionalAyuda')}
          >
            {(c) => <Input {...c} value={factura} onChange={(e) => setFactura(e.target.value)} maxLength={60} placeholder={t('abono.facturaEjemplo')} className="h-10" />}
          </FormField>
          <FormField etiqueta={t('abono.referencia')}>
            {(c) => <Input {...c} value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={120} className="h-10" />}
          </FormField>

          {errorBase && <AvisoTonal tono="peligro" rol="alert" titulo={errorBase} />}
        </div>

        <aside className="flex flex-col gap-4" aria-label={t('abono.cuadre.titulo')}>
          <section
            className={`flex flex-col gap-2 rounded-xl border p-4 ${cuadre.neto !== null && !cuadre.cuadra ? 'border-line-danger' : cuadre.cuadra ? 'border-line-success' : 'border-line'}`}
            aria-live="polite"
          >
            <h3 className="text-sm font-semibold text-fg">{t('abono.cuadre.titulo')}</h3>
            <FilaCuadre etiqueta={t('abono.cuadre.bruto')} valor={fmt(cuadre.bruto)} />
            <FilaCuadre etiqueta={t('abono.cuadre.comision')} valor={fmt(cuadre.comision)} />
            <FilaCuadre etiqueta={t('abono.cuadre.iva')} valor={fmt(cuadre.ivaComision)} />
            <FilaCuadre etiqueta={t('abono.cuadre.retenciones')} valor={fmt(cuadre.retenciones)} />
            <hr className="border-line" />
            <FilaCuadre etiqueta={t('abono.cuadre.calculado')} valor={fmt(cuadre.netoCalculado)} fuerte />
            <FilaCuadre etiqueta={t('abono.cuadre.banco')} valor={cuadre.neto === null ? '—' : fmt(cuadre.neto)} fuerte peligro={cuadre.neto !== null && !cuadre.cuadra} />
            {cuadre.neto !== null && (
              <p className={`rounded-md px-2.5 py-1.5 text-sm font-semibold ${cuadre.cuadra ? 'bg-success-subtle text-success-text' : 'bg-danger-subtle text-danger-text'}`}>
                {cuadre.cuadra ? t('abono.cuadre.cuadra') : t('abono.cuadre.diferencia', { valor: fmt(Math.abs(cuadre.diferencia)) })}
              </p>
            )}
            {cuadre.neto !== null && !cuadre.cuadra && <p className="text-xs text-danger-text">{t('abono.cuadre.regla')}</p>}
          </section>

          {cuadre.cuadra && lineasAsiento.length > 0 && (
            <section className="flex flex-col gap-1.5 rounded-xl border border-line bg-subtle p-4">
              <h3 className="text-sm font-semibold text-fg">{t('abono.asiento.titulo')}</h3>
              <ul className="flex flex-col gap-1.5">
                {lineasAsiento.map((l) => (
                  <li key={`${l.lado}-${l.cuenta}`} className="flex items-start gap-2 text-xs">
                    <span className={`font-semibold ${l.lado === 'D' ? 'text-info-text' : 'text-brand-deep'}`}>{l.lado}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium text-fg">{l.cuenta}</span>
                      <span className="truncate text-fg-secondary">{l.nombre}</span>
                    </span>
                    <span className="tabular-nums text-fg">{fmt(l.valor)}</span>
                  </li>
                ))}
              </ul>
              {saldo !== null && (
                <p className="text-xs text-fg-secondary">{t('abono.asiento.saldo', { antes: fmt(saldo), despues: fmt(saldo - cuadre.bruto) })}</p>
              )}
              {tratamiento === 'exterior' && cuadre.comision + cuadre.ivaComision > 0 && (
                <p className="text-xs text-fg-secondary">{t('abono.asiento.pendienteExterior', { valor: fmt(cuadre.comision + cuadre.ivaComision) })}</p>
              )}
            </section>
          )}
        </aside>
      </div>
    </Dialogo>
  );
}

function FilaCuadre({ etiqueta, valor, fuerte, peligro }: { etiqueta: string; valor: string; fuerte?: boolean; peligro?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-fg-secondary">{etiqueta}</span>
      <span className={`tabular-nums ${fuerte ? 'font-semibold' : ''} ${peligro ? 'text-danger-text' : 'text-fg'}`}>{valor}</span>
    </div>
  );
}
