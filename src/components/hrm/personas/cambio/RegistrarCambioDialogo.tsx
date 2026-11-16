'use client';

/**
 * «Registrar un cambio» (Figma 20.4, `docs/design/figma/95-hrm-04-*`): los 5
 * tipos con fecha de efecto y aprobación (salario, cargo, sede, jornada y
 * seguridad social, decisión 6). Varios tipos marcados van en UNA solicitud y
 * se aprueban o rechazan juntos (decisión 5). Una fecha dentro de un período
 * de nómina cerrado se bloquea (decisión 4). El cargo puede arrastrar el
 * salario: se ofrece registrar los dos enlazados.
 *
 * Escalas salariales: las crea el frente «Estructura»; mientras no existan,
 * no se muestra la posición en la escala ni el aviso de fuera de rango
 * (`escalasSalariales.server.ts`).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Briefcase, Clock, DollarSign, Link2, MapPin, ShieldCheck, Upload } from 'lucide-react';
import {
  AvisoTonal,
  CampoFecha,
  CampoNumero,
  Dialogo,
  FormField,
  Stepper,
  StatusBadge,
  TarjetaSeleccionable,
  clasesBoton,
  simboloMoneda,
} from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { MOTIVOS_CAMBIO, SUBSISTEMAS, TIPOS_CAMBIO, categoriaAfiliacion, type Subsistema, type TipoCambio } from '@/lib/hrm/personas/catalogo';
import { primerDiaMesSiguiente } from '@/lib/hrm/personas/logica';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { ErrorPersonas, consultarPeriodo, pedir, registrarCambios, subirDocumento, type Catalogos, type Ficha } from '../apiPersonas';
import { fechaCorta, useValorCampo } from '../textosPersonas';

export interface EmpleadoCambio {
  vinculoId: string;
  personaId: string;
  nombre: string;
  cargo: string | null;
  sede: string | null;
}

export interface RegistrarCambioDialogoProps {
  abierto: boolean;
  onAbiertoChange: (a: boolean) => void;
  empleados: EmpleadoCambio[];
  /** Tipo preseleccionado (desde «Registrar un cambio de salario», Seguridad social…). */
  tipoInicial?: TipoCambio;
  onRegistrado?: (r: { status: 'pendiente' | 'aprobado' }) => void;
}

const ICONOS: Record<TipoCambio, typeof DollarSign> = {
  salario: DollarSign,
  cargo: Briefcase,
  sede: MapPin,
  jornada: Clock,
  seguridad_social: ShieldCheck,
};

type Paso = 'que' | 'valor' | 'envio';

