'use client';

/**
 * Registrar domiciliario — alta rápida (Figma 2800:8493).
 *
 * Un domiciliario EXTERNO no necesita contrato en Recursos humanos: nombre, celular y documento, la
 * sede y (si quiere) el vehículo; queda disponible de inmediato para asignar. Si es empleado,
 * «Traer desde Recursos humanos» lo vincula a su empleo (el disparador completa su cuenta para
 * «Mis envíos»). La licencia y el SOAT se completan después en Transporte › Conductores.
 *
 * Se exporta para que «Asignar» (Por despachar) lo abra con `textoConfirmar="Registrar y asignar"`.
 * El permiso lo decide el servidor (`POST /api/logistica/domiciliarios`).
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bike } from 'lucide-react';
import { Dialogo, FormField, SettingRow } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { PhoneField } from '@/components/kit/PhoneField';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBranch } from '@/lib/context/BranchContext';
import {
  TIPOS_DOCUMENTO,
  TIPOS_VEHICULO,
  altaDomiciliarioSchema,
  type TipoDocumento,
  type TipoVehiculo,
} from '@/lib/logistica/domiciliarios';
import type { CandidatosAlta, DomiciliarioFila } from '@/lib/services/logistica/domiciliariosService';
import { LogisticaApiError, leerCandidatos, registrarDomiciliario } from '../logisticaApi';

export interface RegistrarDomiciliarioDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  onRegistrado: (d: DomiciliarioFila) => void;
  /** «Registrar» por defecto; «Registrar y asignar» desde el diálogo de asignar. */
  textoConfirmar?: string;
  /** Candidatos ya leídos por la pantalla (si no, se leen al abrir). */
  candidatos?: CandidatosAlta | null;
}

const SIN = '__sin__';

