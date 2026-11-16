'use client';

/**
 * Registrar una incapacidad o una licencia de ley (Figma 20.14.2 y 20.14.5,
 * `96-hrm-f2-14-02-*` y `14-05-*`).
 *
 * - Incapacidad: origen común o laboral, prórroga de otra (los tramos siguen la
 *   cadena), diagnóstico opcional y soporte en el grupo sensible «salud» (se sube al
 *   expediente al guardar) y la tabla de tramos de pago que devuelve la base.
 * - Licencias: maternidad (fecha probable de parto, 18 semanas), paternidad y luto. El
 *   luto sigue «por confirmar» por el Contador: se dice así y no limita.
 * Las duraciones y quién paga salen de los parámetros por vigencia (`duraciones`).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { FileText, Lock, Paperclip, X } from 'lucide-react';
import { AvisoTonal, CampoFecha, Dialogo, FilaDato, FormField, ListaDatos, SegmentedControl, Skeleton } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addPlainDays } from '@/lib/utils/dateCore';
import { TAMANO_MAXIMO_DOCUMENTO, TIPOS_DOCUMENTO_PERMITIDOS } from '@/lib/services/hrm/tipos';
import { ErrorPersonas } from '../personas/apiPersonas';
import { registrarAusencia, subirSoporteSuelto, type DatosAusencia } from './apiAusencias';
import { diasDelTramo, esPagador, licenciaMaternidad, partirDiagnostico, porcentaje, type FilaAusencia, type ListaAusencias } from './ausenciasLogica';
import { useFechas } from './piezasAusencias';
import { SelectorPersona, useEmpleadosVigentes } from './SelectorPersona';
import { claveError, useSimulacion } from './useSimulacion';

export type TipoRegistro = 'incapacidad' | 'LMA' | 'LPA' | 'LUT';

export interface PrellenadoRegistro {
  vinculo_id: string;
  persona_id: string | null;
  nombre: string | null;
  origen: 'comun' | 'laboral';
  prorroga_de: string;
  desde: string;
}

export interface DialogoRegistrarAusenciaProps {
  abierto: boolean;
  onAbiertoChange: (a: boolean) => void;
  hoy: string;
  datos: ListaAusencias | null;
  /** «Agregar prórroga»: persona, origen y día siguiente ya puestos. */
  prellenado?: PrellenadoRegistro | null;
  onHecho: () => void;
}

