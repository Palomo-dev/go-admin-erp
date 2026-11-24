'use client';

/**
 * Hoja «Recibir dinero» (Figma 2803:13326): lo que cobró un domiciliario entra a la caja abierta de
 * la sede.
 *
 * Por medio (efectivo · datáfono · transferencia) se ve lo esperado, se escribe lo contado y se ve
 * la diferencia. Si no cuadra, motivo, nota y responsable. «Recibir y cerrar cuadre»:
 *   1. `logistica_cuadre_abrir` (si aún no hay cuadre abierto) — exige caja abierta en la sede;
 *   2. `logistica_cuadre_recibir_y_cerrar` (UNA transacción): recibe cada envío con lo contado
 *      repartido entre sus líneas (`repartirContado`) —efectivo a la caja, datáfono a 13802001,
 *      transferencia al banco (`fn_cuenta_cobro`)— y cierra con motivo y responsable si hay
 *      faltante (sin asiento: `pending_accountant`).
 * Si algo falla, la base no deja nada a medias (ni cobros sueltos ni cuadre a medio recibir). Si la
 * respuesta se pierde y se reintenta, la RPC ve el cuadre cerrado y devuelve su resumen sin cobrar
 * otra vez; las líneas recibidas en intentos anteriores (RPC de una línea) se omiten.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { HandCoins, Wallet } from 'lucide-react';
import { AvisoTonal, CampoNumero, ChipsOpcion, FormField, PanelAdaptable, StatusBadge, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase/config';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { RESPONSABLES_DIFERENCIA, type Cuadre, type LineaCuadre, type ResponsableDiferencia } from '@/lib/logistica/cuadre';
import {
  GRUPOS_MEDIO,
  MOTIVOS_DIFERENCIA,
  diferenciasContado,
  faltanteRecibir,
  metodoCajaDeReportado,
  repartirContado,
  resumenPorMedio,
  textoMotivo,
  type FilaCuadre,
  type GrupoMedio,
  type MotivoDiferencia,
} from '@/lib/logistica/cuadresVista';
import { CuadreError, abrirCuadre, recibirYCerrarCuadre } from '@/lib/services/logistica/cuadresDomiciliarioService';
import { cn } from '@/utils/Utils';

/** Línea para la hoja: la del cuadre o, antes de abrirlo, el envío cobrado. */
export type LineaHoja = Pick<LineaCuadre, 'id' | 'shipment_id' | 'source_type' | 'source_id' | 'esperado' | 'reportado' | 'metodo_reportado' | 'recibido' | 'status'> & {
  numero?: string | null;
};

export interface CajaAbierta {
  id: number;
  opened_at: string;
}

export interface RecibirDineroHojaProps {
  abierta: boolean;
  onAbiertaChange: (v: boolean) => void;
  fila: FilaCuadre | null;
  organizationId: number;
  nombreDomiciliario: string;
  nombreSede: string;
  /** Líneas de partida: las del cuadre abierto o los envíos cobrados sin cuadre. */
  lineasIniciales: LineaHoja[];
  caja: CajaAbierta | null | undefined;
  onTerminado: (c: Cuadre) => void;
}

const VISIBLES = 3;

