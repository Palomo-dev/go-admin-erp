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
  const [nota, setNota] = useState('');
  useEffect(() => {
    if (abierto) setNota('');
  }, [abierto]);

  return (
    <Dialog open={abierto} onOpenChange={(v) => !publicando && onAbiertoChange(v)}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{esSede ? `Publicar ${nombreSitio}` : 'Publicar cambios'}</DialogTitle>
          <DialogDescription>
            {esSede
              ? `Solo se publica ${nombreSitio}. El sitio principal y las demás sedes no cambian.`
              : 'Se publica el sitio completo: páginas, secciones, estilo, encabezado, pie y menús del borrador.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nota-version">Nota de la versión (opcional)</Label>
            <Textarea
              id="nota-version"
              value={nota}
              maxLength={LIMITE_NOTA}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej.: Carta de temporada"
              rows={2}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Aparece en el historial de versiones · {nota.length}/{LIMITE_NOTA}
            </p>
          </div>

          {esSede && principalConCambiosSinPublicar ? (
            <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
              <p>
                El sitio principal tiene cambios sin publicar. No llegan a {nombreSitio} hasta que publiques el principal.
              </p>
            </div>
          ) : null}

          <div className="flex gap-2 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
            <Info className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">Se guarda una versión</p>
              <p>
                Si algo no queda bien, la restauras desde el historial.
                {v2Adoptado
                  ? ' Tus clientes ven esta versión en cuanto termine la publicación.'
                  : ' La web sigue mostrando el sitio actual hasta que actives V2 en este sitio.'}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)} disabled={publicando}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => onPublicar(nota.trim() || null)} disabled={publicando}>
            {publicando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
            {esSede ? `Publicar ${nombreSitio}` : 'Publicar ahora'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
