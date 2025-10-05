'use client';

// Forzar renderizado dinámico para evitar errores de useSearchParams
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Users,
  Search,
  UserPlus,
  Building2,
  Mail,
  Phone,
  Calendar,
  Clock,
  MapPin,
  Filter,
  Download,
  UserMinus,
  AlertCircle
} from 'lucide-react';

interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  position: string;
  department: string;
  hire_date: string;
  branch_id: number;
  branch_name: string;
  status: 'active' | 'inactive' | 'on_leave';
  avatar_url?: string;
}

interface Branch {
  id: number;
  name: string;
  city: string;
  employee_count: number;
}

export default function EmpleadosPorSucursalPage() {
  const searchParams = useSearchParams();
  const selectedBranchParam = searchParams?.get('sucursal');
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>(selectedBranchParam || 'all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [newBranchId, setNewBranchId] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      // TODO: Implementar llamadas a la API
      
      // Datos de ejemplo para sucursales
      setBranches([
        { id: 1, name: 'Sucursal Centro', city: 'Ciudad de México', employee_count: 25 },
        { id: 2, name: 'Sucursal Norte', city: 'Guadalajara', employee_count: 18 },
        { id: 3, name: 'Sucursal Sur', city: 'Monterrey', employee_count: 22 }
      ]);

      // Datos de ejemplo para empleados
      setEmployees([
        {
          id: 1,
          first_name: 'Juan',
          last_name: 'Pérez',
          email: 'juan.perez@empresa.com',
          phone: '+52 55 1234 5678',
          position: 'Gerente',
          department: 'Administración',
          hire_date: '2023-01-15',
          branch_id: 1,
          branch_name: 'Sucursal Centro',
          status: 'active'
        },
        {
          id: 2,
          first_name: 'María',
          last_name: 'García',
          email: 'maria.garcia@empresa.com',
          phone: '+52 55 9876 5432',
          position: 'Vendedora',
          department: 'Ventas',
          hire_date: '2023-03-20',
          branch_id: 1,
          branch_name: 'Sucursal Centro',
          status: 'active'
        },
        {
          id: 3,
          first_name: 'Carlos',
          last_name: 'López',
          email: 'carlos.lopez@empresa.com',
          position: 'Supervisor',
          department: 'Operaciones',
          hire_date: '2022-11-10',
          branch_id: 2,
          branch_name: 'Sucursal Norte',
          status: 'active'
        },
        {
          id: 4,
          first_name: 'Ana',
          last_name: 'Martínez',
          email: 'ana.martinez@empresa.com',
          position: 'Cajera',
          department: 'Ventas',
          hire_date: '2023-06-01',
          branch_id: 2,
          branch_name: 'Sucursal Norte',
          status: 'on_leave'
        }
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignEmployee = async () => {
    if (!selectedEmployee || !newBranchId) return;

    try {
      // TODO: Implementar llamada a la API para reasignar empleado
      const updatedEmployees = employees.map(emp => 
        emp.id === selectedEmployee.id 
          ? { 
              ...emp, 
              branch_id: parseInt(newBranchId),
              branch_name: branches.find(b => b.id === parseInt(newBranchId))?.name || ''
            }
          : emp
      );
      setEmployees(updatedEmployees);
      setAssignDialogOpen(false);
      setSelectedEmployee(null);
      setNewBranchId('');
    } catch (error) {
      console.error('Error assigning employee:', error);
    }
  };

  const filteredEmployees = employees.filter(employee => {
    const matchesSearch = 
      employee.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.position.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesBranch = selectedBranch === 'all' || employee.branch_id === parseInt(selectedBranch);
    const matchesDepartment = selectedDepartment === 'all' || employee.department === selectedDepartment;
    
    return matchesSearch && matchesBranch && matchesDepartment;
  });

  const departments = Array.from(new Set(employees.map(emp => emp.department)));

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default">Activo</Badge>;
      case 'inactive':
        return <Badge variant="secondary">Inactivo</Badge>;
      case 'on_leave':
        return <Badge variant="outline">En Licencia</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  if (loading) {
    return (
      <div className="container mx-auto py-6">
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-200 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Empleados por Sucursal</h1>
          <p className="text-muted-foreground">
            Gestiona la asignación de empleados a las diferentes sucursales
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </Button>
          <Button>
            <UserPlus className="mr-2 h-4 w-4" />
            Nuevo Empleado
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Empleados</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{employees.length}</div>
            <p className="text-xs text-muted-foreground">
              En todas las sucursales
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Empleados Activos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {employees.filter(e => e.status === 'active').length}
            </div>
            <p className="text-xs text-muted-foreground">
              {Math.round((employees.filter(e => e.status === 'active').length / employees.length) * 100)}% del total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Departamentos</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{departments.length}</div>
            <p className="text-xs text-muted-foreground">
              Diferentes áreas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">En Licencia</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {employees.filter(e => e.status === 'on_leave').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Temporalmente ausentes
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle>Empleados</CardTitle>
          <CardDescription>
            Lista de empleados organizados por sucursal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar empleados..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por sucursal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las sucursales</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id.toString()}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por departamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los departamentos</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept} value={dept}>
                    {dept}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator className="my-4" />

          {/* Employees Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead>Puesto</TableHead>
                  <TableHead>Sucursal</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Fecha Ingreso</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="flex flex-col items-center gap-2">
                        <AlertCircle className="h-8 w-8 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          {searchTerm || selectedBranch !== 'all' || selectedDepartment !== 'all' 
                            ? 'No se encontraron empleados con los filtros aplicados' 
                            : 'No hay empleados registrados'}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEmployees.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={employee.avatar_url} />
                            <AvatarFallback>
                              {getInitials(employee.first_name, employee.last_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {employee.first_name} {employee.last_name}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {employee.department}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{employee.position}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span>{employee.branch_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1 text-sm">
                            <Mail className="h-3 w-3" />
                            {employee.email}
                          </div>
                          {employee.phone && (
                            <div className="flex items-center gap-1 text-sm">
                              <Phone className="h-3 w-3" />
                              {employee.phone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>{new Date(employee.hire_date).toLocaleDateString()}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(employee.status)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedEmployee(employee);
                            setNewBranchId(employee.branch_id.toString());
                            setAssignDialogOpen(true);
                          }}
                        >
                          <UserMinus className="mr-2 h-4 w-4" />
                          Reasignar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Assign Employee Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reasignar Empleado</DialogTitle>
            <DialogDescription>
              Selecciona la nueva sucursal para {selectedEmployee?.first_name} {selectedEmployee?.last_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Sucursal actual:</label>
              <p className="text-sm text-muted-foreground">{selectedEmployee?.branch_name}</p>
            </div>
            
            <div>
              <label className="text-sm font-medium">Nueva sucursal:</label>
              <Select value={newBranchId} onValueChange={setNewBranchId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una sucursal" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id.toString()}>
                      {branch.name} - {branch.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAssignDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAssignEmployee}
              disabled={!newBranchId || newBranchId === selectedEmployee?.branch_id.toString()}
            >
              Reasignar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