export function RecibirDineroHoja({ abierta, onAbiertaChange, fila, organizationId, nombreDomiciliario, nombreSede, lineasIniciales, caja, onTerminado }: RecibirDineroHojaProps) {
  const t = useTranslations('logistica.cuadres.recibir');
  const tc = useTranslations('logistica.cuadres');
  const moneda = useMonedaOrganizacion();
  const { formatTime } = useFormatDate(fila?.branchId ?? null);

  const [lineas, setLineas] = useState<LineaHoja[]>(lineasIniciales);
  const [cuadreId, setCuadreId] = useState<string | null>(fila?.cuadreId ?? null);
  const [contado, setContado] = useState<Partial<Record<GrupoMedio, number | null>>>({});
  const [motivo, setMotivo] = useState<MotivoDiferencia | null>(null);
  const [nota, setNota] = useState('');
  const [responsable, setResponsable] = useState<ResponsableDiferencia | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const [procesando, setProcesando] = useState<{ hechas: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const resumen = useMemo(() => resumenPorMedio(lineas), [lineas]);

  useEffect(() => {
    if (!abierta) return;
    setLineas(lineasIniciales);
    setCuadreId(fila?.cuadreId ?? null);
    const inicial: Partial<Record<GrupoMedio, number | null>> = {};
    for (const r of resumenPorMedio(lineasIniciales)) if (r.envios > 0) inicial[r.grupo] = r.reportado;
    setContado(inicial);
    setMotivo(null);
    setNota('');
    setResponsable(null);
    setVerTodos(false);
    setIntentado(false);
    setError(null);
    setAviso(null);
  }, [abierta, lineasIniciales, fila?.cuadreId]);

  const contadoNumerico = Object.fromEntries(Object.entries(contado).map(([k, v]) => [k, v ?? NaN])) as Partial<Record<GrupoMedio, number>>;
  const dif = diferenciasContado(resumen, contadoNumerico);
  const reparto = repartirContado(lineas, contadoNumerico);
  const pendientes = lineas.filter((l) => l.status === 'pending').length;
  const faltante = faltanteRecibir({ diferencia: dif.total, motivo, nota, responsable, cajaAbierta: !!caja, lineas: pendientes });
  const efectivo = contado.efectivo ?? 0;
  const datafono = contado.datafono ?? 0;
  const etiquetaMotivo = motivo ? t(`motivos.${motivo}`) : '';

  const confirmar = async () => {
    setIntentado(true);
    setError(null);
    setAviso(null);
    if (faltante || !reparto.ok) return;
    try {
      // 1. Abrir (o retomar) el cuadre: la base trae las líneas reales.
      let cuadre: Cuadre | null = null;
      let id = cuadreId;
      if (!id) {
        cuadre = await abrirCuadre(supabase, { organizationId, branchId: fila!.branchId, driverId: fila!.driverId });
        id = cuadre.settlement_id;
        setCuadreId(id);
        const reales: LineaHoja[] = cuadre.lineas.map((l) => ({ ...l, numero: lineas.find((x) => x.shipment_id === l.shipment_id)?.numero ?? null }));
        const esperadoAntes = lineas.reduce((s, l) => s + Math.round(l.esperado * 100), 0);
        const esperadoReal = reales.reduce((s, l) => s + Math.round(l.esperado * 100), 0);
        setLineas(reales);
        if (reales.length !== lineas.length || esperadoAntes !== esperadoReal) {
          // Entraron cobros nuevos entre la lectura y la apertura: que la persona vuelva a contar.
          const inicial: Partial<Record<GrupoMedio, number | null>> = {};
          for (const r of resumenPorMedio(reales)) if (r.envios > 0) inicial[r.grupo] = r.reportado;
          setContado(inicial);
          setAviso(t('lineasNuevas'));
          return;
        }
      }
      const actuales = cuadre ? (cuadre.lineas as LineaHoja[]) : lineas;
      const plan = repartirContado(actuales, contadoNumerico);
      if (!plan.ok) return;

      // 2. Recibir todas las líneas y cerrar en UNA transacción (la RPC cobra en la caja con lo que
      //    ya existe; con diferencia, motivo y responsable; sin asiento: pendiente del Contador).
      const motivoLinea = textoMotivo(etiquetaMotivo, nota);
      const conDiferencia = Math.round(dif.total * 100) !== 0;
      setProcesando({ hechas: 0, total: plan.recibos.length });
      const cerrado = await recibirYCerrarCuadre(supabase, {
        settlementId: id!,
        recibos: plan.recibos.map((r) => {
          const linea = actuales.find((l) => l.id === r.lineaId)!;
          return {
            linea: { id: linea.id, esperado: linea.esperado, source_type: linea.source_type, source_id: linea.source_id },
            metodo: metodoCajaDeReportado(linea.metodo_reportado),
            monto: r.monto,
            motivoDiferencia: r.faltante ? motivoLinea : null,
          };
        }),
        motivo: conDiferencia ? motivoLinea : null,
        responsable: conDiferencia ? responsable : null,
        detalleResponsable: conDiferencia && nota.trim() ? nota.trim() : null,
      });
      setLineas(cerrado.lineas.map((l) => ({ ...l, numero: lineas.find((x) => x.shipment_id === l.shipment_id)?.numero ?? null })));
      setProcesando({ hechas: plan.recibos.length, total: plan.recibos.length });
      onTerminado(cerrado);
    } catch (err) {
      const codigo = err instanceof CuadreError ? err.codigo : 'ERROR';
      setError(tc.has(`errores.${codigo}`) ? tc(`errores.${codigo}`) : tc('errores.ERROR'));
    } finally {
      setProcesando(null);
    }
  };

  const ocupado = procesando !== null;
  const visibles = verTodos ? lineas : lineas.slice(0, VISIBLES);
  const motivoBloqueo =
    faltante === 'sin_caja' ? t('bloqueos.sinCaja') : faltante === 'sin_lineas' ? t('bloqueos.sinLineas') : !reparto.ok && reparto.error === 'SOBRANTE' ? t('bloqueos.sobrante') : undefined;

  return (
    <PanelAdaptable
      abierto={abierta}
      onAbiertoChange={(v) => !ocupado && onAbiertaChange(v)}
      titulo={t('titulo', { nombre: nombreDomiciliario })}
      descripcion={t('descripcion', { n: lineas.length, sede: nombreSede })}
      icono={HandCoins}
      ancho={560}
      ocupado={ocupado}
      bloquearClicFuera={ocupado}
      pie={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col text-sm">
            <span className="font-medium text-fg">{caja ? t('pie.entranACaja', { caja: caja.id, monto: moneda.formatear(efectivo) }) : t('pie.sinCaja')}</span>
            {datafono > 0 && <span className="text-xs text-fg-muted">{t('pie.datafono', { monto: moneda.formatear(datafono) })}</span>}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => onAbiertaChange(false)} disabled={ocupado} className={clasesBoton({ variante: 'secundario' })}>
              {t('cancelar')}
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={ocupado || !!motivoBloqueo}
              title={motivoBloqueo}
              aria-busy={ocupado}
              className={clasesBoton()}
            >
              {procesando ? t('procesando', { hechas: procesando.hechas, total: procesando.total }) : t('confirmar')}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {error && <AvisoTonal tono="peligro" compacto titulo={error} rol="alert" />}
        {aviso && <AvisoTonal tono="advertencia" compacto titulo={aviso} rol="status" />}

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">{t('entraALaCaja')}</h3>
          {caja ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line-success bg-success-subtle px-4 py-3">
              <span className="flex min-w-0 items-center gap-3">
                <Wallet aria-hidden="true" className="size-5 shrink-0 text-success-text" strokeWidth={1.5} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium text-fg">{t('caja', { caja: caja.id, sede: nombreSede })}</span>
                  <span className="text-xs text-fg-secondary">{t('cajaAbierta', { hora: formatTime(caja.opened_at) })}</span>
                </span>
              </span>
              <StatusBadge estado="open" etiqueta={t('abierta')} tono="exito" apariencia="contorno" />
            </div>
          ) : caja === null ? (
            <AvisoTonal tono="advertencia" compacto titulo={t('bloqueos.sinCaja')} descripcion={t('sinCajaAyuda')} />
          ) : (
            <div className="h-14 animate-pulse rounded-xl bg-subtle" aria-hidden="true" />
          )}
        </section>

        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('tabla.etiqueta')}</caption>
            <thead className="bg-subtle text-left text-xs text-fg-secondary">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">{t('tabla.medio')}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t('tabla.esperado')}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t('tabla.contado')}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t('tabla.diferencia')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {GRUPOS_MEDIO.map((g) => {
                const r = resumen.find((x) => x.grupo === g)!;
                const d = dif.porGrupo[g];
                return (
                  <tr key={g}>
                    <th scope="row" className="px-3 py-2 text-left font-normal text-fg">
                      {t(`medios.${g}`, { n: r.envios })}
                    </th>
                    <td className="px-3 py-2 text-right text-fg">{moneda.formatear(r.esperado)}</td>
                    <td className="px-3 py-2 text-right">
                      {r.envios > 0 ? (
                        <CampoNumero
                          valor={contado[g] ?? null}
                          onValorChange={(v) => setContado((c) => ({ ...c, [g]: v }))}
                          minimo={0}
                          alinear="derecha"
                          tamano="sm"
                          disabled={ocupado}
                          aria-label={t('tabla.contadoDe', { medio: t(`medios.${g}`, { n: r.envios }) })}
                          className="ml-auto w-32"
                        />
                      ) : (
                        <span className="text-fg-muted">{moneda.formatear(0)}</span>
                      )}
                    </td>
                    <td className={cn('px-3 py-2 text-right', d < 0 ? 'text-danger-text' : d > 0 ? 'text-warning-text' : 'text-fg-secondary')}>
                      {d < 0 ? t('faltan', { monto: moneda.formatear(-d) }) : d > 0 ? t('sobran', { monto: moneda.formatear(d) }) : moneda.formatear(0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!reparto.ok && reparto.error === 'SOBRANTE' && <AvisoTonal tono="advertencia" compacto titulo={t('bloqueos.sobrante')} descripcion={t('sobranteAyuda')} />}

        {Math.round(dif.total * 100) < 0 && (
          <section className="flex flex-col gap-3 rounded-xl border border-line-danger bg-danger-subtle p-4">
            <h3 className="text-base font-semibold text-fg">{t('diferencia.titulo')}</h3>
            <FormField etiqueta={t('diferencia.motivo')} obligatorio error={intentado && faltante === 'motivo' ? t('diferencia.faltaMotivo') : null}>
              {(c) => (
                <Select value={motivo ?? undefined} onValueChange={(v) => setMotivo(v as MotivoDiferencia)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-invalid={c['aria-invalid']} className="h-10 border-line-strong bg-surface">
                    <SelectValue placeholder={t('diferencia.elegirMotivo')} />
                  </SelectTrigger>
                  <SelectContent>
                    {MOTIVOS_DIFERENCIA.map((m) => (
                      <SelectItem key={m} value={m}>
                        {t(`motivos.${m}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('diferencia.nota')} obligatorio={motivo === 'otro'} error={intentado && faltante === 'nota' ? t('diferencia.faltaNota') : null}>
              <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} className="bg-surface" />
            </FormField>
            <div className="flex flex-col gap-1.5">
              <span id="cuadre-responsable" className="text-sm font-medium text-fg">
                {t('diferencia.responsable')}
              </span>
              <ChipsOpcion<ResponsableDiferencia>
                aria-labelledby="cuadre-responsable"
                valor={responsable}
                onValorChange={setResponsable}
                opciones={RESPONSABLES_DIFERENCIA.map((r) => ({ valor: r, etiqueta: t(`responsables.${r}`) }))}
              />
              {intentado && faltante === 'responsable' && (
                <p role="alert" className="text-sm text-danger-text">
                  {t('diferencia.faltaResponsable')}
                </p>
              )}
            </div>
            <p className="text-xs text-fg-secondary">{t('diferencia.sinAsiento')}</p>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="text-base font-semibold text-fg">{t('envios', { n: lineas.length })}</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {visibles.map((l) => (
              <li key={l.id} className="flex justify-between gap-3">
                <span className="text-fg-secondary">
                  {[l.numero, l.metodo_reportado ? tc(`medioReportado.${l.metodo_reportado}`) : null].filter(Boolean).join(' · ')}
                </span>
                <span className="text-fg">{moneda.formatear(l.status === 'pending' ? l.reportado ?? l.esperado : l.recibido ?? 0)}</span>
              </li>
            ))}
          </ul>
          {lineas.length > VISIBLES && (
            <button type="button" onClick={() => setVerTodos((v) => !v)} className="self-end text-sm font-medium text-link hover:underline">
              {verTodos ? t('verMenos') : t('verTodos', { n: lineas.length - VISIBLES })}
            </button>
          )}
        </section>
      </div>
    </PanelAdaptable>
  );
}
