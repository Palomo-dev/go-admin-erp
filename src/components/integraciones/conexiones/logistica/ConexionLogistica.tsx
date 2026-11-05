'use client';

/**
 * Formulario de conexión de logística generado desde `settings_schema` del conector.
 *
 * - Los secretos se escriben aquí y van al Vault por el servidor; nunca vuelven al navegador (se
 *   muestra solo su prefijo). Un secreto vacío conserva el que ya está guardado.
 * - Guardar deja la conexión en «Borrador»: solo «Probar conexión» (llamada real al proveedor) la
 *   pasa a «Conectada». Si el adaptador todavía no existe, la prueba lo dice y la conexión no se
 *   activa.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, CircleAlert, Clock, Copy, Loader2, PlugZap, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { CampoConexion, EsquemaConexion } from '@/lib/integrations/core/esquemaConexion';
import { rutaWebhookLogistica } from '@/lib/integrations/core/rutasLogistica';

const API = '/api/integrations/logistica/conexiones';
const VOLVER = '/app/integraciones/conexiones?categoria=delivery';

const AMBIENTES: Record<string, string> = { sandbox: 'Sandbox (pruebas)', production: 'Producción' };

const ESTADOS: Record<string, { etiqueta: string; clase: string }> = {
  connected: { etiqueta: 'Conectada', clase: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  draft: { etiqueta: 'Borrador: falta probar', clase: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  error: { etiqueta: 'Error', clase: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  paused: { etiqueta: 'Pausada', clase: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  revoked: { etiqueta: 'Revocada', clase: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
};

const ADAPTADOR: Record<string, string> = {
  disponible: 'Integración disponible',
  en_construccion: 'Integración en construcción',
  doc_pendiente: 'Esperando documentación oficial',
  proximamente: 'Próximamente',
};

interface Estado {
  connectionId: string;
  proveedor: { code: string; nombre: string };
  estadoAdaptador: string;
  notaAdaptador: string;
  environment: string;
  status: string;
  esquema: EsquemaConexion;
  ajustes: Record<string, unknown>;
  secretos: Record<string, { prefijo: string | null; enVault: boolean; actualizado: string | null }>;
  faltantes: string[];
  ultimoError: string | null;
  ultimaPrueba: string | null;
  conectadaDesde: string | null;
  avisos: boolean;
}

interface Catalogo {
  proveedor: {
    code: string;
    nombre: string;
    estadoAdaptador: string;
    notaAdaptador: string;
    conectable: boolean;
    ambientes: string[];
    docPendiente: boolean;
    fuente: string | null;
  };
  conexiones: { connectionId: string; nombre: string; environment: string; status: string }[];
}

async function leerJson<T>(res: Response): Promise<T & { error?: string; errores?: Record<string, string> }> {
  return (await res.json().catch(() => ({}))) as T & { error?: string; errores?: Record<string, string> };
}

function Volver() {
  return (
    <Link href={VOLVER} className="inline-flex items-center gap-1 text-sm text-blue-700 dark:text-blue-400 hover:underline">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Conexiones de logística
    </Link>
  );
}

/** Paso 1: elegir ambiente y crear (o retomar) la conexión con el proveedor. */
export function IniciarConexionLogistica({ proveedor }: { proveedor: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ambiente, setAmbiente] = useState<string>('');
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    if (!proveedor) {
      setError('Falta el proveedor.');
      return;
    }
    let vivo = true;
    fetch(`${API}?proveedor=${encodeURIComponent(proveedor)}`)
      .then(async (res) => {
        const datos = await leerJson<Catalogo>(res);
        if (!vivo) return;
        if (!res.ok) throw new Error(datos.error ?? 'No se pudo cargar el proveedor.');
        setCatalogo(datos);
        setAmbiente(datos.proveedor.ambientes[0] ?? '');
      })
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : 'No se pudo cargar el proveedor.'));
    return () => {
      vivo = false;
    };
  }, [proveedor]);

  const crear = async () => {
    setCreando(true);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectorCode: proveedor, environment: ambiente }),
      });
      const datos = await leerJson<{ connectionId: string; creada: boolean }>(res);
      if (!res.ok) throw new Error(datos.error ?? 'No se pudo crear la conexión.');
      if (!datos.creada) toast({ title: 'Ya tenías esta conexión', description: 'Abrimos la conexión existente.' });
      router.replace(`/app/integraciones/conexiones/logistica?conexion=${datos.connectionId}`);
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'No se pudo crear la conexión.', variant: 'destructive' });
      setCreando(false);
    }
  };

  if (error) {
    return (
      <div className="max-w-3xl space-y-4">
        <Volver />
        <Alert variant="destructive">
          <CircleAlert className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>No se puede conectar</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!catalogo) return <Skeleton className="h-64 w-full max-w-3xl" />;

  const p = catalogo.proveedor;
  return (
    <div className="max-w-3xl space-y-4">
      <Volver />
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-xl">{p.nombre}</CardTitle>
            <Badge variant="outline">{ADAPTADOR[p.estadoAdaptador] ?? p.estadoAdaptador}</Badge>
          </div>
          <CardDescription>{p.notaAdaptador}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {catalogo.conexiones.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">Tus conexiones con {p.nombre}</h2>
              <ul className="space-y-1">
                {catalogo.conexiones.map((c) => (
                  <li key={c.connectionId}>
                    <Link
                      href={`/app/integraciones/conexiones/logistica?conexion=${c.connectionId}`}
                      className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <span className="font-medium text-gray-900 dark:text-gray-100">{c.nombre}</span>
                      <span className="text-gray-500 dark:text-gray-400">{AMBIENTES[c.environment] ?? c.environment}</span>
                      <span className={`ml-auto rounded px-2 py-0.5 text-xs ${ESTADOS[c.status]?.clase ?? ''}`}>{ESTADOS[c.status]?.etiqueta ?? c.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {p.conectable ? (
            <>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-gray-900 dark:text-gray-100">Ambiente</legend>
                <div className="flex flex-wrap gap-3">
                  {p.ambientes.map((a) => (
                    <label
                      key={a}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                        ambiente === a ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40' : 'border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <input type="radio" name="ambiente" value={a} checked={ambiente === a} onChange={() => setAmbiente(a)} className="accent-blue-600" />
                      {AMBIENTES[a] ?? a}
                    </label>
                  ))}
                </div>
                {p.ambientes.length === 1 && p.ambientes[0] === 'production' && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">La documentación oficial de {p.nombre} no publica un sandbox: solo hay producción.</p>
                )}
              </fieldset>
              {p.docPendiente && (
                <Alert>
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  <AlertTitle>Sin documentación oficial todavía</AlertTitle>
                  <AlertDescription>Puedes dejar guardados tus datos de acceso; la prueba y la conexión llegan cuando {p.nombre} entregue la documentación.</AlertDescription>
                </Alert>
              )}
              <Button onClick={crear} disabled={!ambiente || creando} className="gap-2">
                {creando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PlugZap className="h-4 w-4" aria-hidden="true" />}
                Crear conexión
              </Button>
            </>
          ) : (
            <Alert>
              <Clock className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Próximamente</AlertTitle>
              <AlertDescription>{p.notaAdaptador}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Campo({
  campo,
  valor,
  onChange,
  guardado,
  error,
}: {
  campo: CampoConexion;
  valor: string;
  onChange: (v: string) => void;
  guardado: { prefijo: string | null; enVault: boolean } | undefined;
  error?: string;
}) {
  const id = `campo-${campo.clave}`;
  const ayudaId = `${id}-ayuda`;
  const errorId = `${id}-error`;
  const describe = [campo.ayuda || (campo.secreto && guardado?.enVault) ? ayudaId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {campo.etiqueta}
        {campo.requerido && <span className="text-red-600" aria-hidden="true"> *</span>}
      </Label>
      {campo.tipo === 'seleccion' && campo.opciones ? (
        <select
          id={id}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          required={campo.requerido}
          aria-invalid={!!error}
          aria-describedby={describe}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Selecciona…</option>
          {campo.opciones.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : (
        <Input
          id={id}
          type={campo.secreto ? 'password' : 'text'}
          inputMode={campo.tipo === 'numero' ? 'numeric' : undefined}
          autoComplete={campo.secreto ? 'new-password' : 'off'}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={campo.secreto && guardado?.enVault ? `Guardado (${guardado.prefijo ?? '••••'}). Déjalo vacío para conservarlo.` : undefined}
          aria-required={campo.requerido}
          aria-invalid={!!error}
          aria-describedby={describe}
        />
      )}
      {(campo.ayuda || (campo.secreto && guardado?.enVault)) && (
        <p id={ayudaId} className="text-xs text-gray-500 dark:text-gray-400">
          {campo.ayuda}
          {campo.secreto && guardado?.enVault ? `${campo.ayuda ? ' ' : ''}Guardado en el Vault.` : ''}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** URL de avisos única de la conexión (organización + proveedor), con botón para copiarla. */
function UrlAvisos({ proveedor, connectionId }: { proveedor: string; connectionId: string }) {
  const { toast } = useToast();
  const [origen, setOrigen] = useState('');
  useEffect(() => setOrigen(window.location.origin), []);
  const url = `${origen}${rutaWebhookLogistica(proveedor, connectionId)}`;
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'URL copiada' });
    } catch {
      toast({ title: 'No se pudo copiar', description: 'Selecciona la URL y cópiala a mano.', variant: 'destructive' });
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 break-all rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-1.5 text-xs text-gray-800 dark:text-gray-200">{url}</code>
      <Button type="button" variant="outline" size="sm" onClick={copiar} className="gap-1" aria-label="Copiar URL de avisos">
        <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copiar
      </Button>
    </div>
  );
}

/** Paso 2: credenciales y prueba de una conexión existente. */
export function ConexionLogistica({ connectionId }: { connectionId: string }) {
  const { toast } = useToast();
  const { formatDateTime } = useFormatDate();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [sinGuardar, setSinGuardar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`${API}/${encodeURIComponent(connectionId)}`);
      const datos = await leerJson<Estado>(res);
      if (!res.ok) throw new Error(datos.error ?? 'No se pudo cargar la conexión.');
      setEstado(datos);
      setValores(
        Object.fromEntries(
          datos.esquema.campos.filter((c) => !c.secreto).map((c) => [c.clave, datos.ajustes[c.clave] == null ? '' : String(datos.ajustes[c.clave])]),
        ),
      );
      setSinGuardar(false);
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : 'No se pudo cargar la conexión.');
    }
  }, [connectionId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cambiar = (clave: string, v: string) => {
    setValores((prev) => ({ ...prev, [clave]: v }));
    setErrores((prev) => {
      const { [clave]: _quitado, ...resto } = prev;
      return resto;
    });
    setSinGuardar(true);
    setResultado(null);
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!estado) return;
    setGuardando(true);
    setErrores({});
    try {
      // Solo se mandan los secretos que se escribieron: vacío = conservar el del Vault.
      const enviar = Object.fromEntries(
        Object.entries(valores).filter(([clave, v]) => {
          const campo = estado.esquema.campos.find((c) => c.clave === clave);
          return campo && (!campo.secreto || v !== '');
        }),
      );
      const res = await fetch(`${API}/${encodeURIComponent(connectionId)}/credenciales`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valores: enviar }),
      });
      const datos = await leerJson<{ guardados: string[] }>(res);
      if (!res.ok) {
        if (datos.errores) setErrores(datos.errores);
        throw new Error(datos.error ?? 'No se pudieron guardar los datos.');
      }
      toast({ title: 'Datos guardados', description: 'Ahora prueba la conexión para activarla.' });
      await cargar();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'No se pudieron guardar los datos.', variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  const probar = async () => {
    setProbando(true);
    setResultado(null);
    try {
      const res = await fetch(`${API}/${encodeURIComponent(connectionId)}/probar`, { method: 'POST' });
      const datos = await leerJson<{ ok?: boolean; mensaje?: string }>(res);
      const ok = res.ok && datos.ok === true;
      setResultado({ ok, mensaje: ok ? 'El proveedor aceptó las credenciales. La conexión quedó activa.' : datos.mensaje ?? datos.error ?? 'No se pudo probar la conexión.' });
      await cargar();
    } catch {
      setResultado({ ok: false, mensaje: 'No se pudo probar la conexión.' });
    } finally {
      setProbando(false);
    }
  };

  if (errorCarga) {
    return (
      <div className="max-w-3xl space-y-4">
        <Volver />
        <Alert variant="destructive">
          <CircleAlert className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>No se pudo abrir la conexión</AlertTitle>
          <AlertDescription>{errorCarga}</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!estado) return <Skeleton className="h-96 w-full max-w-3xl" />;

  const st = ESTADOS[estado.status] ?? { etiqueta: estado.status, clase: '' };
  const puedeProbar = !sinGuardar && estado.faltantes.length === 0 && !estado.esquema.doc_pendiente;
  const etiquetaDe = (clave: string) => estado.esquema.campos.find((c) => c.clave === clave)?.etiqueta ?? clave;

  return (
    <div className="max-w-3xl space-y-4">
      <Volver />
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-xl">{estado.proveedor.nombre}</CardTitle>
            <Badge variant="outline">{AMBIENTES[estado.environment] ?? estado.environment}</Badge>
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${st.clase}`}>{st.etiqueta}</span>
          </div>
          <CardDescription>
            {ADAPTADOR[estado.estadoAdaptador] ?? estado.estadoAdaptador}. {estado.notaAdaptador}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {estado.esquema.doc_pendiente && (
            <Alert>
              <Clock className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Sin documentación oficial todavía</AlertTitle>
              <AlertDescription>Tus datos quedan guardados. La prueba y la conexión llegan cuando el proveedor entregue la documentación.</AlertDescription>
            </Alert>
          )}

          <form onSubmit={guardar} className="space-y-4" noValidate>
            {estado.esquema.campos.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">Este proveedor todavía no publica qué datos de acceso pide.</p>
            ) : (
              estado.esquema.campos.map((c) => (
                <Campo
                  key={c.clave}
                  campo={c}
                  valor={valores[c.clave] ?? ''}
                  onChange={(v) => cambiar(c.clave, v)}
                  guardado={estado.secretos[c.clave]}
                  error={errores[c.clave]}
                />
              ))
            )}
            {estado.esquema.fuente && (
              <p className="text-xs text-gray-500 dark:text-gray-400 break-words">Campos según: {estado.esquema.fuente}</p>
            )}
            {estado.esquema.campos.length > 0 && (
              <Button type="submit" disabled={guardando} className="gap-2">
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                Guardar datos
              </Button>
            )}
          </form>

          <section aria-labelledby="titulo-prueba" className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
            <h2 id="titulo-prueba" className="text-sm font-medium text-gray-900 dark:text-gray-100">Probar conexión</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              La conexión solo queda activa cuando {estado.proveedor.nombre} acepta las credenciales en una llamada real.
            </p>
            {estado.faltantes.length > 0 && (
              <p className="text-sm text-amber-700 dark:text-amber-400">Falta: {estado.faltantes.map(etiquetaDe).join(', ')}.</p>
            )}
            {sinGuardar && <p className="text-sm text-amber-700 dark:text-amber-400">Guarda los cambios antes de probar.</p>}
            <Button type="button" variant="outline" onClick={probar} disabled={!puedeProbar || probando} className="gap-2">
              {probando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PlugZap className="h-4 w-4" aria-hidden="true" />}
              Probar conexión
            </Button>
            <div aria-live="polite">
              {resultado && (
                <Alert variant={resultado.ok ? 'default' : 'destructive'}>
                  {resultado.ok ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <CircleAlert className="h-4 w-4" aria-hidden="true" />}
                  <AlertTitle>{resultado.ok ? 'Conexión activa' : 'La conexión no quedó activa'}</AlertTitle>
                  <AlertDescription>{resultado.mensaje}</AlertDescription>
                </Alert>
              )}
            </div>
            {!resultado && estado.ultimoError && (
              <p className="text-sm text-gray-600 dark:text-gray-400">Última prueba: {estado.ultimoError}</p>
            )}
            {estado.ultimaPrueba && (
              <p className="text-xs text-gray-500 dark:text-gray-400">Probada por última vez: {formatDateTime(estado.ultimaPrueba)}</p>
            )}
          </section>

          <section aria-labelledby="titulo-avisos" className="space-y-2 border-t border-gray-200 dark:border-gray-700 pt-4">
            <h2 id="titulo-avisos" className="text-sm font-medium text-gray-900 dark:text-gray-100">Avisos del proveedor (webhook)</h2>
            <UrlAvisos proveedor={estado.proveedor.code} connectionId={estado.connectionId} />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {estado.avisos
                ? 'La URL queda lista; los avisos se procesan cuando el adaptador verifique la firma del proveedor.'
                : `Según su documentación, ${estado.proveedor.nombre} no envía avisos automáticos: el estado de las guías se consultará por rastreo. La URL queda reservada y por ahora responde «no habilitado».`}
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
