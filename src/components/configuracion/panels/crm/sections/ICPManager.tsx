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
  Target,
  ChevronDown,
  ChevronRight,
  Play,
  XCircle,
  CheckCircle2,
} from 'lucide-react';

// ─── Tipos (espejo del servicio) ─────────────────────────────────────────────

type ICPOperator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'not_in' | 'contains' | 'starts_with';

interface ICPCriterion {
  id: string;
  icp_profile_id: string;
  field_key: string;
  operator: ICPOperator;
  value: unknown;
  weight: number;
  is_required: boolean;
}

interface ICPProfile {
  id: string;
  name: string;
  band: string;
  description: string | null;
  priority: number;
  color: string;
  sla_first_contact_hours: number;
  is_active: boolean;
  criteria?: ICPCriterion[];
}

interface ICPEvaluationDetail {
  field_key: string;
  operator: ICPOperator;
  expected: unknown;
  actual: unknown;
  passed: boolean;
  weight: number;
  is_required: boolean;
}

interface ICPEvaluationResult {
  profile_id: string;
  profile_name: string;
  band: string;
  fit_score: number;
  matched: boolean;
  failed_required: string[];
  details: ICPEvaluationDetail[];
}

const FIELD_KEYS = [
  'customers.company_size',
  'customers.branches_count',
  'customers.current_software',
  'customers.lifecycle_stage',
  'customers.city',
  'customers.vertical_id',
  'opportunities.amount',
  'opportunities.currency',
  'opportunities.deal_type',
];

const OPERATORS: ICPOperator[] = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'contains', 'starts_with',
];

const OPERATOR_LABELS: Record<ICPOperator, string> = {
  eq: '= (igual)',
  neq: '≠ (distinto)',
  gt: '> (mayor)',
  gte: '≥ (mayor o igual)',
  lt: '< (menor)',
  lte: '≤ (menor o igual)',
  in: '∈ (en lista)',
  not_in: '∉ (no en lista)',
  contains: 'contiene',
  starts_with: 'empieza con',
};

const BAND_COLORS: Record<string, string> = {
  A: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  B: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  C: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
};

const api = {
  async get<T>(url: string): Promise<T[]> {
    const res = await fetch(url);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Error');
    return json.data as T[];
  },
  async post<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Error');
    return json.data as T;
  },
  async patch<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Error');
    return json.data as T;
  },
  async del(url: string): Promise<void> {
    const res = await fetch(url, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Error');
  },
};

// ─── Componente principal ────────────────────────────────────────────────────

