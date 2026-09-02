'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, RefreshCw, Plus, Pencil, Trash2, ChevronDown, ChevronRight, MapPin, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { formatCurrency } from '@/utils/Utils';
import { loadTeamsWithMembers, requireOrgId } from '../useEquipoData';
import { memberName, memberInitials } from '../types';
import type { SalesTeam, SalesRole, Territory, OrgMember } from '../types';
import { TeamDialog, MemberDialog, DeleteConfirmDialog } from '../dialogs';

export function EquiposTab() {
  const { toast } = useToast();
  const [teams, setTeams] = useState<SalesTeam[]>([]);
  const [roles, setRoles] = useState<SalesRole[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [deleteTeamOpen, setDeleteTeamOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<SalesTeam | null>(null);
  const [teamToDelete, setTeamToDelete] = useState<SalesTeam | null>(null);
  const [saving, setSaving] = useState(false);
  const [teamForm, setTeamForm] = useState({ name: '', description: '', is_active: true, territory_id: '' });
  const [memberForm, setMemberForm] = useState({ user_id: '', sales_role_id: '', quota_amount: '', quota_currency: 'COP', territory_id: '' });

  const load = useCallback(async () => {
    setIsRefreshing(true);
    if (loading) setIsRefreshing(false);
    try {
      const orgId = requireOrgId();
      const data = await loadTeamsWithMembers(orgId);
      setTeams(data.teams);
      setRoles(data.roles);
      setTerritories(data.territories);
      setOrgMembers(data.orgMembers);
    } catch (err) {
      console.error('Error cargando equipos:', err);
      toast({ title: 'Error', description: 'No se pudieron cargar los equipos', variant: 'destructive' });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [toast, loading]);

  useEffect(() => { load(); }, [load]);

  const handleSaveTeam = async () => {
    if (!teamForm.name.trim()) {
      toast({ title: 'Validación', description: 'El nombre es obligatorio', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const orgId = requireOrgId();
      const payload = {
        name: teamForm.name.trim(),
        description: teamForm.description || null,
        is_active: teamForm.is_active,
        territory_id: teamForm.territory_id || null,
      };
      if (editingTeam) {
        const { error } = await supabase.from('sales_teams').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingTeam.id);
        if (error) throw error;
        toast({ title: 'Equipo actualizado' });
      } else {
        const { error } = await supabase.from('sales_teams').insert({ ...payload, organization_id: orgId });
        if (error) throw error;
        toast({ title: 'Equipo creado' });
      }
      setTeamDialogOpen(false);
      load();
    } catch {
      toast({ title: 'Error', description: 'No se pudo guardar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async () => {
    if (!memberForm.user_id) {
      toast({ title: 'Validación', description: 'Selecciona un miembro', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const orgId = requireOrgId();
      const { error } = await supabase.from('sales_team_members').insert({
        sales_team_id: expandedTeam,
        user_id: memberForm.user_id,
        sales_role_id: memberForm.sales_role_id || null,
        territory_id: memberForm.territory_id || null,
        quota_amount: memberForm.quota_amount ? Number(memberForm.quota_amount) : null,
        quota_currency: memberForm.quota_currency,
        is_active: true,
        organization_id: orgId,
      });
      if (error) throw error;
      toast({ title: 'Miembro añadido' });
      setMemberDialogOpen(false);
      load();
    } catch {
      toast({ title: 'Error', description: 'No se pudo añadir', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (teamId: string, memberId: string) => {
    try {
      const { error } = await supabase.from('sales_team_members').update({ is_active: false }).eq('id', memberId);
      if (error) throw error;
      toast({ title: 'Miembro removido' });
      load();
    } catch {
      toast({ title: 'Error', description: 'No se pudo remover', variant: 'destructive' });
    }
  };

  const handleDeleteTeam = async () => {
    if (!teamToDelete) return;
    try {
      const { error } = await supabase.from('sales_teams').update({ is_active: false }).eq('id', teamToDelete.id);
      if (error) throw error;
      toast({ title: 'Equipo eliminado' });
      setDeleteTeamOpen(false);
      setTeamToDelete(null);
      load();
    } catch {
      toast({ title: 'Error', description: 'No se pudo eliminar', variant: 'destructive' });
    }
  };

  // Stats
  const totalMembers = teams.reduce((s, t) => s + (t.members?.length || 0), 0);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl border border-gray-200 dark:border-gray-700 animate-pulse bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header con acciones */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {teams.length} equipo{teams.length !== 1 ? 's' : ''} · {totalMembers} miembros
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={() => {
            setEditingTeam(null);
            setTeamForm({ name: '', description: '', is_active: true, territory_id: '' });
            setTeamDialogOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo Equipo
          </Button>
        </div>
      </div>

      {/* Lista de equipos */}
      {teams.length === 0 ? (
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-12 pb-12 text-center">
            <Users className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">No hay equipos</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Crea tu primer equipo comercial</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {teams.map((team) => {
            const isExpanded = expandedTeam === team.id;
            const members = team.members || [];
            const teamQuota = members.reduce((sum, m) => sum + (Number(m.quota_amount) || 0), 0);
            return (
              <Card key={team.id} className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setExpandedTeam(isExpanded ? null : team.id)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <div className="w-10 h-10 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
                        <Users className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{team.name}</p>
                          <Badge variant="secondary" className="text-xs">{members.length} miembro{members.length !== 1 ? 's' : ''}</Badge>
                          {team.territories?.name && (
                            <Badge variant="outline" className="text-xs text-rose-600 dark:text-rose-400">
                              <MapPin className="h-3 w-3 mr-1" />{team.territories.name}
                            </Badge>
                          )}
                        </div>
                        {team.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{team.description}</p>}
                        {teamQuota > 0 && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            Cuota total: {formatCurrency(teamQuota, members[0]?.quota_currency || 'COP')}
                          </p>
                        )}
                      </div>
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
                    </button>
                    <div className="flex items-center gap-1 ml-4">
                      <Button variant="ghost" size="icon" onClick={() => {
                        setEditingTeam(team);
                        setTeamForm({ name: team.name, description: team.description || '', is_active: team.is_active, territory_id: team.territory_id || '' });
                        setTeamDialogOpen(true);
                      }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setTeamToDelete(team); setDeleteTeamOpen(true); }}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                      {members.length === 0 ? (
                        <p className="text-xs text-gray-500 py-2">Sin miembros. Añade el primero.</p>
                      ) : (
                        <div className="space-y-2">
                          {members.map((m) => (
                            <div key={m.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                                  {memberInitials(m)}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{memberName(m)}</p>
                                  {m.profiles?.email && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                      <Mail className="h-3 w-3" />{m.profiles.email}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    {m.sales_roles?.name && (
                                      <Badge variant="outline" className="text-[10px]">{m.sales_roles.name}</Badge>
                                    )}
                                    {(m.territories?.name || team.territories?.name) && (
                                      <Badge variant="outline" className="text-[10px] text-rose-600 dark:text-rose-400">
                                        <MapPin className="h-2.5 w-2.5 mr-0.5" />{m.territories?.name || team.territories?.name}
                                      </Badge>
                                    )}
                                    {m.quota_amount != null && (
                                      <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                        Cuota: {formatCurrency(Number(m.quota_amount), m.quota_currency)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <Button variant="ghost" size="icon" onClick={() => handleRemoveMember(team.id, m.id)}>
                                <Trash2 className="h-3 w-3 text-red-400" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <Button variant="outline" size="sm" onClick={() => {
                        setMemberForm({ user_id: '', sales_role_id: '', quota_amount: '', quota_currency: 'COP', territory_id: '' });
                        setMemberDialogOpen(true);
                      }}>
                        <Plus className="h-3 w-3 mr-1" /> Añadir miembro
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <TeamDialog
        open={teamDialogOpen}
        onOpenChange={setTeamDialogOpen}
        editing={editingTeam}
        territories={territories}
        form={teamForm}
        onFormChange={setTeamForm}
        onSave={handleSaveTeam}
        saving={saving}
      />
      <MemberDialog
        open={memberDialogOpen}
        onOpenChange={setMemberDialogOpen}
        roles={roles}
        territories={territories}
        orgMembers={orgMembers}
        form={memberForm}
        onFormChange={setMemberForm}
        onAdd={handleAddMember}
        saving={saving}
      />
      <DeleteConfirmDialog
        open={deleteTeamOpen}
        onOpenChange={setDeleteTeamOpen}
        title="¿Eliminar equipo?"
        description={`Se eliminará "${teamToDelete?.name}" y todos sus miembros.`}
        onConfirm={handleDeleteTeam}
      />
    </div>
  );
}