export function RegistrarCambioDialogo({ abierto, onAbiertoChange, empleados, tipoInicial, onRegistrado }: RegistrarCambioDialogoProps) {
  const t = useTranslations('hrmPersonas.cambio');
  const tc = useTranslations('hrmPersonas.comun');
  const moneda = useMonedaOrganizacion();
  const valorCampo = useValorCampo();
  const { getToday } = useFormatDate();
  const uno = empleados.length === 1 ? empleados[0] : null;
  const simbolo = simboloMoneda(moneda);

  const [paso, setPaso] = useState<Paso>(tipoInicial ? 'valor' : 'que');
  const [tipos, setTipos] = useState<TipoCambio[]>(tipoInicial ? [tipoInicial] : []);
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [salarioActual, setSalarioActual] = useState<number | null>(null);
  const [salarioVisible, setSalarioVisible] = useState<boolean | null>(null);

  const [efectivo, setEfectivo] = useState<string>('');
  const [motivo, setMotivo] = useState<string>('');
  const [nota, setNota] = useState('');
  const [salario, setSalario] = useState<number | null>(null);
  const [cargo, setCargo] = useState<string>('');
  const [arrastrarSalario, setArrastrarSalario] = useState(false);
  const [sede, setSede] = useState<string>('');
  const [jornada, setJornada] = useState<number | null>(null);
  const [subsistema, setSubsistema] = useState<Subsistema>('eps');
  const [entidad, setEntidad] = useState<string>('');
  const [soporte, setSoporte] = useState<File | null>(null);
  const [cerrado, setCerrado] = useState<{ cerrado: boolean; primera_fecha_libre?: string | null } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setEfectivo((v) => v || primerDiaMesSiguiente(getToday()));
    pedir<Catalogos>('/api/hrm/catalogos').then(setCatalogos).catch(() => setCatalogos(null));
    if (uno) {
      pedir<Ficha>(`/api/hrm/personas/${uno.personaId}/ficha`).then(setFicha).catch(() => setFicha(null));
    }
  }, [abierto, uno, getToday]);

  // El salario actual solo se pide si se va a cambiar (la lectura queda registrada).
  const pideSalario = tipos.includes('salario') || arrastrarSalario;
  useEffect(() => {
    if (!abierto || !uno || !pideSalario || salarioVisible !== null) return;
    pedir<{ vigente?: { employment_id: string; salario: unknown }[] }>(`/api/hrm/personas/${uno.personaId}/datos/salario_pago`)
      .then((d) => {
        const v = d.vigente?.find((x) => x.employment_id === uno.vinculoId)?.salario;
        setSalarioActual(typeof v === 'number' ? v : v != null ? Number(v) : null);
        setSalarioVisible(true);
      })
      .catch(() => setSalarioVisible(false));
  }, [abierto, uno, pideSalario, salarioVisible]);

  useEffect(() => {
    if (!abierto || !efectivo || !/^\d{4}-\d{2}-\d{2}$/.test(efectivo)) return;
    let vigente = true;
    consultarPeriodo(empleados[0].vinculoId, efectivo)
      .then((r) => vigente && setCerrado(r))
      .catch(() => vigente && setCerrado(null));
    return () => {
      vigente = false;
    };
  }, [abierto, efectivo, empleados]);

  const laboral = (campo: string) => ficha?.laboral.find((l) => l.campo === campo);
  const afiliacion = (s: Subsistema) => ficha?.afiliaciones.find((a) => a.subsistema === s);
  const hoyDe = (tipo: TipoCambio): string | null => {
    if (!ficha) return null;
    switch (tipo) {
      case 'salario':
        return salarioVisible && salarioActual != null ? t('hoy', { valor: valorCampo('salario', salarioActual, null) }) : null;
      case 'cargo':
        return t('hoy', { valor: laboral('cargo')?.nombre ?? tc('sinDato') });
      case 'sede':
        return t('hoy', { valor: laboral('sede')?.nombre ?? tc('sinDato') });
      case 'jornada':
        return t('hoy', { valor: valorCampo('jornada_horas_semana', laboral('jornada_horas_semana')?.valor ?? null, null) });
      case 'seguridad_social':
        return t('hoy', { valor: ficha.afiliaciones.filter((a) => a.entidad).map((a) => a.entidad).join(' · ') || tc('sinDato') });
    }
  };

  const cargoNuevo = catalogos?.cargos.find((c) => c.id === cargo) ?? null;
  const areaNueva = cargoNuevo?.department_id ? catalogos?.areas.find((a) => a.id === cargoNuevo.department_id) ?? null : null;
  const jefeNuevo =
    areaNueva?.manager_employment_id && areaNueva.manager_employment_id !== ficha?.vinculo?.jefe_id && areaNueva.manager_employment_id !== uno?.vinculoId
      ? catalogos?.jefes.find((j) => j.id === areaNueva.manager_employment_id) ?? null
      : null;
  const incluyeSalario = tipos.includes('salario') || (tipos.includes('cargo') && arrastrarSalario);

  const cambios = useMemo(() => {
    const out: { campo: string; valor: unknown }[] = [];
    if (incluyeSalario && salario != null) out.push({ campo: 'salario', valor: salario });
    if (tipos.includes('cargo') && cargo) {
      out.push({ campo: 'cargo', valor: cargo });
      if (areaNueva && areaNueva.id !== ficha?.vinculo?.area_id) out.push({ campo: 'area', valor: areaNueva.id });
      if (jefeNuevo) out.push({ campo: 'jefe', valor: jefeNuevo.id });
    }
    if (tipos.includes('sede') && sede) out.push({ campo: 'sede', valor: Number(sede) });
    if (tipos.includes('jornada') && jornada != null) out.push({ campo: 'jornada_horas_semana', valor: jornada });
    if (tipos.includes('seguridad_social') && entidad) out.push({ campo: subsistema, valor: entidad });
    return out;
  }, [incluyeSalario, salario, tipos, cargo, areaNueva, ficha, jefeNuevo, sede, jornada, entidad, subsistema]);

  const faltaSoporte = tipos.includes('seguridad_social') && !soporte;
  const completos =
    tipos.length > 0 &&
    (!incluyeSalario || salario != null) &&
    (!tipos.includes('cargo') || !!cargo) &&
    (!tipos.includes('sede') || !!sede) &&
    (!tipos.includes('jornada') || jornada != null) &&
    (!tipos.includes('seguridad_social') || !!entidad);
  const puedeEnviar = completos && !!motivo && !!efectivo && !cerrado?.cerrado && !faltaSoporte && !enviando;

  const tituloDialogo =
    tipos.length === 1 && paso !== 'que'
      ? t(`titulos.${tipos[0]}`)
      : tipos.includes('cargo') && arrastrarSalario
        ? t('titulos.cargoSalario')
        : t('titulos.general');
  const descripcion = uno ? [uno.nombre, uno.cargo, uno.sede].filter(Boolean).join(' · ') : t('variasPersonas', { n: empleados.length });

  const enviar = async () => {
    setEnviando(true);
    setError(null);
    try {
      let soporteId: string | null = null;
      const motivoTexto = t(`motivos.${motivo}`);
      let ultimo: 'pendiente' | 'aprobado' = 'aprobado';
      for (const e of empleados) {
        if (soporte) {
          const categoria = tipos.includes('seguridad_social') ? categoriaAfiliacion(subsistema) : 'soporte_cambio';
          soporteId = (await subirDocumento(e.personaId, soporte, categoria, { vinculoId: e.vinculoId })).id;
        }
        const r = await registrarCambios(e.vinculoId, {
          efectivo_desde: efectivo,
          cambios,
          motivo: motivoTexto,
          nota: nota.trim() || null,
          soporte_documento_id: soporteId,
        });
        ultimo = r.status;
      }
      toast.success(ultimo === 'pendiente' ? t('resultado.pendiente') : t('resultado.aprobado', { fecha: fechaCorta(efectivo) }));
      onRegistrado?.({ status: ultimo });
      onAbiertoChange(false);
    } catch (e) {
      const codigo = e instanceof ErrorPersonas ? e.codigo : 'error';
      setError(
        ['periodo_cerrado', 'cambio_pendiente', 'sin_permiso', 'requiere_regla_de_aprobacion', 'aprobacion_sin_aprobador'].includes(codigo)
          ? t(`errores.${codigo}`)
          : t('errores.generico')
      );
    } finally {
      setEnviando(false);
    }
  };

  const pasos = [
    { valor: 'que' as const, etiqueta: t('pasos.que') },
    { valor: 'valor' as const, etiqueta: t('pasos.valor') },
    { valor: 'envio' as const, etiqueta: t('pasos.envio') },
  ];

  const queVaAPasar = (
    <div className="rounded-lg bg-subtle p-3 text-sm">
      <p className="mb-2 text-xs font-medium text-fg-secondary">{t('queVaAPasar')}</p>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-fg">
        <li>{cambios.length > 1 ? t('pasa.enlazados', { n: cambios.length, fecha: fechaCorta(efectivo) }) : t('pasa.aprobacion')}</li>
        {cambios.length > 1 && <li>{t('pasa.rechazoJuntos')}</li>}
        <li>{t('pasa.historial')}</li>
        <li>{t('pasa.nomina', { fecha: fechaCorta(efectivo) })}</li>
      </ol>
    </div>
  );

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={tituloDialogo}
      descripcion={descripcion}
      ancho={672}
      primario={
        paso === 'que'
          ? { etiqueta: t('continuar'), onClick: () => setPaso('valor'), deshabilitada: tipos.length === 0, motivo: t('eligeUno') }
          : {
              etiqueta: error ? t('reintentar') : cambios.length > 1 ? t('enviarVarios', { n: cambios.length }) : t('enviar'),
              onClick: () => void enviar(),
              cargando: enviando,
              deshabilitada: !puedeEnviar,
              motivo: cerrado?.cerrado ? t('errores.periodo_cerrado') : faltaSoporte ? t('faltaSoporte') : t('completa'),
            }
      }
      secundarios={paso !== 'que' && !tipoInicial ? [{ etiqueta: t('atras'), onClick: () => setPaso('que') }] : undefined}
    >
      <div className="flex flex-col gap-4">
        <Stepper
          pasos={pasos}
          actual={paso}
          etiqueta={t('pasos.etiqueta')}
          resumenMovil={(n, total, etiqueta) => t('pasos.movil', { n, total, etiqueta })}
        />

        {paso === 'que' ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {TIPOS_CAMBIO.map((tipo) => (
                <TarjetaSeleccionable
                  key={tipo}
                  rol="checkbox"
                  orientacion="horizontal"
                  icono={ICONOS[tipo]}
                  titulo={t(`tipos.${tipo}`)}
                  descripcion={hoyDe(tipo) ?? undefined}
                  seleccionada={tipos.includes(tipo)}
                  deshabilitada={tipo === 'salario' && empleados.length > 1}
                  onSeleccionar={() => setTipos((x) => (x.includes(tipo) ? x.filter((y) => y !== tipo) : [...x, tipo]))}
                />
              ))}
            </div>
            <AvisoTonal tono="informacion" compacto titulo={t('variosTipos')} />
          </>
        ) : (
          <>
            {incluyeSalario && (
              <AvisoTonal tono="advertencia" compacto titulo={t('sensible')} descripcion={t('sensibleDetalle')} />
            )}

            {tipos.includes('salario') && (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField etiqueta={t('salarioActual')} ayuda={salarioVisible === false ? t('salarioOculto') : undefined}>
                  <Input readOnly value={salarioActual != null ? valorCampo('salario', salarioActual, null) : '—'} className="h-10 bg-subtle" />
                </FormField>
                <FormField etiqueta={t('salarioNuevo')} obligatorio>
                  <CampoNumero valor={salario} onValorChange={setSalario} prefijo={simbolo} decimales={0} minimo={1} />
                </FormField>
              </div>
            )}

            {tipos.includes('cargo') && (
              <div className="flex flex-col gap-3">
                <FormField
                  etiqueta={t('cargoNuevo')}
                  obligatorio
                  ayuda={areaNueva ? t('areaDelCargo', { area: areaNueva.name }) : undefined}
                >
                  {(c) => (
                    <Select value={cargo} onValueChange={setCargo}>
                      <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                        <SelectValue placeholder={tc('elegir')} />
                      </SelectTrigger>
                      <SelectContent>
                        {(catalogos?.cargos ?? [])
                          .filter((x) => x.id !== ficha?.vinculo?.cargo_id)
                          .map((x) => (
                            <SelectItem key={x.id} value={x.id}>
                              {x.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
                {cargo && (jefeNuevo || (areaNueva && areaNueva.id !== ficha?.vinculo?.area_id)) ? (
                  <div className="rounded-lg bg-subtle p-3 text-sm">
                    <p className="mb-1.5 text-xs font-medium text-fg-secondary">{t('seAjusta')}</p>
                    {areaNueva && areaNueva.id !== ficha?.vinculo?.area_id && (
                      <p className="flex items-start gap-2 text-fg">
                        <Link2 aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                        {t('ajusteArea', { de: ficha?.vinculo?.area ?? tc('sinDato'), a: areaNueva.name })}
                      </p>
                    )}
                    {jefeNuevo && (
                      <p className="flex items-start gap-2 text-fg">
                        <Link2 aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                        {t('ajusteJefe', { de: ficha?.jefe?.nombre ?? tc('sinDato'), a: jefeNuevo.nombre })}
                      </p>
                    )}
                  </div>
                ) : null}
                {!tipos.includes('salario') && uno && ficha?.permisos.grupos.salario_pago.editar ? (
                  <div className="rounded-lg border border-line-warning bg-warning-subtle p-3">
                    <label className="flex items-center gap-2 text-sm text-fg">
                      <Checkbox checked={arrastrarSalario} onCheckedChange={(v) => setArrastrarSalario(v === true)} />
                      {t('arrastrarSalario')}
                    </label>
                    {arrastrarSalario && (
                      <div className="mt-3">
                        <FormField etiqueta={t('salarioNuevo')} obligatorio ayuda={t('seApruebaJunto')}>
                          <CampoNumero valor={salario} onValorChange={setSalario} prefijo={simbolo} decimales={0} minimo={1} />
                        </FormField>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {tipos.includes('sede') && (
              <FormField etiqueta={t('sedeNueva')} obligatorio>
                {(c) => (
                  <Select value={sede} onValueChange={setSede}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue placeholder={tc('elegir')} />
                    </SelectTrigger>
                    <SelectContent>
                      {(catalogos?.sedes ?? [])
                        .filter((s) => s.id !== ficha?.vinculo?.sede_id)
                        .map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            )}

            {tipos.includes('jornada') && (
              <FormField etiqueta={t('jornadaNueva')} obligatorio ayuda={t('jornadaAyuda')}>
                <CampoNumero valor={jornada} onValorChange={setJornada} sufijo={t('horasSufijo')} decimales={1} minimo={1} maximo={48} />
              </FormField>
            )}

            {tipos.includes('seguridad_social') && (
              <div className="flex flex-col gap-3">
                <FormField etiqueta={t('queCambia')} obligatorio ayuda={t('queCambiaAyuda')}>
                  {(c) => (
                    <Select
                      value={subsistema}
                      onValueChange={(v) => {
                        setSubsistema(v as Subsistema);
                        setEntidad('');
                      }}
                    >
                      <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUBSISTEMAS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {tc(`subsistemas.${s}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    etiqueta={t('entidadActual')}
                    ayuda={afiliacion(subsistema)?.desde ? t('desde', { fecha: fechaCorta(afiliacion(subsistema)?.desde) }) : undefined}
                  >
                    <Input readOnly value={afiliacion(subsistema)?.entidad ?? '—'} className="h-10 bg-subtle" />
                  </FormField>
                  <FormField etiqueta={t('entidadNueva')} obligatorio ayuda={t('entidadAyuda')}>
                    {(c) => (
                      <Select value={entidad} onValueChange={setEntidad}>
                        <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                          <SelectValue placeholder={tc('elegir')} />
                        </SelectTrigger>
                        <SelectContent>
                          {(catalogos?.entidades ?? [])
                            .filter((x) => x.subsystem === subsistema && x.id !== afiliacion(subsistema)?.entidad_id)
                            .map((x) => (
                              <SelectItem key={x.id} value={x.id}>
                                {x.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  </FormField>
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                etiqueta={t('fechaEfecto')}
                obligatorio
                error={cerrado?.cerrado ? t('periodoCerrado', { fecha: fechaCorta(cerrado.primera_fecha_libre ?? '') }) : null}
                ayuda={!cerrado?.cerrado && efectivo ? t('fechaAyuda') : undefined}
              >
                <CampoFecha valor={efectivo} onValorChange={setEfectivo} />
              </FormField>
              <FormField etiqueta={t('motivo')} obligatorio>
                {(c) => (
                  <Select value={motivo} onValueChange={setMotivo}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue placeholder={tc('elegir')} />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set(tipos.flatMap((x) => MOTIVOS_CAMBIO[x]))).map((m) => (
                        <SelectItem key={m} value={m}>
                          {t(`motivos.${m}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            </div>

            {cerrado?.cerrado && <AvisoTonal tono="peligro" compacto rol="alert" titulo={t('periodoCerradoDetalle')} />}

            <FormField etiqueta={t('nota')}>
              <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={1000} className="h-10" />
            </FormField>

            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-subtle p-3">
              <Upload aria-hidden className="size-5 shrink-0 text-fg-secondary" strokeWidth={1.5} />
              <p className="min-w-0 flex-1 text-sm text-fg">
                {tipos.includes('seguridad_social') ? t('soporteObligatorio') : t('soporteOpcional')}
                {soporte ? <span className="block truncate text-xs text-fg-secondary">{soporte.name}</span> : null}
              </p>
              {soporte ? <StatusBadge estado="ok" tono="exito" etiqueta={t('subido')} /> : null}
              <label className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                {t('subir')}
                <input
                  type="file"
                  className="sr-only"
                  accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
                  onChange={(e) => setSoporte(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            {error && <AvisoTonal tono="peligro" rol="alert" titulo={error} />}
            {cambios.length > 0 && queVaAPasar}
          </>
        )}
      </div>
    </Dialogo>
  );
}
