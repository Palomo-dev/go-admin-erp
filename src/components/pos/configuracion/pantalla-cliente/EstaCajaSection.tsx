'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link2, Loader2, Pencil, Plus, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import {
  PosTerminalsService,
  isDuplicateCodeError,
  isForbiddenError,
  isOrgMismatchError,
  suggestTerminalCode,
  validateTerminalInput,
  type PosTerminal,
  type TerminalInputError,
} from '@/lib/services/posTerminalsService';

/** Clave de mensaje por error de validación (claves planas: el guard de i18n solo admite dos niveles). */
const INVALID_KEY: Record<TerminalInputError, string> = {
  name_required: 'invalidNameRequired',
  name_too_long: 'invalidNameTooLong',
  code_invalid: 'invalidCodeInvalid',
};

/** Orden de la lista: activas primero, luego por nombre (el mismo que listTerminals). */
function sortTerminals(list: PosTerminal[]): PosTerminal[] {
  return [...list].sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name));
}

/**
 * Sección «Esta caja» de la tarjeta «Pantalla del cliente» (PLAN §3.3, §6.2,
 * §7, §12 Fase 2): lista las terminales de la sucursal seleccionada, permite
 * crear una (nombre + código corto), RENOMBRARLA, activarla/desactivarla y
 * VINCULAR este equipo a una de ellas.
 *
 * Vincular = escribir el `id` de la fila en `pos_terminal_id` (la misma
 * clave de localStorage que la Fase 0 ya usa para identificar la caja).
 * Es por navegador / máquina, no por organización: una máquina = una caja.
 * Sin terminales creadas la caja sigue funcionando con su UUID local
 * («sin registrar»): la pantalla no depende de la tabla.
 *
 * Renombrar y activar/desactivar van por `PATCH /api/pos/terminals/[id]`
 * (rol admin/manager comprobado en el servidor): un cajero sin ese rol ve el
 * aviso «solo un administrador…» y nada cambia. Listar y crear siguen con la
 * sesión y la RLS por pertenencia (§7).
 *
 * La caja de esta ventana usa el id nuevo al entrar en /app/pos; una caja ya
 * abierta en OTRA ventana lo usa al recargar (se avisa). Desactivar no
 * borra: el id puede seguir en el localStorage de una caja, y el vínculo a
 * una terminal desactivada se pinta como tal (punto ámbar).
 *
 * Vinculada en OTRA sucursal (ronda 3 de F2-A): la lista es de la sucursal
 * seleccionada, así que si el id local apunta a una terminal de otra
 * sucursal de la organización no aparece en ella. En ese caso se consulta
 * por id (`getLinkedTerminal`, cualquier sucursal) y se pinta «vinculada a
 * X · CÓDIGO (otra sucursal)»; «sin registrar» queda solo para un id que
 * tampoco existe en la organización.
 *
 * Un 403 `ORG_AMBIGUOUS` / `FOREIGN_ORGANIZATION` de la ruta (la
 * organización activa cambió en otra pestaña) no es «sin permiso»: se pide
 * recargar (`orgChanged`), no se culpa al rol.
 */
