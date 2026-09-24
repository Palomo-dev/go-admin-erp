'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Plus, StickyNote, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { NOTA_MAX } from '@/lib/pos/cocina/lineasCarrito';
import { TIPOS_NOTA_RAPIDA, type TipoNotaRapida } from '@/lib/pos/cocina/rutasCocina';
import {
  borrarNotaRapida,
  CocinaError,
  crearNotaRapida,
  editarNotaRapida,
  listarNotasRapidas,
  type NotasRapidas,
} from '@/components/pos/cocina/cocinaCliente';
import { olvidarNotasRapidas } from '@/components/pos/cocina/ChipsNotasRapidas';

interface NotasRapidasSectionProps {
  branches: { id: number; name: string }[];
}

/**
 * Configuración › POS › Notas rápidas: los chips del editor de nota de la
 * línea, por organización o por sucursal, y las más usadas para agregarlas
 * con un toque. Escribir exige permiso de configuración (lo resuelve la ruta).
 */
export function NotasRapidasSection({ branches }: NotasRapidasSectionProps) {
  const t = useTranslations('posNotasRapidas');
  const { toast } = useToast();
  const [datos, setDatos] = useState<NotasRapidas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState('');
  const [tipo, setTipo] = useState<TipoNotaRapida>('kitchen');
  const [sucursal, setSucursal] = useState<string>('org');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      // Todas (también inactivas) y de toda la organización: la lista se filtra aquí.
      setDatos(await listarNotasRapidas(null, true));
    } catch {
      toast({ title: t('errorCargar'), variant: 'destructive' });
    } finally {
      setCargando(false);
    }
  }, [t, toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const avisarError = (err: unknown) => {
    const codigo = err instanceof CocinaError ? err.codigo : 'error_interno';
    toast({ title: t.has(`errores.${codigo}`) ? t(`errores.${codigo}`) : t('errores.error_interno'), variant: 'destructive' });
  };

  const agregar = async (label: string, kind: TipoNotaRapida) => {
    if (!label.trim()) return;
    setGuardando(true);
    try {
      await crearNotaRapida({ label: label.trim(), kind, branch_id: sucursal === 'org' ? null : Number(sucursal) });
      setTexto('');
      olvidarNotasRapidas();
      await cargar();
    } catch (err) {
      avisarError(err);
    } finally {
      setGuardando(false);
    }
  };

  const alternar = async (id: number, activa: boolean) => {
    try {
      await editarNotaRapida(id, { is_active: activa });
      olvidarNotasRapidas();
      await cargar();
    } catch (err) {
      avisarError(err);
    }
  };

  const borrar = async (id: number) => {
    try {
      await borrarNotaRapida(id);
      olvidarNotasRapidas();
      await cargar();
    } catch (err) {
      avisarError(err);
    }
  };

  const nombreSucursal = (branchId: number | null) =>
    branchId === null ? t('toda') : branches.find((b) => b.id === branchId)?.name || `#${branchId}`;
  const puedeConfigurar = datos?.puedeConfigurar === true;

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <StickyNote className="h-5 w-5 text-blue-600" />
          {t('titulo')}
        </CardTitle>
        <CardDescription className="text-gray-500 dark:text-gray-400">{t('descripcion')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {cargando && !datos ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        ) : (
          <>
            {puedeConfigurar && (
              <form
                className="flex flex-col sm:flex-row gap-2"
                onSubmit={(e) => { e.preventDefault(); agregar(texto, tipo); }}
              >
                <Input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  maxLength={NOTA_MAX}
                  placeholder={t('placeholder')}
                  aria-label={t('texto')}
                  className="flex-1"
                />
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoNotaRapida)}
                  aria-label={t('tipo')}
                  className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 text-sm"
                >
                  {TIPOS_NOTA_RAPIDA.map((k) => <option key={k} value={k}>{t(`tipos.${k}`)}</option>)}
                </select>
                <select
                  value={sucursal}
                  onChange={(e) => setSucursal(e.target.value)}
                  aria-label={t('sucursal')}
                  className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 text-sm"
                >
                  <option value="org">{t('toda')}</option>
                  {branches.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
                </select>
                <Button type="submit" disabled={guardando || !texto.trim()}>
                  {guardando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                  {t('agregar')}
                </Button>
              </form>
            )}

            {(datos?.notas.length ?? 0) === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">{t('vacio')}</p>
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {datos?.notas.map((n) => (
                  <li key={n.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0 flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 dark:text-white break-words">{n.label}</span>
                      <Badge variant="outline" className="text-xs">{t(`tipos.${n.kind}`)}</Badge>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{nombreSucursal(n.branch_id)}</span>
                    </div>
                    {puedeConfigurar && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Switch
                          checked={n.is_active}
                          onCheckedChange={(v) => alternar(n.id, v)}
                          aria-label={t('activa')}
                        />
                        <Button variant="ghost" size="sm" onClick={() => borrar(n.id)} aria-label={t('borrar')} title={t('borrar')}>
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {(datos?.sugeridas.length ?? 0) > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('masUsadas')}</p>
                <div className="flex flex-wrap gap-2">
                  {datos?.sugeridas.map((s) => (
                    <button
                      key={s.texto}
                      type="button"
                      disabled={!puedeConfigurar || guardando}
                      onClick={() => agregar(s.texto, 'kitchen')}
                      title={puedeConfigurar ? t('agregarSugerida') : undefined}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border border-dashed border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-60"
                    >
                      {puedeConfigurar && <Plus className="h-3 w-3" />}
                      {s.texto}
                      <span className="text-gray-400">· {s.usos}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
