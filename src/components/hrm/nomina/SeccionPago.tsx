'use client';

/**
 * Pago de un período cerrado (Figma 20.22): 1. archivo para el banco (validado: con
 * una fila mala no hay archivo y se listan los hallazgos), 2. marcar como pagado
 * (un egreso por período en Tesorería, confirmación destructiva) y 3. contabilizar
 * (pasa a «contabilizado» si cada colilla tiene sus asientos; si no, dice cuáles
 * faltan y por qué). Con la nómina apagada todo va deshabilitado y se dice por qué.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { BookCheck, Download, FileCheck2, Wallet } from 'lucide-react';
import {
  AvisoTonal,
  CampoFecha,
  ConfirmDialog,
  FilaDato,
  FormField,
  ListaDatos,
  StatusBadge,
  Tarjeta,
  clasesBoton,
} from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import {
  archivoBanco,
  codigoDeError,
  contabilizarPeriodo,
  leerCuentasBancarias,
  pagarPeriodo,
  type CuentaBancaria,
  type DetallePeriodo,
  type ErrorArchivoBanco,
  type PersonaNomina,
} from './apiNomina';
import { estadoPeriodo, type AccionPeriodo, type EstadoAccion } from './nominaLogica';
import { useDinero, useErrorNomina } from './piezasNomina';

export function SeccionPago({
  periodo,
  acciones,
  personas,
  onRecargar,
}: {
  periodo: DetallePeriodo;
  acciones: Record<AccionPeriodo, EstadoAccion>;
  personas: Map<string, PersonaNomina>;
  onRecargar: () => void;
}) {
  const t = useTranslations('hrmNomina.pago');
  const tm = useTranslations('hrmNomina.motivos');
  const dinero = useDinero();
  const mensajeError = useErrorNomina();
  const { getToday } = useFormatDate();
  const p = periodo.periodo;
  const estado = estadoPeriodo(p.status);
  const [hallazgos, setHallazgos] = useState<ErrorArchivoBanco[] | null>(null);
  const [generando, setGenerando] = useState(false);
  const [cuentas, setCuentas] = useState<CuentaBancaria[] | null>(null);
  const [cuenta, setCuenta] = useState('');
  const [fecha, setFecha] = useState(p.payment_date ?? getToday());
  const [referencia, setReferencia] = useState('');
  const [confirmarPago, setConfirmarPago] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [contabilizando, setContabilizando] = useState(false);
  const [faltan, setFaltan] = useState<unknown[] | null>(null);
  const [comisionesPendientes, setComisionesPendientes] = useState<number>(0);

  useEffect(() => {
    if (!acciones.pagar.visible || !acciones.pagar.habilitada || cuentas) return;
    leerCuentasBancarias()
      .then((r) => setCuentas(r.cuentas))
      .catch(() => setCuentas([]));
  }, [acciones.pagar.visible, acciones.pagar.habilitada, cuentas]);

  const motivo = (a: EstadoAccion) => (a.motivo ? tm(a.motivo) : undefined);
  const porPagar = periodo.colillas.filter((c) => c.neto > 0).reduce((s, c) => s + Number(c.neto), 0);

  const generar = async () => {
    setGenerando(true);
    try {
      const r = await archivoBanco(p.id);
      if (!r.ok) {
        setHallazgos(r.errores);
        toast.error(t('archivo.conHallazgos', { n: r.errores.length }));
        return;
      }
      setHallazgos([]);
      const url = URL.createObjectURL(r.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = r.nombre;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('archivo.listo'));
    } catch (e) {
      toast.error(mensajeError(codigoDeError(e)));
    } finally {
      setGenerando(false);
    }
  };

  const cuentaElegida = cuentas?.find((c) => String(c.id) === cuenta) ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        {/* 1. Archivo del banco */}
        <Tarjeta titulo={t('archivo.titulo')} icono={FileCheck2} descripcion={t('archivo.descripcion')}>
          <div className="flex flex-col gap-3">
            <FormField etiqueta={t('archivo.formato')}>
              {(c) => (
                <Select value="csv_generico" disabled>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv_generico">{t('archivo.csvGenerico')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <div>
              <button
                type="button"
                className={clasesBoton({ variante: 'secundario', tamano: 'md' })}
                disabled={!acciones.archivo_banco.habilitada || generando}
                title={motivo(acciones.archivo_banco)}
                onClick={() => void generar()}
              >
                <Download aria-hidden className="size-4" strokeWidth={1.5} />
                {t('archivo.generar')}
              </button>
            </div>
            {!acciones.archivo_banco.visible ? <p className="text-[13px] text-fg-secondary">{t('archivo.sinPermiso')}</p> : null}
            {hallazgos && hallazgos.length > 0 ? (
              <AvisoTonal
                tono="peligro"
                titulo={t('archivo.hallazgosTitulo', { n: hallazgos.length })}
                descripcion={
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {hallazgos.map((h, i) => (
                      <li key={`${h.vinculo_id}-${i}`}>
                        {(h.nombre ?? personas.get(h.vinculo_id)?.nombre ?? '—') + ' · ' + (t.has(`archivo.errores.${h.codigo}`) ? t(`archivo.errores.${h.codigo}`) : h.codigo)}
                      </li>
                    ))}
                  </ul>
                }
              />
            ) : hallazgos ? (
              <AvisoTonal tono="exito" compacto titulo={t('archivo.validado')} />
            ) : null}
          </div>
        </Tarjeta>

        {/* 2. Pago */}
        <Tarjeta titulo={t('pago.titulo')} icono={Wallet} descripcion={t('pago.descripcion')}>
          {estado === 'pagado' || estado === 'contabilizado' ? (
            <AvisoTonal tono="exito" compacto titulo={t('pago.pagado')} />
          ) : !acciones.pagar.visible ? (
            <p className="text-[13px] text-fg-secondary">{t('pago.sinPermiso')}</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField etiqueta={t('pago.cuenta')} obligatorio>
                  {(c) => (
                    <Select value={cuenta} onValueChange={setCuenta} disabled={!acciones.pagar.habilitada}>
                      <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                        <SelectValue placeholder={cuentas === null && acciones.pagar.habilitada ? t('pago.cargandoCuentas') : t('pago.elegirCuenta')} />
                      </SelectTrigger>
                      <SelectContent>
                        {(cuentas ?? []).map((x) => (
                          <SelectItem key={x.id} value={String(x.id)}>
                            {[x.nombre, x.banco, x.ultimos ? `•••• ${x.ultimos}` : null].filter(Boolean).join(' · ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
                <FormField etiqueta={t('pago.fecha')} obligatorio>
                  {(c) => <CampoFecha id={c.id} aria-labelledby={c.idEtiqueta} valor={fecha} onValorChange={setFecha} hoy={getToday()} disabled={!acciones.pagar.habilitada} required />}
                </FormField>
              </div>
              <FormField etiqueta={t('pago.referencia')}>
                {(c) => <Input id={c.id} value={referencia} maxLength={120} onChange={(e) => setReferencia(e.target.value)} disabled={!acciones.pagar.habilitada} className="h-10 border-line-strong bg-surface" />}
              </FormField>
              <div>
                <button
                  type="button"
                  className={clasesBoton({ variante: 'primario', tamano: 'md' })}
                  disabled={!acciones.pagar.habilitada || !cuenta || !fecha || pagando}
                  title={motivo(acciones.pagar)}
                  onClick={() => setConfirmarPago(true)}
                >
                  <Wallet aria-hidden className="size-4" strokeWidth={1.5} />
                  {t('pago.marcar')}
                </button>
              </div>
              {comisionesPendientes > 0 ? <AvisoTonal tono="advertencia" compacto titulo={t('pago.comisionesPendientes', { n: comisionesPendientes })} /> : null}
            </div>
          )}
        </Tarjeta>

        {/* 3. Asiento contable */}
        <Tarjeta titulo={t('asiento.titulo')} icono={BookCheck} descripcion={t('asiento.descripcion')}>
          {estado === 'contabilizado' ? (
            <AvisoTonal tono="exito" compacto titulo={t('asiento.contabilizado')} />
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <button
                  type="button"
                  className={clasesBoton({ variante: 'secundario', tamano: 'md' })}
                  disabled={!acciones.contabilizar.visible || !acciones.contabilizar.habilitada || contabilizando}
                  title={acciones.contabilizar.visible ? motivo(acciones.contabilizar) : t('asiento.despuesDePagar')}
                  onClick={async () => {
                    setContabilizando(true);
                    try {
                      const r = await contabilizarPeriodo(p.id);
                      if (r.contabilizado) {
                        toast.success(t('asiento.listo'));
                        setFaltan(null);
                        onRecargar();
                      } else setFaltan(r.faltan ?? []);
                    } catch (e) {
                      toast.error(mensajeError(codigoDeError(e)));
                    } finally {
                      setContabilizando(false);
                    }
                  }}
                >
                  <BookCheck aria-hidden className="size-4" strokeWidth={1.5} />
                  {t('asiento.contabilizar')}
                </button>
              </div>
              {faltan && faltan.length > 0 ? (
                <AvisoTonal
                  tono="peligro"
                  titulo={t('asiento.faltan', { n: faltan.length })}
                  descripcion={
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {faltan.slice(0, 20).map((x, i) => {
                        const f = (x ?? {}) as Record<string, unknown>;
                        const nombre = typeof f.vinculo_id === 'string' ? personas.get(f.vinculo_id)?.nombre : null;
                        return <li key={i}>{[nombre, f.evento, f.motivo ?? f.error ?? f.codigo].filter(Boolean).map(String).join(' · ') || t('asiento.sinDetalle')}</li>;
                      })}
                    </ul>
                  }
                />
              ) : null}
            </div>
          )}
        </Tarjeta>
      </div>

      <Tarjeta titulo={t('resumen.titulo')}>
        <ListaDatos>
          <FilaDato etiqueta={t('resumen.neto')} valor={dinero(p.total_net)} />
          <FilaDato etiqueta={t('resumen.colillas')} valor={String(periodo.colillas.filter((c) => c.neto > 0).length)} />
          <FilaDato etiqueta={t('resumen.sale')} valor={dinero(porPagar)} tamano="lg" separadorAntes />
        </ListaDatos>
        <p className="mt-3 text-[13px] leading-[18px] text-fg-secondary">{t('resumen.nota')}</p>
        <div className="mt-3">
          <StatusBadge estado={estado} etiqueta={t(`resumen.estados.${estado === 'contabilizado' ? 'contabilizado' : estado === 'pagado' ? 'pagado' : 'porPagar'}`)} tono={estado === 'contabilizado' || estado === 'pagado' ? 'exito' : 'advertencia'} />
        </div>
      </Tarjeta>

      <ConfirmDialog
        abierto={confirmarPago}
        onAbiertoChange={setConfirmarPago}
        tono="peligro"
        icono={Wallet}
        titulo={t('confirmar.titulo')}
        descripcion={t('confirmar.descripcion', {
          total: dinero(porPagar),
          cuenta: cuentaElegida ? [cuentaElegida.nombre, cuentaElegida.ultimos ? `•••• ${cuentaElegida.ultimos}` : null].filter(Boolean).join(' ') : '—',
        })}
        textoConfirmar={t('confirmar.confirmar')}
        cargando={pagando}
        onConfirmar={async () => {
          setPagando(true);
          try {
            const r = await pagarPeriodo(p.id, { cuenta_bancaria_id: Number(cuenta), fecha, referencia: referencia.trim() || null });
            toast.success(t('confirmar.hecho', { total: dinero(r.total) }));
            setComisionesPendientes(r.comisiones_pendientes.length);
            setConfirmarPago(false);
            onRecargar();
          } catch (e) {
            toast.error(mensajeError(codigoDeError(e)));
          } finally {
            setPagando(false);
          }
        }}
      >
        <ul className="list-disc space-y-1 pl-5 text-[13px] leading-[18px] text-fg-secondary">
          <li>{t('confirmar.c1')}</li>
          <li>{t('confirmar.c2')}</li>
        </ul>
      </ConfirmDialog>
    </div>
  );
}
