'use client';

/**
 * Marcación › «Métodos por sede» (Figma 20.27.1–20.27.9). Qué métodos ofrece
 * la sede y con qué reglas: celular con ubicación, QR rotativo y etiqueta NFC
 * funcionan en M0; desde M1, el kiosco con PIN, los carnés y la foto de evidencia
 * (días y letrero) también; rostro y huella se ven pero llegan con los relojes (M2). Los cambios se guardan juntos desde la barra fija
 * «Cambios sin guardar» (20.27.2) por `PUT /api/hrm/marcacion/metodos`.
 *
 * La pestaña contenedora pasa la sede del header (`null` = la principal); si la
 * organización tiene varias, aquí se puede elegir otra sin salir de la vista.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Camera,
  Fingerprint,
  Home,
  KeyRound,
  Laptop,
  LocateFixed,
  MonitorSmartphone,
  Nfc,
  PenLine,
  Plus,
  Printer,
  ScanFace,
  ScanQrCode,
} from 'lucide-react';
import { AvisoTonal, CampoNumero, ConfirmDialog, EmptyState, FormField, SettingsSaveBar, Skeleton, clasesBoton } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { RADIO_MAX, RADIO_MIN } from '@/lib/hrm/marcacion/metodos';
import { FOTO_DIAS_MAX, FOTO_DIAS_MIN } from '@/lib/hrm/kiosco/foto';
import { cambiosKiosco, cuerpoKiosco, formularioKioscoDesde, type FormKiosco } from '@/lib/hrm/kiosco/metodosKiosco';
import { DialogoCredenciales } from '../../kiosco/DialogoCredenciales';
import { ErrorEstructura, pedir, useCarga } from '../../estructura/comun';
import { conSede } from '../../asistencia/comunAsistencia';
import { DialogoExcepcion } from './DialogoExcepcion';
import { TarjetaExcepciones } from './TarjetaExcepciones';
import { TarjetaMetodo } from './TarjetaMetodo';
import {
  cambiosFormulario,
  claveErrorGuardar,
  contadorMetodos,
  cuerpoGuardar,
  excepcionesDeSede,
  formularioDesde,
  radioValido,
  rutaLetrero,
  rutaPantallaQr,
  urlAgregarDispositivo,
  urlEnVivo,
  type ExcepcionApi,
  type FormMetodos,
  type MetodoApi,
  type RespuestaMetodos,
} from './metodosVista';

const URL_METODOS = '/api/hrm/marcacion/metodos';
const URL_EXCEPCIONES = '/api/hrm/marcacion/excepciones';

/** Fila etiqueta–valor que deja partir un valor largo (la dirección de la sede). */
function FilaInfo({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[13px] leading-5">
      <span className="shrink-0 text-fg-secondary">{etiqueta}</span>
      <span className="min-w-0 text-right text-sm text-fg">{valor}</span>
    </div>
  );
}

function Casilla({ etiqueta, checked, onChange, disabled }: { etiqueta: ReactNode; checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-2 text-sm leading-5 text-fg ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
      <Checkbox className="mt-0.5" checked={checked} onCheckedChange={(v) => onChange?.(v === true)} disabled={disabled} />
      <span className={disabled ? 'text-fg-secondary' : undefined}>{etiqueta}</span>
    </label>
  );
}

function InsigniaLlega({ children }: { children: string }) {
  return (
    <Badge tono="neutro" apariencia="suave" tamano="sm">
      {children}
    </Badge>
  );
}

