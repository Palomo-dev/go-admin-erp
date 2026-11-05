'use client';

/**
 * Ajustes de envío de la organización: interruptor de integraciones con transportadoras y peso y
 * medidas por defecto (organización y categoría). El peso es obligatorio para generar una guía: el
 * de cada producto manda; si no tiene, el de su categoría; si tampoco, el de la organización.
 */
import { useEffect, useState } from 'react';
import { ChevronDown, Loader2, Save, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';

interface Ajustes {
  carrierIntegrationsEnabled: boolean;
  dropshippingEnabled: boolean;
  defaultWeightKg: number | null;
  defaultLengthCm: number | null;
  defaultWidthCm: number | null;
  defaultHeightCm: number | null;
}
interface Categoria {
  id: number;
  nombre: string;
  defaultWeightKg: number | null;
}

const API = '/api/transport/ajustes-envio';

const aTexto = (n: number | null) => (n === null ? '' : String(n));
/** '' → null; número > 0 → número; cualquier otra cosa → NaN (inválido). */
const aNumero = (s: string): number | null => {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : Number.NaN;
};

const MEDIDAS: { clave: 'defaultWeightKg' | 'defaultLengthCm' | 'defaultWidthCm' | 'defaultHeightCm'; etiqueta: string }[] = [
  { clave: 'defaultWeightKg', etiqueta: 'Peso por defecto (kg)' },
  { clave: 'defaultLengthCm', etiqueta: 'Largo (cm)' },
  { clave: 'defaultWidthCm', etiqueta: 'Ancho (cm)' },
  { clave: 'defaultHeightCm', etiqueta: 'Alto (cm)' },
];

export function AjustesEnvioCard() {
  const { toast } = useToast();
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activo, setActivo] = useState(false);
  const [medidas, setMedidas] = useState<Record<string, string>>({});
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [pesosCat, setPesosCat] = useState<Record<number, string>>({});
  const [verCategorias, setVerCategorias] = useState(false);

  const aplicar = (datos: { ajustes: Ajustes; categorias: Categoria[] }) => {
    setActivo(datos.ajustes.carrierIntegrationsEnabled);
    setMedidas(Object.fromEntries(MEDIDAS.map((m) => [m.clave, aTexto(datos.ajustes[m.clave])])));
    setCategorias(datos.categorias);
    setPesosCat(Object.fromEntries(datos.categorias.map((c) => [c.id, aTexto(c.defaultWeightKg)])));
  };

  useEffect(() => {
    let vivo = true;
    fetch(API)
      .then(async (res) => {
        const datos = await res.json().catch(() => ({}));
        if (!vivo) return;
        if (!res.ok) throw new Error(datos.error ?? 'No se pudieron leer los ajustes de envío.');
        aplicar(datos);
      })
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : 'No se pudieron leer los ajustes de envío.'))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, []);

  const guardar = async () => {
    const valores = Object.fromEntries(MEDIDAS.map((m) => [m.clave, aNumero(medidas[m.clave] ?? '')]));
    const cambiosCat = categorias
      .map((c) => ({ id: c.id, defaultWeightKg: aNumero(pesosCat[c.id] ?? '') }))
      .filter((c, i) => c.defaultWeightKg !== categorias[i].defaultWeightKg);
    const invalido = [...Object.values(valores), ...cambiosCat.map((c) => c.defaultWeightKg)].some((v) => typeof v === 'number' && Number.isNaN(v));
    if (invalido) {
      toast({ title: 'Revisa los valores', description: 'Pesos y medidas deben ser números mayores que cero, o quedar vacíos.', variant: 'destructive' });
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrierIntegrationsEnabled: activo, ...valores, categorias: cambiosCat }),
      });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(datos.error ?? 'No se pudieron guardar los ajustes.');
      aplicar(datos);
      toast({ title: 'Ajustes de envío guardados' });
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'No se pudieron guardar los ajustes.', variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4" aria-hidden="true" /> Ajustes de envío
        </CardTitle>
        <CardDescription>
          El peso es obligatorio para generar una guía: manda el del producto; si no tiene, el de su categoría; si tampoco, el de la organización.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {cargando ? (
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" aria-label="Cargando" />
        ) : error ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-start gap-3">
              <Switch id="integraciones-transportadoras" checked={activo} onCheckedChange={setActivo} aria-describedby="integraciones-transportadoras-ayuda" />
              <div className="min-w-0 flex-1">
                <Label htmlFor="integraciones-transportadoras">Usar integraciones con transportadoras</Label>
                <p id="integraciones-transportadoras-ayuda" className="text-xs text-gray-500 dark:text-gray-400">
                  Apagado, todo sigue igual que hoy: el envío propio a tarifa plana no cambia.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {MEDIDAS.map((m) => (
                <div key={m.clave} className="space-y-1">
                  <Label htmlFor={`medida-${m.clave}`} className="text-xs">{m.etiqueta}</Label>
                  <Input
                    id={`medida-${m.clave}`}
                    inputMode="decimal"
                    value={medidas[m.clave] ?? ''}
                    onChange={(e) => setMedidas((prev) => ({ ...prev, [m.clave]: e.target.value }))}
                  />
                </div>
              ))}
            </div>

            {categorias.length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setVerCategorias((v) => !v)}
                  aria-expanded={verCategorias}
                  aria-controls="pesos-categorias"
                  className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 dark:text-blue-400 hover:underline"
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${verCategorias ? 'rotate-180' : ''}`} aria-hidden="true" />
                  Peso por defecto por categoría
                </button>
                {verCategorias && (
                  <div id="pesos-categorias" className="max-h-72 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-800 text-left">
                        <tr>
                          <th scope="col" className="px-3 py-2 font-medium">Categoría</th>
                          <th scope="col" className="px-3 py-2 font-medium w-36">Peso (kg)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categorias.map((c) => (
                          <tr key={c.id} className="border-t border-gray-100 dark:border-gray-800">
                            <td className="px-3 py-1.5">{c.nombre}</td>
                            <td className="px-3 py-1.5">
                              <Input
                                aria-label={`Peso por defecto de ${c.nombre} (kg)`}
                                inputMode="decimal"
                                className="h-8"
                                value={pesosCat[c.id] ?? ''}
                                onChange={(e) => setPesosCat((prev) => ({ ...prev, [c.id]: e.target.value }))}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <Button onClick={guardar} disabled={guardando} size="sm" className="gap-2">
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              Guardar ajustes
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default AjustesEnvioCard;