export function EstaCajaSection() {
  const t = useTranslations('posCustomerDisplay.terminals');
  const { toast } = useToast();
  const { selectedBranchId, isLoading: branchLoading } = useBranch();

  const [terminals, setTerminals] = useState<PosTerminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [localId, setLocalId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [linking, setLinking] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  /** Terminal vinculada que NO está en la lista de esta sucursal (existe en otra); null si no existe o aún no se consultó. */
  const [otherBranchTerminal, setOtherBranchTerminal] = useState<PosTerminal | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [creating, setCreating] = useState(false);

  const [showRename, setShowRename] = useState(false);
  const [renameName, setRenameName] = useState('');
  const [renameCode, setRenameCode] = useState('');
  const [renaming, setRenaming] = useState(false);

  const reload = useCallback(async () => {
    if (!selectedBranchId) {
      setTerminals([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await PosTerminalsService.listTerminals(selectedBranchId);
      setTerminals(list);
      setLoadFailed(false);
    } catch (err) {
      // Incluye «organización inválida» (sin sesión activa): se avisa en vez de pintar «sin terminales».
      console.error('Error listando terminales del POS:', err);
      setTerminals([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId]);

  useEffect(() => {
    if (branchLoading) return;
    // Al cambiar de sucursal la selección anterior es de OTRA lista: se descarta y se vuelve a
    // preseleccionar (vinculada o primera activa) con la lista nueva.
    setSelectedId('');
    setShowRename(false);
    setLocalId(PosTerminalsService.getLocalTerminalId());
    void reload();
  }, [branchLoading, reload]);

  const linked = PosTerminalsService.resolveLinkedTerminal(terminals, localId);

  // Id local que no está en la lista de la sucursal: ¿existe en otra sucursal de la organización?
  useEffect(() => {
    if (loading || !linked.unlinked || !localId) {
      setOtherBranchTerminal(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      let found: PosTerminal | null = null;
      try {
        found = await PosTerminalsService.getLinkedTerminal();
      } catch (err) {
        console.warn('No se pudo consultar la terminal vinculada en otra sucursal:', err);
      }
      if (!cancelled) setOtherBranchTerminal(found && found.id === localId ? found : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, linked.unlinked, localId]);
  // Preselección: la vinculada si está en la lista; si no, la primera activa.
  const effectiveSelectedId = selectedId || linked.terminal?.id || terminals.find((x) => x.is_active)?.id || '';
  const selected = terminals.find((x) => x.id === effectiveSelectedId) ?? null;

  const handleLink = useCallback(
    (terminal: PosTerminal) => {
      setLinking(true);
      const ok = PosTerminalsService.linkThisTerminal(terminal);
      setLinking(false);
      if (!ok) {
        toast({ title: t('linkError'), variant: 'destructive' });
        return;
      }
      setLocalId(terminal.id);
      toast({ title: t('linked', { name: terminal.name }), description: t('linkedHint') });
    },
    [t, toast],
  );

  const handleCreate = useCallback(async () => {
    const input = { name: newName, code: newCode };
    const invalid = validateTerminalInput(input);
    if (invalid) {
      toast({ title: t(INVALID_KEY[invalid]), variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const created = await PosTerminalsService.createTerminal(input, selectedBranchId);
      setTerminals((prev) => sortTerminals([...prev, created]));
      setSelectedId(created.id);
      setShowCreate(false);
      setNewName('');
      setNewCode('');
      setCodeTouched(false);
      // Crear desde «Esta caja» casi siempre es para esta caja: se vincula en el acto.
      handleLink(created);
    } catch (err) {
      console.error('Error creando terminal del POS:', err);
      toast({ title: isDuplicateCodeError(err) ? t('duplicateCode') : t('createError'), variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  }, [handleLink, newCode, newName, selectedBranchId, t, toast]);

  const handleToggleActive = useCallback(async () => {
    if (!selected) return;
    setTogglingActive(true);
    try {
      const updated = await PosTerminalsService.setTerminalActive(selected.id, !selected.is_active);
      setTerminals((prev) => sortTerminals(prev.map((x) => (x.id === updated.id ? updated : x))));
      toast({ title: updated.is_active ? t('activated', { name: updated.name }) : t('deactivated', { name: updated.name }) });
    } catch (err) {
      console.error('Error cambiando el estado de la terminal:', err);
      toast({ title: isForbiddenError(err) ? t('forbidden') : isOrgMismatchError(err) ? t('orgChanged') : t('updateError'), variant: 'destructive' });
    } finally {
      setTogglingActive(false);
    }
  }, [selected, t, toast]);

  const openRename = useCallback(() => {
    if (!selected) return;
    setRenameName(selected.name);
    setRenameCode(selected.code);
    setShowRename(true);
    setShowCreate(false);
  }, [selected]);

  const handleRename = useCallback(async () => {
    if (!selected) return;
    const input = { name: renameName, code: renameCode };
    const invalid = validateTerminalInput(input);
    if (invalid) {
      toast({ title: t(INVALID_KEY[invalid]), variant: 'destructive' });
      return;
    }
    setRenaming(true);
    try {
      const updated = await PosTerminalsService.updateTerminal(selected.id, input);
      setTerminals((prev) => sortTerminals(prev.map((x) => (x.id === updated.id ? updated : x))));
      setShowRename(false);
      toast({ title: t('renamed', { name: updated.name }) });
    } catch (err) {
      console.error('Error renombrando la terminal:', err);
      toast({
        title: isForbiddenError(err)
          ? t('forbidden')
          : isOrgMismatchError(err)
            ? t('orgChanged')
            : isDuplicateCodeError(err)
              ? t('duplicateCode')
              : t('updateError'),
        variant: 'destructive',
      });
    } finally {
      setRenaming(false);
    }
  }, [renameCode, renameName, selected, t, toast]);

  const linkedLabel = !localId
    ? t('noLocalId')
    : linked.terminal
      ? linked.terminal.is_active
        ? t('linkedTo', { name: linked.terminal.name, code: linked.terminal.code })
        : t('linkedToInactive', { name: linked.terminal.name, code: linked.terminal.code })
      : otherBranchTerminal
        ? otherBranchTerminal.is_active
          ? t('linkedToOtherBranch', { name: otherBranchTerminal.name, code: otherBranchTerminal.code })
          : t('linkedToOtherBranchInactive', { name: otherBranchTerminal.name, code: otherBranchTerminal.code })
        : t('unregistered');
  // Verde: vinculada y activa. Ámbar: vinculada pero desactivada, o vinculada en otra sucursal (activa o no:
  // getLinkedTerminal no filtra por is_active y el rótulo lo dice, ronda 4). Gris: sin vínculo.
  const linkedDotClass = linked.terminal ? (linked.terminal.is_active ? 'bg-green-500' : 'bg-amber-500') : otherBranchTerminal ? 'bg-amber-500' : 'bg-gray-400 dark:bg-gray-600';

  const busy = linking || togglingActive || renaming;

  return (
    <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
      <div className="flex items-start gap-3 min-w-0">
        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg shrink-0">
          <Store className="h-5 w-5 text-indigo-600" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-gray-900 dark:text-white break-words">{t('title')}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 break-words">{t('hint')}</p>
        </div>
      </div>

      <p className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 break-words" role="status">
        <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${linkedDotClass}`} />
        {linkedLabel}
      </p>

      {!selectedBranchId ? (
        <p className="text-xs text-amber-700 dark:text-amber-300 break-words">{t('selectBranch')}</p>
      ) : loading ? (
        <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t('loading')}
        </p>
      ) : (
        <>
          {loadFailed && (
            <p className="text-xs text-amber-700 dark:text-amber-300 break-words" role="alert">
              {t('loadError')}
            </p>
          )}
          {terminals.length === 0 ? (
            !loadFailed && <p className="text-sm text-gray-500 dark:text-gray-400 break-words">{t('empty')}</p>
          ) : (
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <Select
                value={effectiveSelectedId}
                onValueChange={(value) => {
                  setSelectedId(value);
                  setShowRename(false); // el formulario abierto llevaba nombre/código de la selección anterior
                }}
                disabled={busy}
              >
                <SelectTrigger className="w-full sm:w-72" aria-label={t('choose')}>
                  <SelectValue placeholder={t('choose')} />
                </SelectTrigger>
                <SelectContent>
                  {terminals.map((terminal) => (
                    <SelectItem key={terminal.id} value={terminal.id}>
                      {terminal.name} · {terminal.code}
                      {!terminal.is_active ? ` (${t('inactive')})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                className="gap-2 shrink-0"
                disabled={!selected || !selected.is_active || busy || linked.terminal?.id === selected.id}
                onClick={() => selected && handleLink(selected)}
              >
                <Link2 className="h-4 w-4" aria-hidden="true" />
                {linked.terminal?.id === selected?.id ? t('alreadyLinked') : t('linkThis')}
              </Button>
              <Button type="button" variant="ghost" className="gap-2 shrink-0" disabled={!selected || busy} onClick={openRename}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                {t('rename')}
              </Button>
              <Button type="button" variant="ghost" className="shrink-0" disabled={!selected || busy} onClick={() => void handleToggleActive()}>
                {togglingActive && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {selected?.is_active === false ? t('activate') : t('deactivate')}
              </Button>
            </div>
          )}

          {showRename && selected && (
            <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-3">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('renameTitle')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="pos-terminal-rename-name">{t('name')}</Label>
                  <Input id="pos-terminal-rename-name" value={renameName} maxLength={80} onChange={(e) => setRenameName(e.target.value)} disabled={renaming} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pos-terminal-rename-code">{t('code')}</Label>
                  <Input
                    id="pos-terminal-rename-code"
                    value={renameCode}
                    maxLength={20}
                    onChange={(e) => setRenameCode(e.target.value.toUpperCase())}
                    disabled={renaming}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('codeHint')}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void handleRename()} disabled={renaming} className="gap-2">
                  {renaming ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Pencil className="h-4 w-4" aria-hidden="true" />}
                  {t('renameSave')}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowRename(false)} disabled={renaming}>
                  {t('cancel')}
                </Button>
              </div>
            </div>
          )}

          {showCreate ? (
            <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="pos-terminal-name">{t('name')}</Label>
                  <Input
                    id="pos-terminal-name"
                    value={newName}
                    maxLength={80}
                    placeholder={t('namePlaceholder')}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      if (!codeTouched) setNewCode(suggestTerminalCode(e.target.value));
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pos-terminal-code">{t('code')}</Label>
                  <Input
                    id="pos-terminal-code"
                    value={newCode}
                    maxLength={20}
                    placeholder={t('codePlaceholder')}
                    onChange={(e) => {
                      setCodeTouched(true);
                      setNewCode(e.target.value.toUpperCase());
                    }}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('codeHint')}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void handleCreate()} disabled={creating} className="gap-2">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                  {t('createAndLink')}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowCreate(false)} disabled={creating}>
                  {t('cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="gap-2"
              disabled={loadFailed}
              onClick={() => {
                setShowCreate(true);
                setShowRename(false);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('newTerminal')}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
