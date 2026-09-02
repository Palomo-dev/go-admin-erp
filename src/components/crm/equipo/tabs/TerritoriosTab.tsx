'use client';

import { useState, useEffect, useCallback } from 'react';
import { MapPin, RefreshCw, Plus, Pencil, Trash2, Users, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { formatCurrency } from '@/utils/Utils';
import { requireOrgId } from '../useEquipoData';
import type { Territory, SalesTeam } from '../types';
import { TerritoryDialog, DeleteConfirmDialog } from '../dialogs';

type TerritoryWithStats = Territory & { _teamCount?: number; _oppCount?: number; _oppAmount?: number };

export function TerritoriosTab() {
  const { toast } = useToast();
  const [territories, setTerritories] = useState<TerritoryWithStats[]>([]);
  const [teams, setTeams] = useState<SalesTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<Territory | null>(null);
  const [toDelete, setToDelete] = useState<Territory | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', criteria: '{}', is_active: true });
  const [criteriaError, setCriteriaError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const orgId = requireOrgId();
      const [terrRes, teamsRes, oppRes] = await Promise.all([
        supabase.from('territories').select('*').eq('organization_id', orgId).order('name'),
        supabase.from('sales_teams').select('id, name, territory_id').eq('organization_id', orgId).eq('is_active', true),
        supabase.from('opportunities').select('id, amount, currency, status, territory_id').eq('organization_id', orgId),
      ]);
      if (terrRes.error) throw terrRes.error;
      if (teamsRes.error) throw teamsRes.error;
      if (oppRes.error) throw oppRes.error;

      const terrList = (terrRes.data || []) as Territory[];
      const teamList = (teamsRes.data || []) as { id: string; name: string; territory_id: string | null }[];
      const oppList = (oppRes.data || []) as { id: string; amount: number | null; currency: string | null; status: string | null; territory_id: string | null }[];

      const enriched = terrList.map((t) => ({
        ...t,
        _teamCount: teamList.filter((tm) => tm.territory_id === t.id).length,
        _oppCount: oppList.filter((o) => o.territory_id === t.id).length,
        _oppAmount: oppList.filter((o) => o.territory_id === t.id).reduce((s, o) => s + (Number(o.amount) || 0), 0),
      }));
      setTerritories(enriched);
      setTeams(teamsRes.data as SalesTeam[]);
    } catch (err) {
      console.error('Error:', err);
      toast({ title: 'Error', description: 'No se pudieron cargar territorios', variant: 'destructive' });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Validación', description: 'El nombre es obligatorio', variant: 'destructive' });
      return;
    }
    let parsedCriteria: Record<string, unknown> = {};
    try {
      parsedCriteria = JSON.parse(form.criteria || '{}');
      setCriteriaError(null);
    } catch {
      setCriteriaError('JSON inválido');
      return;
    }
    setSaving(true);
    try {
      const orgId = requireOrgId();
      const payload = { name: form.name.trim(), criteria: parsedCriteria, is_active: form.is_active };
      if (editing) {
        const { error } = await supabase.from('territories').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Territorio actualizado' });
      } else {
        const { error } = await supabase.from('territories').insert({ ...payload, organization_id: orgId });
        if (error) throw error;
        toast({ title: 'Territorio creado' });
      }
      setDialogOpen(false);
      load();
    } catch {
      toast({ title: 'Error', description: 'No se pudo guardar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      const { error } = await supabase.from('territories').delete().eq('id', toDelete.id);
      if (error) throw error;
      toast({ title: 'Territorio eliminado' });
      load();
    } catch {
      toast({ title: 'Error', description: 'No se pudo eliminar', variant: 'destructive' });
    } finally {
      setDeleteOpen(false);
      setToDelete(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-lg border animate-pulse bg-gray-100 dark:bg-gray-800" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header con acciones */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {territories.length} territorio{territories.length !== 1 ? 's' : ''}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={() => {
            setEditing(null);
            setForm({ name: '', criteria: '{}', is_active: true });
            setCriteriaError(null);
            setDialogOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo Territorio
          </Button>
        </div>
      </div>

      {/* Grid de territorios */}
      {territories.length === 0 ? (
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-12 pb-12 text-center">
            <MapPin className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500">No hay territorios configurados</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {territories.map((t) => {
            const teamsInTerr = teams.filter((tm) => tm.territory_id === t.id);
            return (
              <Card key={t.id} className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
                        <MapPin className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{t.name}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => {
                        setEditing(t);
                        setForm({ name: t.name, criteria: JSON.stringify(t.criteria || {}, null, 2), is_active: t.is_active });
                        setCriteriaError(null);
                        setDialogOpen(true);
                      }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setToDelete(t); setDeleteOpen(true); }}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-2">
                      <div className="flex items-center justify-center mb-1">
                        <Users className="h-3 w-3 text-blue-500" />
                      </div>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{t._teamCount || 0}</p>
                      <p className="text-[10px] text-gray-500">Equipos</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-2">
                      <div className="flex items-center justify-center mb-1">
                        <Target className="h-3 w-3 text-purple-500" />
                      </div>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{t._oppCount || 0}</p>
                      <p className="text-[10px] text-gray-500">Oport.</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-2">
                      <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                        {t._oppAmount ? formatCurrency(t._oppAmount, 'COP') : '—'}
                      </p>
                      <p className="text-[10px] text-gray-500 mt-1">Valor</p>
                    </div>
                  </div>

                  {teamsInTerr.length > 0 && (
                    <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                      <p className="text-[10px] text-gray-400 mb-1">Equipos:</p>
                      <div className="flex flex-wrap gap-1">
                        {teamsInTerr.map((tm) => (
                          <span key={tm.id} className="text-[10px] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                            {tm.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <TerritoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        form={form}
        onFormChange={setForm}
        onSave={handleSave}
        saving={saving}
        criteriaError={criteriaError}
      />
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="¿Eliminar territorio?"
        description={`Se eliminará "${toDelete?.name}".`}
        onConfirm={handleDelete}
      />
    </div>
  );
}
