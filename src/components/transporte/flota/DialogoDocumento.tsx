'use client';

/**
 * Subir o renovar un documento de la flota (fase 1 «Documentos completos»): de quién es
 * (vehículo o conductor), tipo, número, entidad, categoría de la licencia, vencimiento, si bloquea
 * el despacho y el archivo (PDF o imagen, 10 MB, bucket privado). Guardar uno nuevo del mismo tipo
 * archiva el anterior (queda el historial en la base).
 */
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Dialogo } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TIPOS_DE_CONDUCTOR, TIPOS_DE_VEHICULO, type TipoDocumento } from '@/lib/transporte/documentosFlota';
import { TIPOS_ARCHIVO, validarArchivo, type DatosDocumento } from '@/lib/services/transporte/documentosService';

export interface Dueno {
  id: string;
  nombre: string;
}

export interface InicialDocumento {
  de: 'vehiculo' | 'conductor';
  duenoId: string;
  tipo: TipoDocumento;
}

interface Props {
  vehiculos: readonly Dueno[];
  conductores: readonly Dueno[];
  inicial?: InicialDocumento | null;
  onCerrar: () => void;
  onGuardar: (datos: DatosDocumento, archivo: File | null) => Promise<boolean>;
}

export function DialogoDocumento({ vehiculos, conductores, inicial, onCerrar, onGuardar }: Props) {
  const t = useTranslations('transporte.flota.dialogo');
  const tCausas = useTranslations('transporte.despachos.causas');
  const [de, setDe] = React.useState<'vehiculo' | 'conductor'>(inicial?.de ?? 'vehiculo');
  const [duenoId, setDuenoId] = React.useState(inicial?.duenoId ?? '');
  const [tipo, setTipo] = React.useState<TipoDocumento>(inicial?.tipo ?? 'soat');
  const [numero, setNumero] = React.useState('');
  const [entidad, setEntidad] = React.useState('');
  const [categoria, setCategoria] = React.useState('');
  const [vence, setVence] = React.useState('');
  const [bloquea, setBloquea] = React.useState(true);
  const [archivo, setArchivo] = React.useState<File | null>(null);
  const [errorArchivo, setErrorArchivo] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);

  const tipos = de === 'vehiculo' ? TIPOS_DE_VEHICULO : TIPOS_DE_CONDUCTOR;
  const duenos = de === 'vehiculo' ? vehiculos : conductores;
  const completo = !!duenoId && !!vence && !errorArchivo;

  const cambiarDe = (v: 'vehiculo' | 'conductor') => {
    setDe(v);
    setDuenoId('');
    setTipo(v === 'vehiculo' ? 'soat' : 'licencia');
  };

  const guardar = async () => {
    setGuardando(true);
    const ok = await onGuardar(
      {
        vehicleId: de === 'vehiculo' ? duenoId : null,
        driverCredentialId: de === 'conductor' ? duenoId : null,
        tipo,
        numero,
        entidad,
        categoria: tipo === 'licencia' ? categoria : null,
        vence,
        bloquea,
      },
      archivo,
    );
    setGuardando(false);
    if (ok) onCerrar();
  };

  const campo = 'flex flex-col gap-1 text-sm font-medium text-fg';
  return (
    <Dialogo
      abierto
      onAbiertoChange={(a) => !a && !guardando && onCerrar()}
      titulo={inicial ? t('tituloRenovar') : t('titulo')}
      descripcion={t('descripcion')}
      ancho={560}
      textoCancelar={t('cancelar')}
      primario={{ etiqueta: t('guardar'), onClick: () => void guardar(), cargando: guardando, deshabilitada: !completo || guardando, motivo: t('faltan') }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={campo}>
          {t('de')}
          <Select value={de} onValueChange={(v) => cambiarDe(v as 'vehiculo' | 'conductor')} disabled={!!inicial}>
            <SelectTrigger className="h-10 border-line-strong bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vehiculo">{t('vehiculo')}</SelectItem>
              <SelectItem value="conductor">{t('conductor')}</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className={campo}>
          {de === 'vehiculo' ? t('vehiculo') : t('conductor')}
          <Select value={duenoId} onValueChange={setDuenoId} disabled={!!inicial}>
            <SelectTrigger className="h-10 border-line-strong bg-surface">
              <SelectValue placeholder={duenos.length ? t('elegir') : t('sinDuenos')} />
            </SelectTrigger>
            <SelectContent>
              {duenos.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className={campo}>
          {t('tipo')}
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoDocumento)} disabled={!!inicial}>
            <SelectTrigger className="h-10 border-line-strong bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tipos.map((x) => (
                <SelectItem key={x} value={x}>
                  {tCausas(x)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className={campo}>
          {t('numero')}
          <Input value={numero} onChange={(e) => setNumero(e.target.value.slice(0, 60))} className="h-10" />
        </label>
        <label className={campo}>
          {t('entidad')}
          <Input value={entidad} onChange={(e) => setEntidad(e.target.value.slice(0, 80))} placeholder={t('entidadPlaceholder')} className="h-10" />
        </label>
        {tipo === 'licencia' && (
          <label className={campo}>
            {t('categoria')}
            <Input value={categoria} onChange={(e) => setCategoria(e.target.value.slice(0, 10).toUpperCase())} placeholder="C2" className="h-10" />
          </label>
        )}
        <label className={campo}>
          {t('vence')}
          <Input type="date" value={vence} onChange={(e) => setVence(e.target.value)} className="h-10" required />
        </label>
        <label className={`${campo} sm:col-span-2`}>
          {t('archivo')}
          <Input
            type="file"
            accept={TIPOS_ARCHIVO.join(',')}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setArchivo(f);
              const err = f ? validarArchivo(f) : null;
              setErrorArchivo(err ? t(`errores.${err.codigo}`) : null);
            }}
            className="h-10"
            aria-describedby="doc-archivo-ayuda"
          />
          <span id="doc-archivo-ayuda" className={`text-xs font-normal ${errorArchivo ? 'text-danger-text' : 'text-fg-muted'}`}>
            {errorArchivo ?? t('archivoAyuda')}
          </span>
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm text-fg sm:col-span-2">
          <span className="flex flex-col">
            <span className="font-medium">{t('bloquea')}</span>
            <span className="text-xs text-fg-muted">{t('bloqueaAyuda')}</span>
          </span>
          {/* SOAT, técnico-mecánica, póliza, tarjeta de operación, licencia y examen siempre bloquean. */}
          <Switch checked={bloquea || !['matricula', 'navegabilidad', 'otro'].includes(tipo)} onCheckedChange={(v) => setBloquea(v === true)} disabled={!['matricula', 'navegabilidad', 'otro'].includes(tipo)} />
        </label>
      </div>
    </Dialogo>
  );
}