export function VistaMetodos({ sede }: { sede: number | null }) {
  const t = useTranslations('hrmMarcacionMetodos');
  const tk = useTranslations('hrmKiosco.metodos');
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const sp = useSearchParams();
  const consulta = sp?.toString() ?? '';
  const { getToday } = useFormatDate();
  const hoy = getToday();

  const [sedeElegida, setSedeElegida] = useState<number | null>(sede);
  useEffect(() => setSedeElegida(sede), [sede]);

  const { carga, recargar } = useCarga<RespuestaMetodos>(conSede(URL_METODOS, sedeElegida));
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const { carga: cargaExcepciones, recargar: recargarExcepciones } = useCarga<ExcepcionApi[]>(datos ? URL_EXCEPCIONES : null);

  const [base, setBase] = useState<FormMetodos | null>(null);
  const [form, setForm] = useState<FormMetodos | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [sedePendiente, setSedePendiente] = useState<number | null>(null);
  const [nuevaExcepcion, setNuevaExcepcion] = useState(false);
  const [baseK, setBaseK] = useState<FormKiosco | null>(null);
  const [formK, setFormK] = useState<FormKiosco | null>(null);
  const [credencialesAbierto, setCredencialesAbierto] = useState(false);

  useEffect(() => {
    if (!datos) return;
    const f = formularioDesde(datos.metodos);
    setBase(f);
    setForm(f);
    const k = formularioKioscoDesde(datos.metodos, datos.foto);
    setBaseK(k);
    setFormK(k);
  }, [datos]);

  const gestionar = datos?.puede_gestionar === true;
  const cambios = (base && form ? cambiosFormulario(base, form) : 0) + (baseK && formK ? cambiosKiosco(baseK, formK) : 0);
  const validacion = form ? cuerpoGuardar(form) : null;
  const validacionK = formK ? cuerpoKiosco(formK) : null;
  const errorValidacion = validacion && !validacion.ok ? validacion.error : validacionK && !validacionK.ok ? validacionK.error : null;

  const excepciones = useMemo(
    () => (cargaExcepciones.estado === 'listo' && datos ? excepcionesDeSede(cargaExcepciones.datos, datos.sede.id) : []),
    [cargaExcepciones, datos]
  );

  const cambiar = useCallback(<K extends keyof FormMetodos>(clave: K, valor: Partial<FormMetodos[K]>) => {
    setForm((f) => (f ? { ...f, [clave]: { ...f[clave], ...valor } } : f));
  }, []);

  const cambiarK = useCallback(<K extends keyof FormKiosco>(clave: K, valor: Partial<FormKiosco[K]>) => {
    setFormK((f) => (f ? { ...f, [clave]: { ...f[clave], ...valor } } : f));
  }, []);

  const descartar = useCallback(() => {
    setForm(base);
    setFormK(baseK);
  }, [base, baseK]);

  const guardar = useCallback(async () => {
    if (!form || !formK || !datos || guardando) return;
    const r = cuerpoGuardar(form);
    if (!r.ok) {
      toast.error(t(`errores.guardar.${claveErrorGuardar(r.error)}`, { min: RADIO_MIN, max: RADIO_MAX }));
      return;
    }
    const rk = cuerpoKiosco(formK);
    if (!rk.ok) {
      toast.error(tk('errores.fotoDias', { min: FOTO_DIAS_MIN, max: FOTO_DIAS_MAX }));
      return;
    }
    setGuardando(true);
    try {
      const metodos = await pedir<Partial<Record<string, MetodoApi>>>(`${URL_METODOS}?sede=${datos.sede.id}`, {
        metodo: 'PUT',
        cuerpo: { metodos: { ...r.metodos, ...rk.metodos } },
      });
      const f = formularioDesde(metodos);
      setBase(f);
      setForm(f);
      const k = formularioKioscoDesde(metodos, { dias: rk.metodos.foto.dias, letrero_puesto: rk.metodos.foto.letrero_puesto });
      setBaseK(k);
      setFormK(k);
      toast.success(t('guardados'), { description: datos.sede.nombre });
    } catch (err) {
      const c = claveErrorGuardar(err instanceof ErrorEstructura ? err.codigo : 'error_hrm');
      toast.error(t(`errores.guardar.${c}`, { min: RADIO_MIN, max: RADIO_MAX }));
    } finally {
      setGuardando(false);
    }
  }, [form, formK, datos, guardando, t, tk]);

  const elegirSede = (id: number) => {
    if (cambios > 0) setSedePendiente(id);
    else setSedeElegida(id);
  };

  const irAgregar = (tipo: 'pantalla_qr' | 'etiqueta_nfc') => router.push(urlAgregarDispositivo(pathname, consulta, tipo));

  // ── Estados de carga (Figma 20.27.4–20.27.9) ───────────────────────────────
  if (carga.estado === 'cargando' || (datos && (!form || !formK))) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={t('cargando')}>
        <Skeleton className="h-5 w-full max-w-xl" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }
  if (carga.estado === 'sinPermiso') {
    return (
      <EmptyState
        variante="forbidden"
        titulo={t('sinPermiso.titulo')}
        descripcion={t('sinPermiso.descripcion')}
        accion={{ etiqueta: t('sinPermiso.irInicio'), href: '/app/inicio', icono: Home }}
      />
    );
  }
  if (!datos || !form || !base || !formK) {
    return <EmptyState variante="error" titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={() => void recargar()} />;
  }

  const contadorM0 = contadorMetodos(form, datos.personas_remoto);
  const contador = { ...contadorM0, activos: contadorM0.activos + (formK.pin.activo ? 1 : 0) };
  const rutaQr = rutaPantallaQr(datos.pantallas);
  const nEtiquetas = datos.etiquetas.length;
  const llegaKiosco = tk('proximamente');
  const llegaRelojes = t('llegaRelojes');

  return (
    <div className={`flex flex-col gap-4 ${cambios > 0 ? 'pb-24 lg:pb-0' : ''}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] leading-[18px] text-fg-secondary">
          {t('contexto', { sede: datos.sede.nombre, activos: contador.activos, total: contador.total })}
        </p>
        {datos.sedes.length > 1 && (
          <Select value={String(datos.sede.id)} onValueChange={(v) => elegirSede(Number(v))} disabled={guardando}>
            <SelectTrigger aria-label={t('elegirSede')} className="h-9 w-full border-line-strong bg-surface sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {datos.sedes.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <p className="text-sm leading-5 text-fg-secondary">{t('intro')}</p>

      {!gestionar && (
        <AvisoTonal
          tono="neutro"
          titulo={t('soloLectura.titulo')}
          descripcion={t('soloLectura.descripcion')}
          accion={{ etiqueta: t('soloLectura.irEnVivo'), href: urlEnVivo(pathname, consulta) }}
        />
      )}
      {gestionar && errorValidacion === 'sin_metodos' && <AvisoTonal tono="advertencia" rol="alert" titulo={t('errores.guardar.sin_metodos')} />}

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2 lg:gap-5">
        {/* Celular con ubicación */}
        <TarjetaMetodo
          icono={LocateFixed}
          titulo={t('metodos.celular_ubicacion.titulo')}
          descripcion={t('tarjetas.celular.descripcion')}
          resumen={
            form.celular.activo
              ? t('tarjetas.celular.resumen', { radio: form.celular.radio ?? 0, computador: form.celular.computador ? 'si' : 'no' })
              : t('apagado')
          }
          control={
            <Switch
              checked={form.celular.activo}
              onCheckedChange={(v) => cambiar('celular', { activo: v })}
              disabled={!gestionar}
              aria-label={t('tarjetas.celular.activar')}
            />
          }
        >
          <FormField
            etiqueta={t('tarjetas.celular.radio')}
            ayuda={t('tarjetas.celular.radioAyuda')}
            error={radioValido(form.celular.radio) ? null : t('errores.guardar.radio_invalido', { min: RADIO_MIN, max: RADIO_MAX })}
            className="max-w-[280px]"
          >
            {(c) => (
              <CampoNumero
                id={c.id}
                aria-describedby={c['aria-describedby']}
                aria-invalid={c['aria-invalid']}
                className="w-[200px]"
                valor={form.celular.radio}
                onValorChange={(v) => cambiar('celular', { radio: v })}
                decimales={0}
                maximo={RADIO_MAX}
                sufijo={t('unidades.metros')}
                disabled={!gestionar}
              />
            )}
          </FormField>
          <FilaInfo
            etiqueta={t('tarjetas.celular.ubicacion')}
            valor={
              datos.sede.con_ubicacion
                ? t('tarjetas.celular.ubicacionFijada', { direccion: datos.sede.direccion || datos.sede.nombre })
                : datos.sede.direccion || t('tarjetas.celular.sinDireccion')
            }
          />
          {!datos.sede.con_ubicacion && (
            <AvisoTonal compacto tono="advertencia" titulo={t('tarjetas.celular.sinUbicacion')} descripcion={t('tarjetas.celular.sinUbicacionDetalle')} />
          )}
          <Casilla etiqueta={tk('fotoCelular')} checked={false} disabled />
          <Casilla
            etiqueta={t('tarjetas.celular.computador')}
            checked={form.celular.computador}
            onChange={(v) => cambiar('celular', { computador: v })}
            disabled={!gestionar}
          />
        </TarjetaMetodo>

        {/* QR de la sede */}
        <TarjetaMetodo
          icono={ScanQrCode}
          titulo={t('metodos.qr.titulo')}
          descripcion={t('tarjetas.qr.descripcion')}
          resumen={form.qr.activo ? t('tarjetas.qr.resumen', { ubicacion: form.qr.exigirUbicacion ? 'si' : 'no' }) : t('apagado')}
          control={
            <Switch checked={form.qr.activo} onCheckedChange={(v) => cambiar('qr', { activo: v })} disabled={!gestionar} aria-label={t('tarjetas.qr.activar')} />
          }
        >
          <FormField etiqueta={t('tarjetas.qr.comoSeMuestra')} ayuda={t('tarjetas.qr.comoSeMuestraAyuda')}>
            {(c) => (
              <Select value="rotativo" disabled={!gestionar}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rotativo">{t('tarjetas.qr.rotativo')}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('tarjetas.qr.cambiaCada')} ayuda={t('tarjetas.qr.cambiaCadaAyuda')}>
            {(c) => (
              <CampoNumero
                id={c.id}
                aria-describedby={c['aria-describedby']}
                className="w-[200px]"
                valor={30}
                onValorChange={() => undefined}
                decimales={0}
                sufijo={t('unidades.segundos')}
                disabled
              />
            )}
          </FormField>
          <Casilla etiqueta={t('tarjetas.qr.unSoloUso')} checked disabled />
          <FormField etiqueta={t('tarjetas.qr.pedirAdemas')}>
            {(c) => (
              <Select
                value={form.qr.exigirUbicacion ? 'ubicacion' : 'nada'}
                onValueChange={(v) => cambiar('qr', { exigirUbicacion: v === 'ubicacion' })}
                disabled={!gestionar}
              >
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nada">{t('tarjetas.qr.ademasNada')}</SelectItem>
                  <SelectItem value="ubicacion">{t('tarjetas.qr.ademasUbicacion')}</SelectItem>
                  <SelectItem value="pin" disabled>
                    {t('tarjetas.qr.ademasPin', { cuando: llegaKiosco })}
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
          {gestionar && (
            <div>
              <button
                type="button"
                className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                onClick={() => (rutaQr ? window.open(rutaQr, '_blank', 'noopener') : irAgregar('pantalla_qr'))}
              >
                <MonitorSmartphone aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {rutaQr ? t('tarjetas.qr.abrirPantalla') : t('tarjetas.qr.agregarPantalla')}
              </button>
            </div>
          )}
        </TarjetaMetodo>

        {/* Carné o etiqueta NFC */}
        <TarjetaMetodo
          icono={Nfc}
          titulo={t('metodos.nfc_etiqueta.titulo')}
          descripcion={t('tarjetas.nfc.descripcion')}
          resumen={form.nfc.activo ? t('tarjetas.nfc.resumen', { n: nEtiquetas }) : t('apagado')}
          control={
            <Switch checked={form.nfc.activo} onCheckedChange={(v) => cambiar('nfc', { activo: v })} disabled={!gestionar} aria-label={t('tarjetas.nfc.activar')} />
          }
        >
          <FilaInfo
            etiqueta={t('tarjetas.nfc.etiquetas')}
            valor={nEtiquetas === 0 ? t('tarjetas.nfc.ninguna') : `${nEtiquetas} · ${datos.etiquetas.map((e) => e.nombre).join(', ')}`}
          />
          <FilaInfo etiqueta={t('tarjetas.nfc.carnes')} valor={tk('deTotal', { n: datos.credenciales?.carnes ?? 0, total: datos.personas })} />
          <Casilla etiqueta={tk('carne.activo')} checked={formK.carne.activo} onChange={(v) => cambiarK('carne', { activo: v })} disabled={!gestionar} />
          <Casilla etiqueta={tk('carne.foto')} checked={formK.carne.foto} onChange={(v) => cambiarK('carne', { foto: v })} disabled={!gestionar || !formK.carne.activo} />
          <p className="text-[13px] leading-[18px] text-fg-secondary">{t('tarjetas.nfc.exigeUbicacion')}</p>
          {gestionar && (
            <div>
              <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => irAgregar('etiqueta_nfc')}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('tarjetas.nfc.registrar')}
              </button>
              <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'ml-2' })} onClick={() => setCredencialesAbierto(true)}>
                <KeyRound aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {tk('pinYCarnes')}
              </button>
            </div>
          )}
        </TarjetaMetodo>

        {/* Kiosco con PIN (M1, D11) */}
        <TarjetaMetodo
          icono={KeyRound}
          titulo={t('metodos.pin.titulo')}
          descripcion={t('tarjetas.pin.descripcion')}
          resumen={formK.pin.activo ? tk('pin.resumen', { n: datos.credenciales?.pines ?? 0, total: datos.personas }) : t('apagado')}
          control={
            <Switch checked={formK.pin.activo} onCheckedChange={(v) => cambiarK('pin', { activo: v })} disabled={!gestionar} aria-label={tk('pin.activar')} />
          }
        >
          <FormField etiqueta={tk('pin.largo')} className="max-w-[280px]">
            {(c) => (
              <CampoNumero id={c.id} aria-describedby={c['aria-describedby']} className="w-[200px]" valor={6} onValorChange={() => undefined} decimales={0} sufijo={tk('pin.digitos')} disabled />
            )}
          </FormField>
          <Casilla etiqueta={tk('pin.foto')} checked={formK.pin.foto} onChange={(v) => cambiarK('pin', { foto: v })} disabled={!gestionar || !formK.pin.activo} />
          <FormField etiqueta={tk('pin.bloqueo')}>
            {(c) => (
              <Select value="5_15" disabled={!gestionar}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5_15">{tk('pin.bloqueoValor')}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
          {gestionar && (
            <div>
              <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => setCredencialesAbierto(true)}>
                <KeyRound aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {tk('pinYCarnes')}
              </button>
            </div>
          )}
        </TarjetaMetodo>

        {/* Rostro (M2) */}
        <TarjetaMetodo
          icono={ScanFace}
          apagada
          titulo={t('metodos.rostro.titulo')}
          descripcion={t('tarjetas.rostro.descripcion')}
          resumen={llegaRelojes}
          control={<Switch checked={false} disabled aria-label={t('tarjetas.noDisponible', { metodo: t('metodos.rostro.titulo'), cuando: llegaRelojes })} />}
        >
          <div>
            <InsigniaLlega>{llegaRelojes}</InsigniaLlega>
          </div>
        </TarjetaMetodo>

        {/* Huella (M2) */}
        <TarjetaMetodo
          icono={Fingerprint}
          apagada
          titulo={t('metodos.huella.titulo')}
          descripcion={t('tarjetas.huella.descripcion')}
          resumen={llegaRelojes}
          control={<Switch checked={false} disabled aria-label={t('tarjetas.noDisponible', { metodo: t('metodos.huella.titulo'), cuando: llegaRelojes })} />}
        >
          <div>
            <InsigniaLlega>{llegaRelojes}</InsigniaLlega>
          </div>
        </TarjetaMetodo>

        {/* Trabajo remoto */}
        <TarjetaMetodo
          icono={Laptop}
          titulo={t('tarjetas.remoto.titulo')}
          descripcion={t('tarjetas.remoto.descripcion')}
          resumen={t('tarjetas.remoto.resumen')}
          control={
            <Badge tono="neutro" apariencia="suave" tamano="sm" className="tabular-nums">
              {t('tarjetas.remoto.personas', { n: datos.personas_remoto })}
            </Badge>
          }
        />

        {/* Marca manual con aprobación */}
        <TarjetaMetodo
          icono={PenLine}
          titulo={t('tarjetas.manual.titulo')}
          descripcion={t('tarjetas.manual.descripcion')}
          resumen={t('tarjetas.manual.resumen')}
          control={
            <Badge tono="neutro" apariencia="suave" tamano="sm">
              {t('tarjetas.manual.siempreActiva')}
            </Badge>
          }
        />

        {/* Foto de evidencia y letrero */}
        <TarjetaMetodo icono={Camera} titulo={t('tarjetas.foto.titulo')} descripcion={t('tarjetas.foto.descripcion')} resumen={t('tarjetas.foto.resumen')}>
          <FormField
            etiqueta={t('tarjetas.foto.seBorra')}
            ayuda={tk('foto.ayuda', { min: FOTO_DIAS_MIN, max: FOTO_DIAS_MAX })}
            error={errorValidacion === 'foto_dias_invalido' ? tk('errores.fotoDias', { min: FOTO_DIAS_MIN, max: FOTO_DIAS_MAX }) : null}
            className="max-w-[320px]"
          >
            {(c) => (
              <CampoNumero
                id={c.id}
                aria-describedby={c['aria-describedby']}
                aria-invalid={c['aria-invalid']}
                className="w-[200px]"
                valor={formK.foto.dias}
                onValorChange={(v) => cambiarK('foto', { dias: v })}
                decimales={0}
                maximo={FOTO_DIAS_MAX}
                sufijo={tk('foto.dias')}
                disabled={!gestionar}
              />
            )}
          </FormField>
          <FilaInfo etiqueta={tk('foto.autorizaciones')} valor={tk('foto.personas', { n: datos.foto?.autorizadas ?? 0, total: datos.personas })} />
          <Casilla etiqueta={tk('foto.letrero', { sede: datos.sede.nombre })} checked={formK.foto.letrero} onChange={(v) => cambiarK('foto', { letrero: v })} disabled={!gestionar} />
          <div>
            <button
              type="button"
              className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
              onClick={() => window.open(rutaLetrero(datos.sede.id), '_blank', 'noopener')}
            >
              <Printer aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('tarjetas.foto.letrero')}
            </button>
          </div>
        </TarjetaMetodo>

        {/* Excepciones temporales */}
        <TarjetaExcepciones
          carga={cargaExcepciones}
          excepciones={excepciones}
          hoy={hoy}
          puedeGestionar={gestionar}
          onAgregar={() => setNuevaExcepcion(true)}
          onRecargar={() => void recargarExcepciones()}
        />
      </div>

      <p className="text-[13px] leading-[18px] text-fg-secondary lg:hidden">{t('tocaMetodo')}</p>

      {gestionar && (
        <SettingsSaveBar
          cambios={cambios}
          guardando={guardando}
          onGuardar={() => void guardar()}
          onDescartar={descartar}
          deshabilitado={errorValidacion !== null}
          motivo={
            errorValidacion === 'foto_dias_invalido'
              ? tk('errores.fotoDias', { min: FOTO_DIAS_MIN, max: FOTO_DIAS_MAX })
              : errorValidacion
                ? t(`errores.guardar.${claveErrorGuardar(errorValidacion)}`, { min: RADIO_MIN, max: RADIO_MAX })
                : undefined
          }
          mensaje={t('cambiosSinGuardar')}
        />
      )}

      {gestionar && (
        <DialogoCredenciales abierto={credencialesAbierto} onAbiertoChange={setCredencialesAbierto} sedeId={datos.sede.id} sedeNombre={datos.sede.nombre} />
      )}

      {gestionar && (
        <DialogoExcepcion
          abierto={nuevaExcepcion}
          onAbiertoChange={setNuevaExcepcion}
          sedeId={datos.sede.id}
          hoy={hoy}
          onEnviada={() => void recargarExcepciones()}
        />
      )}

      <ConfirmDialog
        abierto={sedePendiente !== null}
        onAbiertoChange={(a) => !a && setSedePendiente(null)}
        tono="advertencia"
        titulo={t('cambiarSede.titulo')}
        descripcion={t('cambiarSede.descripcion', { sede: datos.sede.nombre })}
        textoConfirmar={t('cambiarSede.confirmar')}
        textoCancelar={t('cambiarSede.cancelar')}
        onConfirmar={() => {
          if (sedePendiente !== null) setSedeElegida(sedePendiente);
          setSedePendiente(null);
        }}
      />
    </div>
  );
}
