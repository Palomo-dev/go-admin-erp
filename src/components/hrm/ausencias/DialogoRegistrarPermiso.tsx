'use client';

/**
 * Registrar un permiso (Figma 20.14.6, «Registrar permiso»): calamidad doméstica,
 * licencia remunerada (cita médica, sufragio, diligencias de ley) o no remunerada, y
 * los tipos propios de la organización. Día completo, media jornada o por horas; si
 * no es remunerado se puede marcar que el tiempo se repone.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AvisoTonal, CampoFecha, Dialogo, FilaDato, FormField, ListaDatos, SegmentedControl } from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ErrorPersonas } from '../personas/apiPersonas';
import { registrarAusencia, type DatosAusencia } from './apiAusencias';
import { horasEntre, type TipoAusencia } from './ausenciasLogica';
import { useFechas } from './piezasAusencias';
import { SelectorPersona, useEmpleadosVigentes } from './SelectorPersona';
import { claveError, useSimulacion } from './useSimulacion';

type Duracion = 'dia' | 'medio' | 'horas';

export interface DialogoRegistrarPermisoProps {
  abierto: boolean;
  onAbiertoChange: (a: boolean) => void;
  hoy: string;
  tipos: readonly TipoAusencia[];
  onHecho: () => void;
}

export function DialogoRegistrarPermiso({ abierto, onAbiertoChange, hoy, tipos, onHecho }: DialogoRegistrarPermisoProps) {
  const t = useTranslations('hrmAusencias.permiso');
  const te = useTranslations('hrmAusencias');
  const f = useFechas();
  const empleados = useEmpleadosVigentes(abierto);
  const deEstaSeccion = useMemo(() => tipos.filter((x) => x.seccion === 'permisos'), [tipos]);
  const [vinculo, setVinculo] = useState('');
  const [tipoId, setTipoId] = useState('');
  const [duracion, setDuracion] = useState<Duracion>('dia');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [jornada, setJornada] = useState<'morning' | 'afternoon'>('morning');
  const [inicio, setInicio] = useState('08:00');
  const [fin, setFin] = useState('10:00');
  const [motivo, setMotivo] = useState('');
  const [seRepone, setSeRepone] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setVinculo('');
    setTipoId('');
    setDuracion('dia');
    setDesde('');
    setHasta('');
    setMotivo('');
    setSeRepone(false);
  }, [abierto]);

  const tipo = deEstaSeccion.find((x) => x.id === tipoId) ?? null;
  const horasOk = duracion !== 'horas' || (/^\d{2}:\d{2}$/.test(inicio) && /^\d{2}:\d{2}$/.test(fin) && fin > inicio);
  const hastaEfectivo = duracion === 'dia' ? hasta || desde : desde;
  const consulta: DatosAusencia | null = useMemo(
    () =>
      abierto && vinculo && tipoId && desde && hastaEfectivo >= desde && horasOk
        ? {
            tipo_id: tipoId,
            vinculo_id: vinculo,
            desde,
            hasta: hastaEfectivo,
            ...(duracion === 'medio' ? { medio_dia_inicio: true, medio_dia_jornada: jornada } : {}),
            ...(duracion === 'horas' ? { horas: { inicio, fin } } : {}),
          }
        : null,
    [abierto, vinculo, tipoId, desde, hastaEfectivo, horasOk, duracion, jornada, inicio, fin]
  );
  const { sim, cargando, error } = useSimulacion(consulta);
  const fallo = sim?.error ?? error;

  const enviar = async () => {
    if (!consulta) return;
    setEnviando(true);
    try {
      const r = await registrarAusencia({
        ...consulta,
        ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
        ...(tipo && !tipo.remunerado && seRepone ? { se_repone: true } : {}),
      });
      toast.success(r.estado === 'approved' ? t('registrado') : t('enviado'));
      onHecho();
      onAbiertoChange(false);
    } catch (e) {
      toast.error(te(`errores.${claveError(e instanceof ErrorPersonas ? e.codigo : null)}`));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      ancho={560}
      primario={{
        etiqueta: t('registrar'),
        onClick: () => void enviar(),
        cargando: enviando,
        deshabilitada: !consulta || !sim || !!fallo || cargando || enviando,
        motivo: !consulta ? t('faltanDatos') : fallo ? te(`errores.${claveError(fallo)}`) : undefined,
      }}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField etiqueta={t('persona')} obligatorio>
            {(c) => <SelectorPersona id={c.id} valor={vinculo} onCambiar={(v) => setVinculo(v)} empleados={empleados} />}
          </FormField>
          <FormField etiqueta={t('tipo')} obligatorio>
            {(c) => (
              <Select value={tipoId} onValueChange={setTipoId}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue placeholder={t('elegirTipo')} />
                </SelectTrigger>
                <SelectContent>
                  {deEstaSeccion.map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {x.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        </div>

        <FormField etiqueta={t('cuanto')}>
          {(c) => (
            <SegmentedControl
              aria-labelledby={c.idEtiqueta}
              valor={duracion}
              onValorChange={setDuracion}
              opciones={[
                { valor: 'dia', etiqueta: t('diaCompleto') },
                { valor: 'medio', etiqueta: t('mediaJornada') },
                { valor: 'horas', etiqueta: t('porHoras') },
              ]}
            />
          )}
        </FormField>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField etiqueta={duracion === 'dia' ? t('desde') : t('dia')} obligatorio>
            <CampoFecha valor={desde} onValorChange={setDesde} hoy={hoy} required />
          </FormField>
          {duracion === 'dia' ? (
            <FormField etiqueta={t('hasta')} ayuda={t('hastaAyuda')}>
              <CampoFecha valor={hasta} onValorChange={setHasta} hoy={hoy} min={desde || undefined} />
            </FormField>
          ) : duracion === 'medio' ? (
            <FormField etiqueta={t('jornada')}>
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  valor={jornada}
                  onValorChange={setJornada}
                  opciones={[
                    { valor: 'morning', etiqueta: t('manana') },
                    { valor: 'afternoon', etiqueta: t('tarde') },
                  ]}
                />
              )}
            </FormField>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <FormField etiqueta={t('horaInicio')} obligatorio>
                <Input type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} className="h-10" />
              </FormField>
              <FormField etiqueta={t('horaFin')} obligatorio error={horasOk ? null : t('horasInvalidas')}>
                <Input type="time" value={fin} onChange={(e) => setFin(e.target.value)} className="h-10" />
              </FormField>
            </div>
          )}
        </div>

        <FormField etiqueta={t('motivo')} ayuda={t('motivoAyuda')}>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={1000} placeholder={t('motivoEjemplo')} className="h-10" />
        </FormField>

        {tipo && !tipo.remunerado ? (
          <label className="flex min-h-9 cursor-pointer items-center gap-3 text-sm text-fg">
            <Checkbox checked={seRepone} onCheckedChange={(v) => setSeRepone(v === true)} />
            {t('seRepone')}
          </label>
        ) : null}

        {fallo ? <AvisoTonal tono="peligro" rol="alert" titulo={te(`errores.${claveError(fallo)}`)} /> : null}
        {sim && tipo ? (
          <div className="rounded-lg bg-subtle px-3 py-2">
            <ListaDatos>
              <FilaDato
                etiqueta={t('duracion')}
                valor={
                  duracion === 'horas'
                    ? t('nHoras', { n: f.dias(horasEntre(inicio, fin)) })
                    : duracion === 'medio'
                      ? t('mediaJornada')
                      : t('nDias', { n: f.dias(sim.dias_calendario) })
                }
              />
              <FilaDato etiqueta={t('remunerado')} valor={tipo.remunerado ? t('si') : seRepone ? t('noSeRepone') : t('no')} />
            </ListaDatos>
          </div>
        ) : null}
      </div>
    </Dialogo>
  );
}