export function ICPManager() {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<ICPProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ICPProfile | null>(null);
  const [toDelete, setToDelete] = useState<ICPProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    band: 'A',
    description: '',
    priority: 100,
    color: '#6366f1',
    sla_first_contact_hours: 24,
    is_active: true,
  });

  // Criterion dialog
  const [critDialogOpen, setCritDialogOpen] = useState(false);
  const [editingCrit, setEditingCrit] = useState<ICPCriterion | null>(null);
  const [critForm, setCritForm] = useState({
    field_key: 'customers.company_size' as string,
    operator: 'eq' as ICPOperator,
    value: '',
    weight: 1,
    is_required: false,
  });

  // Evaluate dialog
  const [evalDialogOpen, setEvalDialogOpen] = useState(false);
  const [evalCustomerId, setEvalCustomerId] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [evalResults, setEvalResults] = useState<ICPEvaluationResult[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<ICPProfile>('/api/crm/icp');
      setProfiles(data);
    } catch (error) {
      console.error('Error cargando ICP profiles:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar los perfiles ICP', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // ─── Profile handlers ──────────────────────────────────────────────────────

  const handleCreate = () => {
    setEditing(null);
    setForm({ name: '', band: 'A', description: '', priority: 100, color: '#6366f1', sla_first_contact_hours: 24, is_active: true });
    setDialogOpen(true);
  };

  const handleEdit = (profile: ICPProfile) => {
    setEditing(profile);
    setForm({
      name: profile.name,
      band: profile.band,
      description: profile.description || '',
      priority: profile.priority,
      color: profile.color,
      sla_first_contact_hours: profile.sla_first_contact_hours,
      is_active: profile.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.band.trim()) {
      toast({ title: 'Validación', description: 'Nombre y band son obligatorios', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        band: form.band.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        color: form.color,
        sla_first_contact_hours: form.sla_first_contact_hours,
        is_active: form.is_active,
      };
      if (editing) {
        await api.patch(`/api/crm/icp/${editing.id}`, payload);
        toast({ title: 'Perfil actualizado', description: 'Los cambios se guardaron correctamente' });
      } else {
        await api.post('/api/crm/icp', payload);
        toast({ title: 'Perfil creado', description: 'El perfil ICP se creó correctamente' });
      }
      setDialogOpen(false);
      load();
    } catch (error) {
      console.error('Error guardando perfil ICP:', error);
      toast({ title: 'Error', description: 'No se pudo guardar el perfil', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await api.del(`/api/crm/icp/${toDelete.id}`);
      toast({ title: 'Perfil eliminado', description: 'El perfil ICP se eliminó correctamente' });
      load();
    } catch (error) {
      console.error('Error eliminando perfil:', error);
      toast({ title: 'Error', description: 'No se pudo eliminar el perfil', variant: 'destructive' });
    } finally {
      setDeleteDialogOpen(false);
      setToDelete(null);
    }
  };

  // ─── Criterion handlers ────────────────────────────────────────────────────

  const handleAddCriterion = () => {
    setEditingCrit(null);
    setCritForm({ field_key: 'customers.company_size', operator: 'eq', value: '', weight: 1, is_required: false });
    setCritDialogOpen(true);
  };

  const handleEditCriterion = (crit: ICPCriterion) => {
    setEditingCrit(crit);
    setCritForm({
      field_key: crit.field_key,
      operator: crit.operator,
      value: typeof crit.value === 'object' ? JSON.stringify(crit.value) : String(crit.value ?? ''),
      weight: crit.weight,
      is_required: crit.is_required,
    });
    setCritDialogOpen(true);
  };

  const handleSaveCriterion = async () => {
    if (!expandedProfile) return;
    if (!critForm.field_key || !critForm.operator) {
      toast({ title: 'Validación', description: 'Field key y operator son obligatorios', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      // Parse value: intentar JSON para arrays, sino string
      let parsedValue: unknown = critForm.value;
      try {
        parsedValue = JSON.parse(critForm.value);
      } catch {
        // Si es número, convertir
        if (critForm.value !== '' && !isNaN(Number(critForm.value)) && ['gt', 'gte', 'lt', 'lte'].includes(critForm.operator)) {
          parsedValue = Number(critForm.value);
        }
      }

      const payload = {
        field_key: critForm.field_key,
        operator: critForm.operator,
        value: parsedValue,
        weight: critForm.weight,
        is_required: critForm.is_required,
      };

      if (editingCrit) {
        await api.patch(`/api/crm/icp/${expandedProfile}/criteria/${editingCrit.id}`, payload);
        toast({ title: 'Criterio actualizado', description: 'El criterio se guardó correctamente' });
      } else {
        await api.post(`/api/crm/icp/${expandedProfile}/criteria`, payload);
        toast({ title: 'Criterio creado', description: 'El criterio se añadió al perfil' });
      }
      setCritDialogOpen(false);
      load();
    } catch (error) {
      console.error('Error guardando criterio:', error);
      toast({ title: 'Error', description: 'No se pudo guardar el criterio', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCriterion = async (profileId: string, critId: string) => {
    try {
      await api.del(`/api/crm/icp/${profileId}/criteria/${critId}`);
      toast({ title: 'Criterio eliminado', description: 'El criterio se eliminó correctamente' });
      load();
    } catch (error) {
      console.error('Error eliminando criterio:', error);
      toast({ title: 'Error', description: 'No se pudo eliminar el criterio', variant: 'destructive' });
    }
  };

  // ─── Evaluate handler ──────────────────────────────────────────────────────

  const handleEvaluate = async () => {
    if (!evalCustomerId.trim()) {
      toast({ title: 'Validación', description: 'El Customer ID es obligatorio', variant: 'destructive' });
      return;
    }
    setEvaluating(true);
    setEvalResults(null);
    try {
      const res = await fetch(`/api/crm/icp/${profiles[0]?.id || 'none'}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: evalCustomerId.trim(), assign: false }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Error');
      // El endpoint retorna { evaluations: [...] } cuando assign=false
      const data = json.data;
      const evaluations = data.evaluations || data;
      setEvalResults(evaluations as ICPEvaluationResult[]);
      toast({ title: 'Evaluación completada', description: `${(evaluations as ICPEvaluationResult[]).length} perfiles evaluados` });
    } catch (error) {
      console.error('Error evaluando ICP:', error);
      toast({ title: 'Error', description: 'No se pudo evaluar el cliente', variant: 'destructive' });
    } finally {
      setEvaluating(false);
    }
  };

  const formatValue = (v: unknown) => {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {profiles.length} perfil{profiles.length !== 1 ? 'es' : ''} ICP
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Define perfiles de cliente ideal (A/B/C) con criterios y SLA
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setEvalCustomerId(''); setEvalResults(null); setEvalDialogOpen(true); }}>
            <Play className="h-4 w-4 mr-1" />
            Evaluar
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Nuevo Perfil
          </Button>
        </div>
      </div>

      {/* Lista de perfiles */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-lg border border-gray-200 dark:border-gray-700 animate-pulse bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : profiles.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <Target className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No hay perfiles ICP configurados</h3>
          <p className="text-gray-500 dark:text-gray-400">Crea perfiles A/B/C para clasificar y priorizar clientes</p>
        </div>
      ) : (
        <div className="space-y-2">
          {profiles.map((profile) => {
            const isExpanded = expandedProfile === profile.id;
            const criteria = profile.criteria || [];
            return (
              <Card key={profile.id} className="border-gray-200 dark:border-gray-700">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setExpandedProfile(isExpanded ? null : profile.id)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: profile.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{profile.name}</p>
                          <Badge className={`text-xs border-0 ${BAND_COLORS[profile.band] || 'bg-gray-100 text-gray-700'}`}>
                            Band {profile.band}
                          </Badge>
                          {!profile.is_active && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500">Inactivo</span>
                          )}
                          <Badge variant="secondary" className="text-xs">{criteria.length} criterio{criteria.length !== 1 ? 's' : ''}</Badge>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Prioridad {profile.priority} · SLA {profile.sla_first_contact_hours}h
                          {profile.description && <> · {profile.description}</>}
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-2 ml-4">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(profile)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setToDelete(profile); setDeleteDialogOpen(true); }}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
                      {criteria.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 py-2">Sin criterios. Añade el primero.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Campo</TableHead>
                              <TableHead className="text-xs">Operador</TableHead>
                              <TableHead className="text-xs">Valor</TableHead>
                              <TableHead className="text-xs text-center">Peso</TableHead>
                              <TableHead className="text-xs text-center">Req</TableHead>
                              <TableHead className="text-xs w-20" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {criteria.map((c) => (
                              <TableRow key={c.id}>
                                <TableCell className="text-xs font-mono">{c.field_key}</TableCell>
                                <TableCell className="text-xs">{OPERATOR_LABELS[c.operator] || c.operator}</TableCell>
                                <TableCell className="text-xs font-mono max-w-32 truncate">{formatValue(c.value)}</TableCell>
                                <TableCell className="text-xs text-center">{c.weight}</TableCell>
                                <TableCell className="text-xs text-center">
                                  {c.is_required ? (
                                    <CheckCircle2 className="h-3 w-3 text-red-500 mx-auto" />
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    <Button variant="ghost" size="icon" onClick={() => handleEditCriterion(c)}>
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteCriterion(profile.id, c.id)}>
                                      <Trash2 className="h-3 w-3 text-red-400" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                      <Button variant="outline" size="sm" onClick={handleAddCriterion}>
                        <Plus className="h-3 w-3 mr-1" />
                        Añadir criterio
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog crear/editar perfil */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Perfil ICP' : 'Nuevo Perfil ICP'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Modifica los datos del perfil' : 'Crea un perfil de cliente ideal (A/B/C)'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="icp-name">Nombre *</Label>
              <Input id="icp-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ej: Enterprise Ideal, SMB Growth" maxLength={100} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="icp-band">Band *</Label>
                <Select value={form.band} onValueChange={(v) => setForm((p) => ({ ...p, band: v }))}>
                  <SelectTrigger id="icp-band">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">A (Alto fit)</SelectItem>
                    <SelectItem value="B">B (Medio fit)</SelectItem>
                    <SelectItem value="C">C (Bajo fit)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="icp-color">Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
                    className="h-9 w-12 rounded border border-gray-200 dark:border-gray-700 cursor-pointer"
                  />
                  <Input value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))} className="font-mono text-xs" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="icp-priority">Prioridad</Label>
                <Input id="icp-priority" type="number" value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: Number(e.target.value) }))} min={0} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="icp-sla">SLA primera contacto (h)</Label>
                <Input id="icp-sla" type="number" value={form.sla_first_contact_hours} onChange={(e) => setForm((p) => ({ ...p, sla_first_contact_hours: Number(e.target.value) }))} min={0} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="icp-desc">Descripción</Label>
              <Textarea id="icp-desc" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Descripción del perfil ideal" rows={2} maxLength={500} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="icp-active">Activo</Label>
              <Switch id="icp-active" checked={form.is_active} onCheckedChange={(c) => setForm((p) => ({ ...p, is_active: c }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog crear/editar criterio */}
      <Dialog open={critDialogOpen} onOpenChange={setCritDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCrit ? 'Editar Criterio' : 'Nuevo Criterio'}</DialogTitle>
            <DialogDescription>
              Define una regla de evaluación ICP para este perfil
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="crit-field">Campo (field_key) *</Label>
              <Select value={critForm.field_key} onValueChange={(v) => setCritForm((p) => ({ ...p, field_key: v }))}>
                <SelectTrigger id="crit-field">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_KEYS.map((k) => (
                    <SelectItem key={k} value={k} className="font-mono text-xs">{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="crit-op">Operador *</Label>
              <Select value={critForm.operator} onValueChange={(v) => setCritForm((p) => ({ ...p, operator: v as ICPOperator }))}>
                <SelectTrigger id="crit-op">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((op) => (
                    <SelectItem key={op} value={op}>{OPERATOR_LABELS[op]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="crit-value">Valor</Label>
              <Input
                id="crit-value"
                value={critForm.value}
                onChange={(e) => setCritForm((p) => ({ ...p, value: e.target.value }))}
                placeholder='Ej: "large" o 1000000 o ["Bogota","Medellin"]'
                className="font-mono text-xs"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Para operadores in/not_in usa un array JSON: [&quot;a&quot;,&quot;b&quot;]
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="crit-weight">Peso</Label>
                <Input id="crit-weight" type="number" value={critForm.weight} onChange={(e) => setCritForm((p) => ({ ...p, weight: Number(e.target.value) }))} min={0} />
              </div>
              <div className="flex items-center justify-between pt-6">
                <Label htmlFor="crit-required">Obligatorio</Label>
                <Switch id="crit-required" checked={critForm.is_required} onCheckedChange={(c) => setCritForm((p) => ({ ...p, is_required: c }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCritDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveCriterion} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog evaluar */}
      <Dialog open={evalDialogOpen} onOpenChange={setEvalDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Evaluar cliente contra ICP</DialogTitle>
            <DialogDescription>
              Ingresa el ID de un customer para evaluarlo contra todos los perfiles ICP
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <Input
                value={evalCustomerId}
                onChange={(e) => setEvalCustomerId(e.target.value)}
                placeholder="Customer ID (UUID)"
                className="font-mono text-xs"
              />
              <Button onClick={handleEvaluate} disabled={evaluating}>
                {evaluating ? 'Evaluando...' : 'Evaluar'}
              </Button>
            </div>

            {evalResults && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {evalResults.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-4">No hay perfiles ICP para evaluar</p>
                ) : (
                  evalResults.map((ev) => (
                    <Card key={ev.profile_id} className={`border-2 ${ev.matched ? 'border-green-300 dark:border-green-800' : 'border-gray-200 dark:border-gray-700'}`}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {ev.matched ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-gray-400" />
                            )}
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{ev.profile_name}</p>
                            <Badge className={`text-xs border-0 ${BAND_COLORS[ev.band] || 'bg-gray-100 text-gray-700'}`}>
                              Band {ev.band}
                            </Badge>
                          </div>
                          <span className={`text-sm font-bold ${ev.fit_score >= 70 ? 'text-green-600' : ev.fit_score >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                            {ev.fit_score}%
                          </span>
                        </div>
                        {ev.failed_required.length > 0 && (
                          <p className="text-xs text-red-500">
                            Obligatorios fallidos: {ev.failed_required.join(', ')}
                          </p>
                        )}
                        {ev.details.length > 0 && (
                          <div className="space-y-1">
                            {ev.details.map((d, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                {d.passed ? (
                                  <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                                ) : (
                                  <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                                )}
                                <span className="font-mono text-gray-600 dark:text-gray-400">{d.field_key}</span>
                                <span className="text-gray-400">{OPERATOR_LABELS[d.operator] || d.operator}</span>
                                <span className="font-mono">{formatValue(d.expected)}</span>
                                <span className="text-gray-400">→ actual:</span>
                                <span className="font-mono">{formatValue(d.actual)}</span>
                                {d.is_required && <Badge variant="destructive" className="text-xs py-0">req</Badge>}
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEvalDialogOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog eliminar */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar perfil ICP?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el perfil &quot;{toDelete?.name}&quot; y todos sus criterios.
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
