'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Users,
  UserCog,
  MapPin,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

// ─── Tipos (espejo del servicio) ─────────────────────────────────────────────

interface SalesRole {
  id: string;
  code: string;
  name: string;
  area: string;
  responsibilities: unknown[];
  is_active: boolean;
  sort_order: number;
  job_position_id: string | null;
  job_positions?: { id: string; name: string } | null;
}

interface SalesTeamMember {
  id: string;
  sales_team_id: string;
  user_id: string;
  sales_role_id: string | null;
  quota_amount: number | null;
  quota_currency: string;
  is_active: boolean;
  territory_id: string | null;
  sales_roles?: { id: string; name: string; code: string } | null;
  profiles?: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
  territories?: { id: string; name: string } | null;
}

interface SalesTeam {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  territory_id: string | null;
  territories?: { id: string; name: string } | null;
  members?: SalesTeamMember[];
}

interface Territory {
  id: string;
  name: string;
  criteria: Record<string, unknown>;
  is_active: boolean;
}

type SubSection = 'roles' | 'teams' | 'territories';

/**
 * Helper para obtener el orgId actual. Lanza si no hay contexto.
 */
function requireOrgId(): number {
  const orgId = getOrganizationId();
  if (!orgId) throw new Error('No se pudo determinar la organización');
  return orgId;
}

/**
 * Capa de datos directa con Supabase cliente (con RLS).
 * Evita el round-trip server-side de getServerOrgContext que hacía
 * 2 llamadas extra (auth.getUser + organization_members) por cada request.
 */
