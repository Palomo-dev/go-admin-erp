'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  BarChart3,
  Download,
  TrendingUp,
  TrendingDown,
  Users,
  Building2,
  MapPin,
  Calendar,
  Filter,
  RefreshCw,
  FileText,
  PieChart,
  Activity
} from 'lucide-react';

interface BranchStats {
  id: number;
  name: string;
  city: string;
  employees: number;
  capacity: number;
  utilization: number;
  performance_score: number;
  monthly_growth: number;
  status: 'excellent' | 'good' | 'average' | 'poor';
}

interface ReportData {
  total_branches: number;
  total_employees: number;
  avg_utilization: number;
  growth_rate: number;
  top_performing_branch: string;
  branches: BranchStats[];
}

export default function ReportesSucursalesPage() {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('monthly');
  const [selectedMetric, setSelectedMetric] = useState('utilization');

  useEffect(() => {
    loadReportData();
  }, [selectedPeriod]);

  const loadReportData = async () => {
    try {
      setLoading(true);
      // TODO: Implementar llamada a la API para obtener datos de reportes
      
      // Datos de ejemplo
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setReportData({
        total_branches: 5,
        total_employees: 127,
        avg_utilization: 78,
        growth_rate: 12.5,
        top_performing_branch: 'Sucursal Centro',
        branches: [
          {
            id: 1,
            name: 'Sucursal Centro',
            city: 'Ciudad de México',
            employees: 35,
            capacity: 40,
            utilization: 87.5,
            performance_score: 92,
            monthly_growth: 15.2,
            status: 'excellent'
          },
          {
            id: 2,
            name: 'Sucursal Norte',
            city: 'Guadalajara',
            employees: 28,
            capacity: 35,
            utilization: 80,
            performance_score: 85,
            monthly_growth: 8.7,
            status: 'good'
          },
          {
            id: 3,
            name: 'Sucursal Sur',
            city: 'Monterrey',
            employees: 32,
            capacity: 45,
            utilization: 71.1,
            performance_score: 78,
            monthly_growth: 5.3,
            status: 'good'
          },
          {
            id: 4,
            name: 'Sucursal Este',
            city: 'Puebla',
            employees: 22,
            capacity: 30,
            utilization: 73.3,
            performance_score: 72,
            monthly_growth: 2.1,
            status: 'average'
          },
          {
            id: 5,
            name: 'Sucursal Oeste',
            city: 'Tijuana',
            employees: 10,
            capacity: 25,
            utilization: 40,
            performance_score: 58,
            monthly_growth: -3.2,
            status: 'poor'
          }
        ]
      });
    } catch (error) {
      console.error('Error loading report data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'excellent':
        return <Badge className="bg-green-100 text-green-800">Excelente</Badge>;
      case 'good':
        return <Badge className="bg-blue-100 text-blue-800">Bueno</Badge>;
      case 'average':
        return <Badge className="bg-yellow-100 text-yellow-800">Promedio</Badge>;
      case 'poor':
        return <Badge className="bg-red-100 text-red-800">Deficiente</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getGrowthIcon = (growth: number) => {
    return growth >= 0 ? (
      <TrendingUp className="h-4 w-4 text-green-600" />
    ) : (
      <TrendingDown className="h-4 w-4 text-red-600" />
    );
  };

  const exportReport = () => {
    // TODO: Implementar exportación de reportes
    console.log('Exporting report...');
  };

  if (loading) {
    return (
      <div className="container mx-auto py-6">
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 bg-gray-200 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">
          <p>Error al cargar los datos del reporte</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reportes de Sucursales</h1>
          <p className="text-muted-foreground">
            Análisis y métricas de rendimiento de todas las sucursales
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Última semana</SelectItem>
              <SelectItem value="monthly">Último mes</SelectItem>
              <SelectItem value="quarterly">Último trimestre</SelectItem>
              <SelectItem value="yearly">Último año</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={loadReportData}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualizar
          </Button>
          <Button onClick={exportReport}>
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sucursales</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reportData.total_branches}</div>
            <p className="text-xs text-muted-foreground">
              Activas en operación
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Empleados</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reportData.total_employees}</div>
            <p className="text-xs text-muted-foreground">
              Distribuidos en todas las sucursales
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Utilización Promedio</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reportData.avg_utilization}%</div>
            <p className="text-xs text-muted-foreground">
              Capacidad utilizada
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Crecimiento</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+{reportData.growth_rate}%</div>
            <p className="text-xs text-muted-foreground">
              Crecimiento mensual
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Resumen General</TabsTrigger>
          <TabsTrigger value="performance">Rendimiento</TabsTrigger>
          <TabsTrigger value="analytics">Análisis Detallado</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Rendimiento por Sucursal</CardTitle>
              <CardDescription>
                Métricas clave de cada sucursal en el período seleccionado
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sucursal</TableHead>
                      <TableHead>Empleados</TableHead>
                      <TableHead>Utilización</TableHead>
                      <TableHead>Rendimiento</TableHead>
                      <TableHead>Crecimiento</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.branches.map((branch) => (
                      <TableRow key={branch.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{branch.name}</span>
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {branch.city}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{branch.employees}/{branch.capacity}</span>
                            <Progress value={branch.utilization} className="w-16 h-2" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{branch.utilization.toFixed(1)}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{branch.performance_score}/100</span>
                            <Progress value={branch.performance_score} className="w-16 h-2" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getGrowthIcon(branch.monthly_growth)}
                            <span className={branch.monthly_growth >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {branch.monthly_growth >= 0 ? '+' : ''}{branch.monthly_growth.toFixed(1)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(branch.status)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top Performers</CardTitle>
                <CardDescription>Sucursales con mejor rendimiento</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {reportData.branches
                    .sort((a, b) => b.performance_score - a.performance_score)
                    .slice(0, 3)
                    .map((branch, index) => (
                      <div key={branch.id} className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-bold">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{branch.name}</p>
                          <p className="text-sm text-muted-foreground">{branch.city}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">{branch.performance_score}/100</p>
                          <p className="text-sm text-muted-foreground">Score</p>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Utilización de Capacidad</CardTitle>
                <CardDescription>Distribución de empleados por sucursal</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {reportData.branches.map((branch) => (
                    <div key={branch.id} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{branch.name}</span>
                        <span>{branch.employees}/{branch.capacity}</span>
                      </div>
                      <Progress value={branch.utilization} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Tendencias de Crecimiento</CardTitle>
              <CardDescription>Evolución del crecimiento por sucursal</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {reportData.branches.map((branch) => (
                  <div key={branch.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-medium">{branch.name}</p>
                        <p className="text-sm text-muted-foreground">{branch.city}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          {getGrowthIcon(branch.monthly_growth)}
                          <span className={`font-bold ${branch.monthly_growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {branch.monthly_growth >= 0 ? '+' : ''}{branch.monthly_growth.toFixed(1)}%
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">Crecimiento mensual</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Distribución Geográfica</CardTitle>
                <CardDescription>Presencia por ciudad</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Array.from(new Set(reportData.branches.map(b => b.city))).map((city) => {
                    const cityBranches = reportData.branches.filter(b => b.city === city);
                    const totalEmployees = cityBranches.reduce((sum, b) => sum + b.employees, 0);
                    
                    return (
                      <div key={city} className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{city}</p>
                          <p className="text-sm text-muted-foreground">
                            {cityBranches.length} sucursal{cityBranches.length !== 1 ? 'es' : ''}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">{totalEmployees}</p>
                          <p className="text-sm text-muted-foreground">empleados</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Métricas Avanzadas</CardTitle>
                <CardDescription>Indicadores adicionales de rendimiento</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Promedio empleados por sucursal</span>
                    <span className="font-bold">
                      {(reportData.total_employees / reportData.total_branches).toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Sucursales con alta utilización (&gt;80%)</span>
                    <span className="font-bold">
                      {reportData.branches.filter(b => b.utilization > 80).length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Sucursales en crecimiento</span>
                    <span className="font-bold">
                      {reportData.branches.filter(b => b.monthly_growth > 0).length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Score promedio de rendimiento</span>
                    <span className="font-bold">
                      {(reportData.branches.reduce((sum, b) => sum + b.performance_score, 0) / reportData.branches.length).toFixed(1)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recomendaciones</CardTitle>
              <CardDescription>Sugerencias basadas en el análisis de datos</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {reportData.branches.filter(b => b.utilization < 50).length > 0 && (
                  <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <TrendingDown className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-yellow-800">Baja utilización detectada</p>
                      <p className="text-sm text-yellow-700">
                        {reportData.branches.filter(b => b.utilization < 50).length} sucursal(es) tienen utilización menor al 50%. 
                        Considera reasignar empleados o revisar la capacidad.
                      </p>
                    </div>
                  </div>
                )}
                
                {reportData.branches.filter(b => b.monthly_growth < 0).length > 0 && (
                  <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <TrendingDown className="h-5 w-5 text-red-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-800">Crecimiento negativo</p>
                      <p className="text-sm text-red-700">
                        {reportData.branches.filter(b => b.monthly_growth < 0).length} sucursal(es) muestran crecimiento negativo. 
                        Revisa las estrategias operativas y de personal.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-800">Oportunidad de expansión</p>
                    <p className="text-sm text-green-700">
                      La sucursal {reportData.top_performing_branch} muestra excelente rendimiento. 
                      Considera replicar sus mejores prácticas en otras ubicaciones.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
