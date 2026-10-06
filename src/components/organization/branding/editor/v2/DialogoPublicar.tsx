'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Info, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from 'next-intl';

const LIMITE_NOTA = 500;

interface DialogoPublicarProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** «Sitio principal» o el nombre de la sede: el alcance de la publicación es el sitio completo. */
  nombreSitio: string;
  esSede: boolean;
  /** Solo sedes: el principal tiene cambios sin publicar que la sede todavía no hereda. */
  principalConCambiosSinPublicar?: boolean;
  /** El sitio aún no tiene V2 activo en la web: publicar guarda una versión, no cambia lo público. */
  v2Adoptado: boolean;
  publicando: boolean;
  onPublicar: (nota: string | null) => void | Promise<void>;
}

/**
 * Diálogo «Publicar cambios» (Figma 05g / 05-24). El alcance es el sitio completo (FASE-03: una
 * publicación parcial necesitaría otro contrato). «Programar» no se ofrece porque la base no
 * tiene publicación programada: mostrarlo sería una opción falsa.
 */
export function DialogoPublicar({
  abierto,
  onAbiertoChange,
  nombreSitio,
  esSede,
  principalConCambiosSinPublicar,
  v2Adoptado,
  publicando,
  onPublicar,
}: DialogoPublicarProps) {
  const t = useTranslations('branding.editor');
  const [nota, setNota] = useState('');
  useEffect(() => {
    if (abierto) setNota('');
  }, [abierto]);

  return (
    <Dialog open={abierto} onOpenChange={(v) => !publicando && onAbiertoChange(v)}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{esSede ? t('dialogoPublicar.publicar', { nombreSitio }) : t('dialogoPublicar.publicarCambios')}</DialogTitle>
          <DialogDescription>
            {esSede
              ? t('dialogoPublicar.soloPublicaSitioPrincipal', { nombreSitio })
              : t('dialogoPublicar.publicaSitioCompletoPaginas')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nota-version">{t('dialogoPublicar.notaVersionOpcional')}</Label>
            <Textarea
              id="nota-version"
              value={nota}
              maxLength={LIMITE_NOTA}
              onChange={(e) => setNota(e.target.value)}
              placeholder={t('dialogoPublicar.ejCartaTemporada')}
              rows={2}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('dialogoPublicar.apareceHistorialVersiones', { n: nota.length, LIMITE_NOTA })}
            </p>
          </div>

          {esSede && principalConCambiosSinPublicar ? (
            <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
              <p>
                {t('dialogoPublicar.sitioPrincipalTieneCambios', { nombreSitio })}
              </p>
            </div>
          ) : null}

          <div className="flex gap-2 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
            <Info className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">{t('dialogoPublicar.guardaVersion')}</p>
              <p>
                {t('dialogoPublicar.siAlgoNoQueda')}
                {v2Adoptado
                  ? t('dialogoPublicar.tusClientesVenEsta')
                  : t('dialogoPublicar.webSigueMostrandoSitio')}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)} disabled={publicando}>
            {t('dialogoPublicar.cancelar')}
          </Button>
          <Button type="button" onClick={() => onPublicar(nota.trim() || null)} disabled={publicando}>
            {publicando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
            {esSede ? t('dialogoPublicar.publicar', { nombreSitio }) : t('dialogoPublicar.publicarAhora')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