export function RegistrarDomiciliarioDialog({ abierto, onAbiertoChange, onRegistrado, textoConfirmar, candidatos: candidatosProp }: RegistrarDomiciliarioDialogProps) {
  const t = useTranslations('logistica.domiciliario.alta');
  const { branches, selectedBranchId } = useBranch();
  const [candidatos, setCandidatos] = useState<CandidatosAlta | null>(candidatosProp ?? null);

  const [nombre, setNombre] = useState('');
  const [celular, setCelular] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>('CC');
  const [documento, setDocumento] = useState('');
  const [sede, setSede] = useState<number | null>(selectedBranchId ?? null);
  const [vehiculo, setVehiculo] = useState<TipoVehiculo | null>(null);
  const [cobraContraentrega, setCobraContraentrega] = useState(true);
  const [esEmpleado, setEsEmpleado] = useState(false);
  const [empleo, setEmpleo] = useState<string | null>(null);
  const [usuario, setUsuario] = useState<string | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (candidatosProp) setCandidatos(candidatosProp);
  }, [candidatosProp]);

  // Sede por defecto: la del header (o la única). Se lee al abrir, no en cada render: el
  // contexto puede entregar un arreglo nuevo y eso no debe borrar lo que se está escribiendo.
  const sedePorDefecto = useRef<number | null>(null);
  sedePorDefecto.current = selectedBranchId ?? (branches.length === 1 ? branches[0].id ?? null : null);
  const candidatosIniciales = useRef(candidatosProp);
  candidatosIniciales.current = candidatosProp;

  useEffect(() => {
    if (!abierto) return;
    setNombre('');
    setCelular('');
    setTipoDocumento('CC');
    setDocumento('');
    setSede(sedePorDefecto.current);
    setVehiculo(null);
    setCobraContraentrega(true);
    setEsEmpleado(false);
    setEmpleo(null);
    setUsuario(null);
    setIntentado(false);
    setError(null);
    if (!candidatosIniciales.current) {
      leerCandidatos()
        .then(setCandidatos)
        .catch(() => setCandidatos({ empleados: [], miembros: [] }));
    }
  }, [abierto]);

  const alta = {
    nombre,
    celular,
    tipoDocumento,
    documento,
    branchId: sede ?? 0,
    tipoVehiculo: vehiculo,
    cobraContraentrega,
    employmentId: esEmpleado ? empleo : null,
    userId: esEmpleado ? null : usuario,
  };
  const validacion = altaDomiciliarioSchema.safeParse(alta);
  const campoConError = (campo: string) =>
    intentado && !validacion.success && validacion.error.issues.some((i) => i.path[0] === campo) ? t(`errores.${campo}`) : null;
  const faltaEmpleo = intentado && esEmpleado && !empleo;

  const elegirEmpleado = (id: string) => {
    const e = candidatos?.empleados.find((x) => x.employmentId === id);
    setEmpleo(id === SIN ? null : id);
    if (e) {
      setNombre(e.nombre);
      if (e.telefono) setCelular(e.telefono);
      if (e.branchId) setSede(e.branchId);
    }
  };

  const guardar = async () => {
    setIntentado(true);
    setError(null);
    if (!validacion.success || (esEmpleado && !empleo)) return;
    setGuardando(true);
    try {
      const r = await registrarDomiciliario(validacion.data);
      onRegistrado(r.domiciliario);
      onAbiertoChange(false);
    } catch (err) {
      const codigo = err instanceof LogisticaApiError ? err.codigo : 'ERROR';
      setError(t.has(`errores.servidor.${codigo}`) ? t(`errores.servidor.${codigo}`) : t('errores.servidor.ERROR'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !guardando && onAbiertoChange(v)}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={Bike}
      ancho={520}
      primario={{ etiqueta: guardando ? t('guardando') : textoConfirmar ?? t('registrar'), onClick: guardar, cargando: guardando }}
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle px-3 py-2 text-sm text-danger-text">
            {error}
          </p>
        )}

        <FormField etiqueta={t('nombre')} obligatorio error={campoConError('nombre')}>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" maxLength={120} />
        </FormField>

        <PhoneField
          etiqueta={t('celular')}
          valor={celular}
          onValor={setCelular}
          obligatorio
          ayuda={t('celularAyuda')}
          error={campoConError('celular')}
          defaultIso="CO"
          autoComplete="tel"
        />

        <div className="grid grid-cols-[112px_1fr] gap-3">
          <FormField etiqueta={t('tipoDocumento')} obligatorio={!esEmpleado}>
            {(c) => (
              <Select value={tipoDocumento} onValueChange={(v) => setTipoDocumento(v as TipoDocumento)}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_DOCUMENTO.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('documento')} obligatorio={!esEmpleado} error={campoConError('documento')}>
            <Input value={documento} onChange={(e) => setDocumento(e.target.value)} inputMode="numeric" maxLength={30} />
          </FormField>
        </div>

        <FormField etiqueta={t('sede')} obligatorio error={campoConError('branchId')}>
          {(c) => (
            <Select value={sede ? String(sede) : undefined} onValueChange={(v) => setSede(Number(v))}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-invalid={c['aria-invalid']} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={t('elegirSede')} />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField etiqueta={t('vehiculo')} ayuda={t('vehiculoAyuda')}>
          {(c) => (
            <Select value={vehiculo ?? SIN} onValueChange={(v) => setVehiculo(v === SIN ? null : (v as TipoVehiculo))}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className="h-10 border-line-strong bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN}>{t('sinVehiculo')}</SelectItem>
                {TIPOS_VEHICULO.map((v) => (
                  <SelectItem key={v} value={v}>
                    {t(`vehiculos.${v}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <SettingRow titulo={t('cobraContraentrega')} descripcion={t('cobraContraentregaAyuda')} htmlFor="alta-cobra-contraentrega" className="rounded-xl border border-line px-4">
          <Switch id="alta-cobra-contraentrega" checked={cobraContraentrega} onCheckedChange={setCobraContraentrega} />
        </SettingRow>

        <SettingRow titulo={t('esEmpleado')} descripcion={t('esEmpleadoAyuda')} htmlFor="alta-es-empleado" className="rounded-xl border border-line px-4">
          <Switch
            id="alta-es-empleado"
            checked={esEmpleado}
            onCheckedChange={(v) => {
              setEsEmpleado(v);
              if (!v) setEmpleo(null);
            }}
          />
        </SettingRow>

        {esEmpleado ? (
          <FormField etiqueta={t('traerDeRrhh')} obligatorio error={faltaEmpleo ? t('errores.empleo') : null} ayuda={candidatos && candidatos.empleados.length === 0 ? t('sinEmpleados') : undefined}>
            {(c) => (
              <Select value={empleo ?? undefined} onValueChange={elegirEmpleado} disabled={!candidatos || candidatos.empleados.length === 0}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className="h-10 border-line-strong bg-surface">
                  <SelectValue placeholder={candidatos ? t('elegirEmpleado') : t('cargando')} />
                </SelectTrigger>
                <SelectContent>
                  {candidatos?.empleados.map((e) => (
                    <SelectItem key={e.employmentId} value={e.employmentId}>
                      {e.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        ) : (
          candidatos &&
          candidatos.miembros.length > 0 && (
            <FormField etiqueta={t('cuenta')} ayuda={t('cuentaAyuda')}>
              {(c) => (
                <Select value={usuario ?? SIN} onValueChange={(v) => setUsuario(v === SIN ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN}>{t('sinCuenta')}</SelectItem>
                    {candidatos.miembros.map((m) => (
                      <SelectItem key={m.userId} value={m.userId}>
                        {m.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          )
        )}
      </div>
    </Dialogo>
  );
}