export function DialogoRegistrarAusencia({ abierto, onAbiertoChange, hoy, datos, prellenado, onHecho }: DialogoRegistrarAusenciaProps) {
  const t = useTranslations('hrmAusencias.registrar');
  const ta = useTranslations('hrmAusencias');
  const te = useTranslations('hrmAusencias');
  const f = useFechas();
  const empleados = useEmpleadosVigentes(abierto && !prellenado);
  const [tipo, setTipo] = useState<TipoRegistro>('incapacidad');
  const [vinculo, setVinculo] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [parto, setParto] = useState('');
  const [origen, setOrigen] = useState<'comun' | 'laboral'>('comun');
  const [esProrroga, setEsProrroga] = useState(false);
  const [prorrogaDe, setProrrogaDe] = useState('');
  const [diagnostico, setDiagnostico] = useState('');
  const [entidad, setEntidad] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!abierto) return;
    setTipo('incapacidad');
    setVinculo(prellenado?.vinculo_id ?? '');
    setDesde(prellenado?.desde ?? '');
    setHasta('');
    setParto('');
    setOrigen(prellenado?.origen ?? 'comun');
    setEsProrroga(!!prellenado);
    setProrrogaDe(prellenado?.prorroga_de ?? '');
    setDiagnostico('');
    setEntidad('');
    setArchivo(null);
  }, [abierto, prellenado]);

  const semanas = (c: 'maternidad' | 'paternidad') => Number(datos?.duraciones?.[c]?.valor ?? (c === 'maternidad' ? 18 : 2));
  const luto = datos?.duraciones?.luto ?? null;
  const lutoPorConfirmar = !luto || luto.status !== 'vigente';
  const esLicencia = tipo !== 'incapacidad';
  // Maternidad y paternidad: el fin sale de las semanas del parámetro.
  const hastaEfectivo =
    tipo === 'LMA' && desde ? licenciaMaternidad(desde, semanas('maternidad'), parto || null).termina : tipo === 'LPA' && desde ? addPlainDays(desde, semanas('paternidad') * 7 - 1) : hasta;

  const empleado = (empleados ?? []).find((e) => e.vinculo_id === vinculo) ?? null;
  const personaId = prellenado?.persona_id ?? empleado?.persona_id ?? null;
  const nombre = prellenado?.nombre ?? empleado?.nombre ?? null;

  // Incapacidades anteriores de la misma persona que terminan el día antes: candidatas a prórroga.
  const candidatas = useMemo(
    () =>
      (datos?.filas ?? []).filter(
        (x: FilaAusencia) =>
          x.vinculo_id === vinculo &&
          (x.clase === 'incapacidad_comun' || x.clase === 'incapacidad_laboral') &&
          (x.estado === 'approved' || x.estado === 'taken') &&
          (!desde || addPlainDays(x.hasta, 1) === desde)
      ),
    [datos, vinculo, desde]
  );

  const codigoTipo = tipo === 'incapacidad' ? (origen === 'laboral' ? 'INC_AT' : 'INC_EG') : tipo;
  const salud = tipo === 'incapacidad' ? { ...partirDiagnostico(diagnostico), ...(entidad.trim() ? { entidad: entidad.trim() } : {}) } : null;
  const consulta: DatosAusencia | null = useMemo(
    () =>
      abierto && vinculo && desde && hastaEfectivo && hastaEfectivo >= desde
        ? {
            tipo: codigoTipo,
            vinculo_id: vinculo,
            desde,
            hasta: hastaEfectivo,
            ...(esProrroga && prorrogaDe ? { prorroga_de: prorrogaDe } : {}),
            ...(tipo === 'LMA' && parto ? { fecha_parto: parto } : {}),
          }
        : null,
    [abierto, vinculo, desde, hastaEfectivo, codigoTipo, esProrroga, prorrogaDe, tipo, parto]
  );
  const { sim, cargando, error } = useSimulacion(consulta);
  const fallo = sim?.error ?? error;

  const elegirArchivo = (a: File | null) => {
    if (!a) return;
    if (!(TIPOS_DOCUMENTO_PERMITIDOS as readonly string[]).includes(a.type)) {
      toast.error(t('archivoTipo'));
      return;
    }
    if (a.size > TAMANO_MAXIMO_DOCUMENTO) {
      toast.error(t('archivoTamano'));
      return;
    }
    setArchivo(a);
  };

  const enviar = async () => {
    if (!consulta) return;
    setEnviando(true);
    try {
      let documentoId: string | null = null;
      if (archivo && personaId) documentoId = await subirSoporteSuelto(personaId, vinculo, archivo);
      await registrarAusencia({ ...consulta, ...(salud && Object.keys(salud).length ? { salud } : {}), ...(documentoId ? { documento_id: documentoId } : {}) });
      toast.success(esLicencia ? t('licenciaRegistrada') : t('incapacidadRegistrada'));
      onHecho();
      onAbiertoChange(false);
    } catch (e) {
      toast.error(te(`errores.${claveError(e instanceof ErrorPersonas ? e.codigo : null)}`));
    } finally {
      setEnviando(false);
    }
  };

  const pago = (paga: string | null) => (esPagador(paga) ? ta(`pagadores.nombres.${paga}`) : paga ?? ta('pagadores.nombres.ninguno'));
  const mat = tipo === 'LMA' && desde ? licenciaMaternidad(desde, semanas('maternidad'), parto || null) : null;
  const pagoLicencia = sim?.tramos?.[0];

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={esLicencia ? t('tituloLicencia') : t('tituloIncapacidad')}
      descripcion={esLicencia ? (nombre ? [nombre, empleado?.cargo, empleado?.area].filter(Boolean).join(' · ') : t('descripcionLicencia')) : t('descripcionIncapacidad')}
      ancho={672}
      primario={{
        etiqueta: esLicencia ? t('registrarLicencia') : t('registrarIncapacidad'),
        onClick: () => void enviar(),
        cargando: enviando,
        deshabilitada: !consulta || !sim || !!fallo || cargando || enviando,
        motivo: !consulta ? t('faltanDatos') : fallo ? te(`errores.${claveError(fallo)}`) : undefined,
      }}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField etiqueta={t('persona')} obligatorio>
            {(c) =>
              prellenado ? (
                <Input id={c.id} value={prellenado.nombre ?? '—'} readOnly className="h-10" />
              ) : (
                <SelectorPersona id={c.id} valor={vinculo} onCambiar={(v) => setVinculo(v)} empleados={empleados} />
              )
            }
          </FormField>
          <FormField etiqueta={t('tipo')} obligatorio>
            {(c) => (
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoRegistro)} disabled={!!prellenado}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="incapacidad">{t('tipos.incapacidad')}</SelectItem>
                  <SelectItem value="LMA">{t('tipos.maternidad', { n: semanas('maternidad') })}</SelectItem>
                  <SelectItem value="LPA">{t('tipos.paternidad', { n: semanas('paternidad') })}</SelectItem>
                  <SelectItem value="LUT">
                    {lutoPorConfirmar ? t('tipos.lutoPorConfirmar', { n: Number(luto?.valor ?? 5) }) : t('tipos.luto', { n: Number(luto?.valor ?? 5) })}
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
        </div>

        {tipo === 'LMA' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField etiqueta={t('fechaParto')} obligatorio>
              <CampoFecha valor={parto} onValorChange={setParto} hoy={hoy} required />
            </FormField>
            <FormField etiqueta={t('empieza')} obligatorio ayuda={t('empiezaAyuda')}>
              <CampoFecha valor={desde} onValorChange={setDesde} hoy={hoy} max={parto || undefined} required />
            </FormField>
          </div>
        ) : tipo === 'LPA' ? (
          <FormField etiqueta={t('empieza')} obligatorio>
            <CampoFecha valor={desde} onValorChange={setDesde} hoy={hoy} required />
          </FormField>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField etiqueta={t('desde')} obligatorio>
              <CampoFecha valor={desde} onValorChange={(d) => { setDesde(d); if (hasta && d && hasta < d) setHasta(''); }} hoy={hoy} required />
            </FormField>
            <FormField etiqueta={t('hasta')} obligatorio>
              <CampoFecha valor={hasta} onValorChange={setHasta} hoy={hoy} min={desde || undefined} required />
            </FormField>
          </div>
        )}

        {tipo === 'incapacidad' ? (
          <>
            <FormField etiqueta={t('origen')}>
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  valor={origen}
                  onValorChange={setOrigen}
                  deshabilitado={!!prellenado}
                  opciones={[
                    { valor: 'comun', etiqueta: t('origenComun') },
                    { valor: 'laboral', etiqueta: t('origenLaboral') },
                  ]}
                />
              )}
            </FormField>
            <label className="flex min-h-9 cursor-pointer items-center gap-3 text-sm text-fg">
              <Checkbox checked={esProrroga} disabled={!!prellenado} onCheckedChange={(v) => setEsProrroga(v === true)} />
              {t('esProrroga')}
            </label>
            {esProrroga && !prellenado ? (
              candidatas.length > 0 ? (
                <FormField etiqueta={t('prorrogaDe')} obligatorio>
                  {(c) => (
                    <Select value={prorrogaDe} onValueChange={setProrrogaDe}>
                      <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                        <SelectValue placeholder={t('elegirAnterior')} />
                      </SelectTrigger>
                      <SelectContent>
                        {candidatas.map((x) => (
                          <SelectItem key={x.id} value={x.id}>
                            {f.rango(x.desde, x.hasta)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
              ) : (
                <AvisoTonal tono="neutro" compacto titulo={t('sinAnterior')} />
              )
            ) : null}

            <div className="flex items-center justify-between gap-3 pt-1">
              <h3 className="text-base font-semibold text-fg">{t('diagnosticoYSoporte')}</h3>
              <Badge tono="neutro" apariencia="contorno" tamano="sm" icono={Lock}>
                {ta('sensible')}
              </Badge>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField etiqueta={t('diagnostico')} ayuda={t('diagnosticoAyuda')}>
                <Input value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} placeholder={t('diagnosticoEjemplo')} maxLength={500} className="h-10" />
              </FormField>
              <FormField etiqueta={t('entidad')}>
                <Input value={entidad} onChange={(e) => setEntidad(e.target.value)} placeholder={t('entidadEjemplo')} maxLength={200} className="h-10" />
              </FormField>
            </div>
          </>
        ) : null}

        <div className="rounded-xl border border-line p-3">
          <input ref={entrada} type="file" accept={TIPOS_DOCUMENTO_PERMITIDOS.join(',')} className="sr-only" tabIndex={-1} onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)} />
          {archivo ? (
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
                <FileText aria-hidden className="size-4" strokeWidth={1.5} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{archivo.name}</p>
                <p className="text-xs text-fg-secondary">{t('archivoDetalle', { kb: Math.max(1, Math.round(archivo.size / 1024)) })}</p>
                <p className="text-xs text-fg-muted">{t('seSubeAlGuardar')}</p>
              </div>
              <button type="button" aria-label={t('quitarArchivo')} onClick={() => setArchivo(null)} className="rounded-md p-1 text-fg-secondary hover:bg-subtle">
                <X aria-hidden className="size-4" strokeWidth={1.5} />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => entrada.current?.click()} className="flex w-full items-center gap-3 text-left text-sm text-fg">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-fg-secondary">
                <Paperclip aria-hidden className="size-4" strokeWidth={1.5} />
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{t('adjuntarSoporte')}</span>
                <span className="block text-xs text-fg-secondary">{t('adjuntarAyuda')}</span>
              </span>
            </button>
          )}
        </div>

        {consulta && cargando && !sim ? <Skeleton className="h-24 w-full" /> : null}
        {fallo ? <AvisoTonal tono="peligro" rol="alert" titulo={te(`errores.${claveError(fallo)}`)} /> : null}

        {tipo === 'incapacidad' && sim?.tramos && sim.tramos.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('tramos')}</caption>
              <thead className="bg-subtle text-xs text-fg-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">{t('columnas.dias')}</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">{t('columnas.paga')}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t('columnas.porcentaje')}</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">{t('columnas.desde')}</th>
                </tr>
              </thead>
              <tbody>
                {sim.tramos.map((x) => {
                  const r = diasDelTramo(x);
                  return (
                    <tr key={`${x.desde}-${x.paga}`} className="border-t border-line">
                      <td className="px-3 py-2 tabular-nums">{r ? (r.hasta === r.desde + 1 ? t('diasY', { a: r.desde, b: r.hasta }) : r.hasta === r.desde ? String(r.desde) : t('diasA', { a: r.desde, b: r.hasta })) : f.dias(x.dias)}</td>
                      <td className="px-3 py-2">{pago(x.paga)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{porcentaje(x.fraccion, f.locale)}</td>
                      <td className="px-3 py-2">{f.sinAnio(x.desde)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {esLicencia && sim ? (
          <div className="rounded-lg bg-subtle px-3 py-2">
            <ListaDatos>
              <FilaDato
                etiqueta={t('duracion')}
                valor={
                  tipo === 'LMA' || tipo === 'LPA'
                    ? t('semanasDias', { semanas: tipo === 'LMA' ? semanas('maternidad') : semanas('paternidad'), dias: f.dias(sim.dias_calendario) })
                    : t('diasHabiles', { n: f.dias(sim.dias_habiles) })
                }
              />
              <FilaDato etiqueta={t('termina')} tono="fuerte" valor={f.conDia(sim.hasta)} />
              {mat && mat.semanasAntes !== null ? <FilaDato etiqueta={t('antesDelParto')} valor={t('semanasAntes', { n: mat.semanasAntes })} /> : null}
              {pagoLicencia ? <FilaDato etiqueta={t('quienPaga')} valor={`${pago(pagoLicencia.paga)} · ${porcentaje(pagoLicencia.fraccion, f.locale)}`} /> : null}
            </ListaDatos>
          </div>
        ) : null}

        {tipo === 'LUT' && lutoPorConfirmar ? <AvisoTonal tono="advertencia" compacto titulo={t('lutoPorConfirmar', { n: Number(luto?.valor ?? 5) })} /> : null}
        {tipo === 'LMA' ? <AvisoTonal tono="informacion" titulo={t('proteccionTitulo')} descripcion={t('proteccionDescripcion')} /> : null}
        {tipo === 'incapacidad' ? <p className="text-xs text-fg-secondary">{t('notaTramos')}</p> : null}
      </div>
    </Dialogo>
  );
}
