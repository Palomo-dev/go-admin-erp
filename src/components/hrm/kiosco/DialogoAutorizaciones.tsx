'use client';

/**
 * Mi asistencia › «Tus autorizaciones» (Figma 20.32.1–20.32.4; plan de Marcación
 * §5.1, §5.2, D4 cambiada el 2026-11-17, D5). Autorización expresa, voluntaria y
 * revocable de la persona, por separado: huella y rostro (relojes de la sede) y foto
 * de evidencia (kiosco). Sin autorizar se marca igual con PIN, carné o QR.
 *
 * Cada decisión es una fila nueva (solo inserción) con la versión del texto, la IP
 * y el agente; el vínculo lo pone la base a partir de la sesión.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { FileSignature } from 'lucide-react';
import { Dialogo, Skeleton } from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { ErrorPersonas, pedir, useCarga } from '../personas/apiPersonas';

interface EstadoTipo {
  autorizada: boolean;
  fecha: string;
  version: string;
}

interface RespuestaAutorizaciones {
  vinculo: { id: string; sede: string | null } | null;
  foto_dias?: number;
  tipos?: { foto_evidencia: EstadoTipo | null; huella: EstadoTipo | null; rostro: EstadoTipo | null };
}

const URL = '/api/hrm/marcacion/autorizaciones';

export function DialogoAutorizaciones({ abierto, onAbiertoChange }: { abierto: boolean; onAbiertoChange: (a: boolean) => void }) {
  const t = useTranslations('hrmKiosco.autorizaciones');
  const { formatDate } = useFormatDate();
  const { carga, recargar } = useCarga<RespuestaAutorizaciones>(abierto ? URL : null);
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const biometriaVigente = !!(datos?.tipos?.huella?.autorizada || datos?.tipos?.rostro?.autorizada);
  const fotoVigente = !!datos?.tipos?.foto_evidencia?.autorizada;
  const [biometria, setBiometria] = useState(false);
  const [foto, setFoto] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setBiometria(biometriaVigente);
    setFoto(fotoVigente);
  }, [biometriaVigente, fotoVigente, abierto]);

  const decidir = async (decisiones: { tipos: string[]; autorizo: boolean }[]) => {
    if (decisiones.length === 0) {
      onAbiertoChange(false);
      return;
    }
    setEnviando(true);
    try {
      for (const d of decisiones) await pedir(URL, { metodo: 'POST', cuerpo: d });
      toast.success(t('guardado'));
      await recargar();
      onAbiertoChange(false);
    } catch (e) {
      toast.error(e instanceof ErrorPersonas && e.codigo === 'sin_vinculo_activo' ? t('errores.sinVinculo') : t('errores.guardar'));
    } finally {
      setEnviando(false);
    }
  };

  const guardar = () => {
    const d: { tipos: string[]; autorizo: boolean }[] = [];
    if (biometria !== biometriaVigente) d.push({ tipos: ['huella', 'rostro'], autorizo: biometria });
    if (foto !== fotoVigente) d.push({ tipos: ['foto_evidencia'], autorizo: foto });
    void decidir(d);
  };

  const nada = () => {
    const d: { tipos: string[]; autorizo: boolean }[] = [];
    if (biometriaVigente || !datos?.tipos?.huella) d.push({ tipos: ['huella', 'rostro'], autorizo: false });
    if (fotoVigente || !datos?.tipos?.foto_evidencia) d.push({ tipos: ['foto_evidencia'], autorizo: false });
    void decidir(d);
  };

  const sede = datos?.vinculo?.sede ?? '';
  const dias = datos?.foto_dias ?? 30;
  const fechaDe = (e: EstadoTipo | null | undefined) => (e ? formatDate(e.fecha) : '');

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={sede ? t('subtitulo', { sede }) : undefined}
      icono={FileSignature}
      ancho={560}
      primario={{ etiqueta: t('guardar'), onClick: guardar, cargando: enviando, deshabilitada: !datos?.vinculo }}
      secundarios={[{ etiqueta: t('nada'), onClick: nada, deshabilitada: enviando || !datos?.vinculo }]}
    >
      {carga.estado === 'cargando' && <Skeleton className="h-64 rounded-lg" />}
      {carga.estado === 'listo' && !datos?.vinculo && <p className="text-sm text-fg-secondary">{t('sinVinculo')}</p>}
      {datos?.vinculo && (
        <div className="flex flex-col gap-4 text-sm leading-5">
          <h3 className="text-base font-semibold text-fg">{t('pregunta')}</h3>
          {(['paraQue', 'queSeGuarda', 'voluntario', 'foto', 'retirar'] as const).map((b) => (
            <section key={b}>
              <p className="font-medium text-fg">{t(`bloques.${b}.titulo`)}</p>
              <p className="mt-1 text-fg-secondary">{t(`bloques.${b}.texto`, { sede, dias })}</p>
            </section>
          ))}
          <label className="flex cursor-pointer items-start gap-2 text-fg">
            <Checkbox className="mt-0.5" checked={biometria} onCheckedChange={(v) => setBiometria(v === true)} disabled={enviando} />
            <span>
              {t('casillas.biometria')}
              {biometriaVigente && <span className="block text-xs text-fg-muted">{t('vigenteDesde', { fecha: fechaDe(datos.tipos?.huella ?? datos.tipos?.rostro) })}</span>}
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-fg">
            <Checkbox className="mt-0.5" checked={foto} onCheckedChange={(v) => setFoto(v === true)} disabled={enviando} />
            <span>
              {t('casillas.foto')}
              {fotoVigente && <span className="block text-xs text-fg-muted">{t('vigenteDesde', { fecha: fechaDe(datos.tipos?.foto_evidencia) })}</span>}
            </span>
          </label>
          <p className="text-xs text-fg-muted">{t('version')}</p>
        </div>
      )}
    </Dialogo>
  );
}