const db = {
  // ── Roles ──
  async getRoles(): Promise<SalesRole[]> {
    const orgId = requireOrgId();
    const { data, error } = await supabase
      .from('sales_roles')
      .select('*, job_positions(id, name)')
      .eq('organization_id', orgId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    return (data || []) as SalesRole[];
  },
  async createRole(body: Partial<SalesRole> & { code: string; name: string; area: string }): Promise<SalesRole> {
    const orgId = requireOrgId();
    const { data, error } = await supabase
      .from('sales_roles')
      .insert({
        organization_id: orgId,
        code: body.code,
        name: body.name,
        area: body.area,
        responsibilities: body.responsibilities ?? [],
        is_active: body.is_active ?? true,
        sort_order: body.sort_order ?? 0,
        job_position_id: body.job_position_id ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as SalesRole;
  },
  async updateRole(id: string, body: Partial<SalesRole>): Promise<SalesRole> {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.code !== undefined) updateData.code = body.code;
    if (body.name !== undefined) updateData.name = body.name;
    if (body.area !== undefined) updateData.area = body.area;
    if (body.responsibilities !== undefined) updateData.responsibilities = body.responsibilities;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.sort_order !== undefined) updateData.sort_order = body.sort_order;
    if (body.job_position_id !== undefined) updateData.job_position_id = body.job_position_id;
    const { data, error } = await supabase.from('sales_roles').update(updateData).eq('id', id).select().single();
    if (error) throw error;
    return data as SalesRole;
  },
  async deleteRole(id: string): Promise<void> {
    const { error } = await supabase.from('sales_roles').delete().eq('id', id);
    if (error) throw error;
  },
  // ── Job Positions (HRM) ──
  async getJobPositions(): Promise<{ id: string; name: string }[]> {
    const orgId = requireOrgId();
    const { data, error } = await supabase
      .from('job_positions')
      .select('id, name')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) throw error;
    return (data || []) as { id: string; name: string }[];
  },
  // ── Teams ──
  async getTeams(): Promise<SalesTeam[]> {
    const orgId = requireOrgId();
    const { data: teams, error } = await supabase
      .from('sales_teams')
      .select('*, territories(id, name)')
      .eq('organization_id', orgId)
      .order('name', { ascending: true });
    if (error) throw error;
    const teamList = (teams || []) as SalesTeam[];
    if (teamList.length === 0) return teamList;
    const teamIds = teamList.map((t) => t.id);
    const { data: members, error: memberError } = await supabase
      .from('sales_team_members')
      .select(`
        *,
        sales_roles:sales_role_id(id, name, code),
        profiles:user_id(id, first_name, last_name, email),
        territories:territory_id(id, name)
      `)
      .in('sales_team_id', teamIds)
      .eq('is_active', true);
    if (memberError) throw memberError;
    const membersMap = new Map<string, SalesTeamMember[]>();
    for (const m of members || []) {
      const member = m as SalesTeamMember;
      const list = membersMap.get(member.sales_team_id) || [];
      list.push(member);
      membersMap.set(member.sales_team_id, list);
    }
    return teamList.map((t) => ({ ...t, members: membersMap.get(t.id) || [] }));
  },
  async createTeam(body: { name: string; description?: string | null; is_active?: boolean; territory_id?: string | null }): Promise<SalesTeam> {
    const orgId = requireOrgId();
    const { data, error } = await supabase
      .from('sales_teams')
      .insert({
        organization_id: orgId,
        name: body.name,
        description: body.description ?? null,
        is_active: body.is_active ?? true,
        territory_id: body.territory_id ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as SalesTeam;
  },
  async updateTeam(id: string, body: Partial<SalesTeam>): Promise<SalesTeam> {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.territory_id !== undefined) updateData.territory_id = body.territory_id;
    const { data, error } = await supabase.from('sales_teams').update(updateData).eq('id', id).select().single();
    if (error) throw error;
    return data as SalesTeam;
  },
  async deleteTeam(id: string): Promise<void> {
    const { error } = await supabase.from('sales_teams').delete().eq('id', id);
    if (error) throw error;
  },
  // ── Team Members ──
  async addTeamMember(teamId: string, body: {
    user_id: string;
    sales_role_id?: string | null;
    quota_amount?: number | null;
    quota_currency?: string;
    is_active?: boolean;
    territory_id?: string | null;
  }): Promise<SalesTeamMember> {
    const orgId = requireOrgId();
    const { data, error } = await supabase
      .from('sales_team_members')
      .insert({
        organization_id: orgId,
        sales_team_id: teamId,
        user_id: body.user_id,
        sales_role_id: body.sales_role_id ?? null,
        quota_amount: body.quota_amount ?? null,
        quota_currency: body.quota_currency ?? 'COP',
        is_active: body.is_active ?? true,
        territory_id: body.territory_id ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as SalesTeamMember;
  },
  async removeTeamMember(teamId: string, memberId: string): Promise<void> {
    const { error } = await supabase.from('sales_team_members').delete().eq('id', memberId).eq('sales_team_id', teamId);
    if (error) throw error;
  },
  // ── Territories ──
  async getTerritories(): Promise<Territory[]> {
    const orgId = requireOrgId();
    const { data, error } = await supabase
      .from('territories')
      .select('*')
      .eq('organization_id', orgId)
      .order('name', { ascending: true });
    if (error) throw error;
    return (data || []) as Territory[];
  },
  async createTerritory(body: { name: string; criteria?: Record<string, unknown>; is_active?: boolean }): Promise<Territory> {
    const orgId = requireOrgId();
    const { data, error } = await supabase
      .from('territories')
      .insert({
        organization_id: orgId,
        name: body.name,
        criteria: body.criteria ?? {},
        is_active: body.is_active ?? true,
      })
      .select()
      .single();
    if (error) throw error;
    return data as Territory;
  },
  async updateTerritory(id: string, body: Partial<Territory>): Promise<Territory> {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.criteria !== undefined) updateData.criteria = body.criteria;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    const { data, error } = await supabase.from('territories').update(updateData).eq('id', id).select().single();
    if (error) throw error;
    return data as Territory;
  },
  async deleteTerritory(id: string): Promise<void> {
    const { error } = await supabase.from('territories').delete().eq('id', id);
    if (error) throw error;
  },
  // ── Org Members ──
  async getOrgMembers(): Promise<{ id: string; name: string; email?: string }[]> {
    const orgId = requireOrgId();
    const { data, error } = await supabase
      .from('organization_members')
      .select('user_id, profiles:user_id(id, first_name, last_name, email)')
      .eq('organization_id', orgId)
      .eq('is_active', true);
    if (error) throw error;
    return (data || [] as { user_id: string; profiles: { id: string; first_name: string | null; last_name: string | null; email: string | null }[] }[]).map((m) => {
      const p = m.profiles?.[0] || null;
      const full = p ? [p.first_name, p.last_name].filter(Boolean).join(' ') : '';
      return { id: m.user_id, name: full || p?.email || m.user_id.slice(0, 8), email: p?.email || undefined };
    });
  },
};

// ─── Componente principal ────────────────────────────────────────────────────

export function EstructuraComercialManager() {
  const [subSection, setSubSection] = useState<SubSection>('roles');

  const subTabs: { key: SubSection; label: string; icon: typeof Users }[] = [
    { key: 'roles', label: 'Roles', icon: UserCog },
    { key: 'teams', label: 'Equipos', icon: Users },
    { key: 'territories', label: 'Territorios', icon: MapPin },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const active = subSection === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSubSection(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                active
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {subSection === 'roles' && <RolesSection />}
      {subSection === 'teams' && <TeamsSection />}
      {subSection === 'territories' && <TerritoriesSection />}
    </div>
  );
}

// ─── Sección: Roles ──────────────────────────────────────────────────────────

function RolesSection() {
  const { toast } = useToast();
  const [roles, setRoles] = useState<SalesRole[]>([]);
  const [jobPositions, setJobPositions] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SalesRole | null>(null);
  const [toDelete, setToDelete] = useState<SalesRole | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', area: '', responsibilities: '', is_active: true, sort_order: 0, job_position_id: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesData, positionsData] = await Promise.all([
        db.getRoles(),
        db.getJobPositions(),
      ]);
      setRoles(rolesData);
      setJobPositions(positionsData);
    } catch (error) {
      console.error('Error cargando roles:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar los roles', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = () => {
    setEditing(null);
    setForm({ code: '', name: '', area: '', responsibilities: '', is_active: true, sort_order: 0, job_position_id: '' });
    setDialogOpen(true);
  };

  const handleEdit = (role: SalesRole) => {
    setEditing(role);
    setForm({
      code: role.code,
      name: role.name,
      area: role.area,
      responsibilities: Array.isArray(role.responsibilities) ? role.responsibilities.join('\n') : '',
      is_active: role.is_active,
      sort_order: role.sort_order,
      job_position_id: role.job_position_id || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.area.trim()) {
      toast({ title: 'Validación', description: 'Código, nombre y área son obligatorios', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const responsibilities = form.responsibilities
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        area: form.area.trim(),
        responsibilities,
        is_active: form.is_active,
        sort_order: form.sort_order,
        job_position_id: form.job_position_id || null,
      };
      if (editing) {
        await db.updateRole(editing.id, payload);
        toast({ title: 'Rol actualizado', description: 'Los cambios se guardaron correctamente' });
      } else {
        await db.createRole(payload);
        toast({ title: 'Rol creado', description: 'El rol se creó correctamente' });
      }
      setDialogOpen(false);
      load();
    } catch (error) {
      console.error('Error guardando rol:', error);
      toast({ title: 'Error', description: 'No se pudo guardar el rol', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await db.deleteRole(toDelete.id);
      toast({ title: 'Rol eliminado', description: 'El rol se eliminó correctamente' });
      load();
    } catch (error) {
      console.error('Error eliminando rol:', error);
      toast({ title: 'Error', description: 'No se pudo eliminar el rol', variant: 'destructive' });
    } finally {
      setDeleteDialogOpen(false);
      setToDelete(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserCog className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {roles.length} rol{roles.length !== 1 ? 'es' : ''}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Define roles comerciales con área y responsabilidades
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Nuevo Rol
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg border border-gray-200 dark:border-gray-700 animate-pulse bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : roles.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <UserCog className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No hay roles configurados</h3>
          <p className="text-gray-500 dark:text-gray-400">Crea roles como SDR, Account Executive, Sales Manager, etc.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {roles.map((role) => (
            <Card key={role.id} className="border-gray-200 dark:border-gray-700">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs">{role.code}</Badge>
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{role.name}</p>
                      {!role.is_active && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500">Inactivo</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Área: {role.area}
                      {role.job_positions?.name && (
                        <> · Cargo HRM: <span className="text-blue-600 dark:text-blue-400 font-medium">{role.job_positions.name}</span></>
                      )}
                      {Array.isArray(role.responsibilities) && role.responsibilities.length > 0 && (
                        <> · {role.responsibilities.length} responsabilidades</>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(role)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => { setToDelete(role); setDeleteDialogOpen(true); }}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog crear/editar rol */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Rol' : 'Nuevo Rol'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Modifica los datos del rol comercial' : 'Crea un nuevo rol comercial'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="role-code">Código *</Label>
                <Input id="role-code" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} placeholder="Ej: SDR, AE, SM" maxLength={50} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-name">Nombre *</Label>
                <Input id="role-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ej: Sales Development Rep" maxLength={100} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-area">Área *</Label>
              <Input id="role-area" value={form.area} onChange={(e) => setForm((p) => ({ ...p, area: e.target.value }))} placeholder="Ej: Inside Sales, Field Sales" maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-job-position">Cargo de HRM (opcional)</Label>
              <Select
                value={form.job_position_id || 'none'}
                onValueChange={(v) => setForm((p) => ({ ...p, job_position_id: v === 'none' ? '' : v }))}
              >
                <SelectTrigger id="role-job-position">
                  <SelectValue placeholder="Sin cargo mapeado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin cargo mapeado</SelectItem>
                  {jobPositions.map((jp) => (
                    <SelectItem key={jp.id} value={jp.id}>
                      {jp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Vincula este rol comercial a un cargo del módulo HRM. Por defecto, el rol &quot;Vendedor&quot; ya está mapeado al cargo &quot;Vendedor&quot;.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-resp">Responsabilidades</Label>
              <Textarea id="role-resp" value={form.responsibilities} onChange={(e) => setForm((p) => ({ ...p, responsibilities: e.target.value }))} placeholder="Una responsabilidad por línea" rows={4} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="role-active">Activo</Label>
              <Switch id="role-active" checked={form.is_active} onCheckedChange={(c) => setForm((p) => ({ ...p, is_active: c }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog eliminar */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar rol?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el rol &quot;{toDelete?.name}&quot; permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Sección: Equipos ────────────────────────────────────────────────────────

function TeamsSection() {
  const { toast } = useToast();
  const [teams, setTeams] = useState<SalesTeam[]>([]);
  const [roles, setRoles] = useState<SalesRole[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [orgMembers, setOrgMembers] = useState<{ id: string; name: string; email?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SalesTeam | null>(null);
  const [toDelete, setToDelete] = useState<SalesTeam | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', is_active: true, territory_id: '' });
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [memberForm, setMemberForm] = useState({ user_id: '', sales_role_id: '', quota_amount: '', quota_currency: 'COP', territory_id: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [teamsData, rolesData, territoriesData, membersData] = await Promise.all([
        db.getTeams(),
        db.getRoles(),
        db.getTerritories(),
        db.getOrgMembers(),
      ]);
      setTeams(teamsData);
      setRoles(rolesData);
      setTerritories(territoriesData);
      setOrgMembers(membersData);
    } catch (error) {
      console.error('Error cargando equipos:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar los equipos', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '', is_active: true, territory_id: '' });
    setDialogOpen(true);
  };

  const handleEdit = (team: SalesTeam) => {
    setEditing(team);
    setForm({ name: team.name, description: team.description || '', is_active: team.is_active, territory_id: team.territory_id || '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Validación', description: 'El nombre es obligatorio', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        is_active: form.is_active,
        territory_id: form.territory_id || null,
      };
      if (editing) {
        await db.updateTeam(editing.id, payload);
        toast({ title: 'Equipo actualizado', description: 'Los cambios se guardaron correctamente' });
      } else {
        await db.createTeam(payload);
        toast({ title: 'Equipo creado', description: 'El equipo se creó correctamente' });
      }
      setDialogOpen(false);
      load();
    } catch (error) {
      console.error('Error guardando equipo:', error);
      toast({ title: 'Error', description: 'No se pudo guardar el equipo', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await db.deleteTeam(toDelete.id);
      toast({ title: 'Equipo eliminado', description: 'El equipo se eliminó correctamente' });
      load();
    } catch (error) {
      console.error('Error eliminando equipo:', error);
      toast({ title: 'Error', description: 'No se pudo eliminar el equipo', variant: 'destructive' });
    } finally {
      setDeleteDialogOpen(false);
      setToDelete(null);
    }
  };

  const handleAddMember = async () => {
    if (!expandedTeam || !memberForm.user_id.trim()) {
      toast({ title: 'Validación', description: 'Selecciona un miembro', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await db.addTeamMember(expandedTeam, {
        user_id: memberForm.user_id.trim(),
        sales_role_id: memberForm.sales_role_id || null,
        quota_amount: memberForm.quota_amount ? Number(memberForm.quota_amount) : null,
        quota_currency: memberForm.quota_currency || 'COP',
        territory_id: memberForm.territory_id || null,
      });
      toast({ title: 'Miembro añadido', description: 'El miembro se añadió al equipo' });
      setMemberDialogOpen(false);
      setMemberForm({ user_id: '', sales_role_id: '', quota_amount: '', quota_currency: 'COP', territory_id: '' });
      load();
    } catch (error) {
      console.error('Error añadiendo miembro:', error);
      toast({ title: 'Error', description: 'No se pudo añadir el miembro', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (teamId: string, memberId: string) => {
    try {
      await db.removeTeamMember(teamId, memberId);
      toast({ title: 'Miembro removido', description: 'El miembro fue removido del equipo' });
      load();
    } catch (error) {
      console.error('Error removiendo miembro:', error);
      toast({ title: 'Error', description: 'No se pudo remover el miembro', variant: 'destructive' });
    }
  };

  const memberName = (m: SalesTeamMember) => {
    const p = m.profiles;
    if (!p) return m.user_id.slice(0, 8);
    const full = [p.first_name, p.last_name].filter(Boolean).join(' ');
    return full || p.email || m.user_id.slice(0, 8);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {teams.length} equipo{teams.length !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Gestiona equipos comerciales y sus miembros
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Nuevo Equipo
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg border border-gray-200 dark:border-gray-700 animate-pulse bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <Users className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No hay equipos configurados</h3>
          <p className="text-gray-500 dark:text-gray-400">Crea equipos para agrupar vendedores por línea o región</p>
        </div>
      ) : (
        <div className="space-y-2">
          {teams.map((team) => {
            const isExpanded = expandedTeam === team.id;
            const members = team.members || [];
            return (
              <Card key={team.id} className="border-gray-200 dark:border-gray-700">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setExpandedTeam(isExpanded ? null : team.id)}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{team.name}</p>
                          {!team.is_active && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500">Inactivo</span>
                          )}
                          <Badge variant="secondary" className="text-xs">{members.length} miembro{members.length !== 1 ? 's' : ''}</Badge>
                        </div>
                        {team.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{team.description}</p>
                        )}
                        {team.territories?.name && (
                          <p className="text-xs text-rose-600 dark:text-rose-400 mt-1 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            Territorio: {team.territories.name}
                          </p>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-2 ml-4">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(team)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setToDelete(team); setDeleteDialogOpen(true); }}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
                      {members.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 py-2">Sin miembros. Añade el primero.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Miembro</TableHead>
                              <TableHead className="text-xs">Rol</TableHead>
                              <TableHead className="text-xs">Territorio</TableHead>
                              <TableHead className="text-xs">Cuota</TableHead>
                              <TableHead className="text-xs w-10" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {members.map((m) => (
                              <TableRow key={m.id}>
                                <TableCell className="text-xs font-medium">{memberName(m)}</TableCell>
                                <TableCell className="text-xs">{m.sales_roles?.name || '—'}</TableCell>
                                <TableCell className="text-xs">{m.territories?.name || (team.territories?.name || '—')}</TableCell>
                                <TableCell className="text-xs">
                                  {m.quota_amount != null ? `${m.quota_currency} ${m.quota_amount.toLocaleString()}` : '—'}
                                </TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="icon" onClick={() => handleRemoveMember(team.id, m.id)}>
                                    <Trash2 className="h-3 w-3 text-red-400" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                      <Button variant="outline" size="sm" onClick={() => { setMemberForm({ user_id: '', sales_role_id: '', quota_amount: '', quota_currency: 'COP', territory_id: '' }); setMemberDialogOpen(true); }}>
                        <Plus className="h-3 w-3 mr-1" />
                        Añadir miembro
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog crear/editar equipo */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Equipo' : 'Nuevo Equipo'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Modifica los datos del equipo' : 'Crea un nuevo equipo comercial'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="team-name">Nombre *</Label>
              <Input id="team-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ej: Equipo Norte, Enterprise Sales" maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-desc">Descripción</Label>
              <Textarea id="team-desc" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Descripción opcional" rows={3} maxLength={500} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="team-active">Activo</Label>
              <Switch id="team-active" checked={form.is_active} onCheckedChange={(c) => setForm((p) => ({ ...p, is_active: c }))} />
            </div>
            {territories.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="team-territory">Territorio (opcional)</Label>
                <Select
                  value={form.territory_id || 'none'}
                  onValueChange={(v) => setForm((p) => ({ ...p, territory_id: v === 'none' ? '' : v }))}
                >
                  <SelectTrigger id="team-territory">
                    <SelectValue placeholder="Sin territorio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin territorio</SelectItem>
                    {territories.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Asigna un territorio al equipo. Los miembros heredan este territorio a menos que tengan uno propio.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog añadir miembro */}
      <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir miembro</DialogTitle>
            <DialogDescription>Añade un usuario al equipo con su rol y cuota</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="member-user">Miembro de la organización *</Label>
              <Select value={memberForm.user_id} onValueChange={(v) => setMemberForm((p) => ({ ...p, user_id: v }))}>
                <SelectTrigger id="member-user">
                  <SelectValue placeholder="Selecciona un miembro..." />
                </SelectTrigger>
                <SelectContent>
                  {orgMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}{m.email ? ` (${m.email})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {orgMembers.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  No hay miembros activos en la organización.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-role">Rol comercial</Label>
              <Select value={memberForm.sales_role_id || 'none'} onValueChange={(v) => setMemberForm((p) => ({ ...p, sales_role_id: v === 'none' ? '' : v }))}>
                <SelectTrigger id="member-role">
                  <SelectValue placeholder="Sin rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin rol</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name} ({r.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {territories.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="member-territory">Territorio (opcional)</Label>
                <Select
                  value={memberForm.territory_id || 'none'}
                  onValueChange={(v) => setMemberForm((p) => ({ ...p, territory_id: v === 'none' ? '' : v }))}
                >
                  <SelectTrigger id="member-territory">
                    <SelectValue placeholder="Hereda del equipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Hereda del equipo</SelectItem>
                    {territories.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Si asignas un territorio específico, sobreescribe el del equipo.
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="member-quota">Cuota</Label>
                <Input id="member-quota" type="number" value={memberForm.quota_amount} onChange={(e) => setMemberForm((p) => ({ ...p, quota_amount: e.target.value }))} placeholder="0" min={0} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-currency">Moneda</Label>
                <Select value={memberForm.quota_currency} onValueChange={(v) => setMemberForm((p) => ({ ...p, quota_currency: v }))}>
                  <SelectTrigger id="member-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COP">COP</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddMember} disabled={saving}>{saving ? 'Añadiendo...' : 'Añadir'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog eliminar */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar equipo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el equipo &quot;{toDelete?.name}&quot; y todos sus miembros.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Sección: Territorios ────────────────────────────────────────────────────

function TerritoriesSection() {
  const { toast } = useToast();
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Territory | null>(null);
  const [toDelete, setToDelete] = useState<Territory | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', criteria: '{}', is_active: true });
  const [criteriaError, setCriteriaError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await db.getTerritories();
      setTerritories(data);
    } catch (error) {
      console.error('Error cargando territorios:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar los territorios', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = () => {
    setEditing(null);
    setForm({ name: '', criteria: '{}', is_active: true });
    setCriteriaError(null);
    setDialogOpen(true);
  };

  const handleEdit = (territory: Territory) => {
    setEditing(territory);
    setForm({
      name: territory.name,
      criteria: JSON.stringify(territory.criteria || {}, null, 2),
      is_active: territory.is_active,
    });
    setCriteriaError(null);
    setDialogOpen(true);
  };

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
      setCriteriaError('JSON inválido en criteria');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        criteria: parsedCriteria,
        is_active: form.is_active,
      };
      if (editing) {
        await db.updateTerritory(editing.id, payload);
        toast({ title: 'Territorio actualizado', description: 'Los cambios se guardaron correctamente' });
      } else {
        await db.createTerritory(payload);
        toast({ title: 'Territorio creado', description: 'El territorio se creó correctamente' });
      }
      setDialogOpen(false);
      load();
    } catch (error) {
      console.error('Error guardando territorio:', error);
      toast({ title: 'Error', description: 'No se pudo guardar el territorio', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await db.deleteTerritory(toDelete.id);
      toast({ title: 'Territorio eliminado', description: 'El territorio se eliminó correctamente' });
      load();
    } catch (error) {
      console.error('Error eliminando territorio:', error);
      toast({ title: 'Error', description: 'No se pudo eliminar el territorio', variant: 'destructive' });
    } finally {
      setDeleteDialogOpen(false);
      setToDelete(null);
    }
  };

  const criteriaSummary = (criteria: Record<string, unknown>) => {
    const keys = Object.keys(criteria || {});
    if (keys.length === 0) return 'Sin criterios';
    return `${keys.length} criterio${keys.length !== 1 ? 's' : ''}: ${keys.join(', ')}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {territories.length} territorio{territories.length !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Define territorios con criterios (ciudad, vertical, tamaño)
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Nuevo Territorio
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg border border-gray-200 dark:border-gray-700 animate-pulse bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : territories.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <MapPin className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No hay territorios configurados</h3>
          <p className="text-gray-500 dark:text-gray-400">Crea territorios para asignar regiones o segmentos a tus equipos</p>
        </div>
      ) : (
        <div className="space-y-2">
          {territories.map((territory) => (
            <Card key={territory.id} className="border-gray-200 dark:border-gray-700">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{territory.name}</p>
                      {!territory.is_active && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500">Inactivo</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate font-mono">
                      {criteriaSummary(territory.criteria)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(territory)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => { setToDelete(territory); setDeleteDialogOpen(true); }}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog crear/editar territorio */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Territorio' : 'Nuevo Territorio'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Modifica los datos del territorio' : 'Crea un nuevo territorio con criterios JSON'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="terr-name">Nombre *</Label>
              <Input id="terr-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ej: Bogotá, Andina, Enterprise" maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="terr-criteria">Criterios (JSON)</Label>
              <Textarea
                id="terr-criteria"
                value={form.criteria}
                onChange={(e) => { setForm((p) => ({ ...p, criteria: e.target.value })); setCriteriaError(null); }}
                placeholder='{"city": "Bogota", "company_size": "large"}'
                rows={6}
                className="font-mono text-xs"
              />
              {criteriaError && <p className="text-xs text-red-500">{criteriaError}</p>}
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Define reglas de asignación en formato JSON (ej: ciudades, vertical, tamaño)
              </p>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="terr-active">Activo</Label>
              <Switch id="terr-active" checked={form.is_active} onCheckedChange={(c) => setForm((p) => ({ ...p, is_active: c }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog eliminar */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar territorio?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el territorio &quot;{toDelete?.name}&quot; permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
