'use client';

import { 
  PieChart, Pie, Cell, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  AreaChart, Area,
  ResponsiveContainer 
} from 'recharts';
import { Card } from '@/components/ui/card';
import type { ConversationStats, ChannelMetrics, PipelineMetrics } from './types';

interface ConversationPieChartProps {
  stats: ConversationStats;
  loading?: boolean;
}

interface ChannelBarChartProps {
  metrics: ChannelMetrics[];
  loading?: boolean;
}

interface PipelineFunnelChartProps {
  metrics: PipelineMetrics[];
  loading?: boolean;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export function ConversationPieChart({ stats, loading }: ConversationPieChartProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Estado de Conversaciones</h3>
        <div className="h-64 animate-pulse bg-gray-200 dark:bg-gray-700 rounded" />
      </Card>
    );
  }

  const data = [
    { name: 'Abiertas', value: stats.open, color: '#3B82F6' },
    { name: 'Pendientes', value: stats.pending, color: '#F59E0B' },
    { name: 'Resueltas', value: stats.resolved, color: '#10B981' },
    { name: 'Cerradas', value: stats.closed, color: '#6B7280' },
  ].filter(d => d.value > 0);

  if (data.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
          Estado de Conversaciones
        </h3>
        <div className="h-64 flex items-center justify-center text-gray-500">
          No hay datos disponibles
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
        Estado de Conversaciones
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
            label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
            labelLine={false}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value: number) => [value, 'Conversaciones']}
            contentStyle={{
              backgroundColor: 'var(--background)',
              borderColor: 'var(--border)',
              borderRadius: '8px'
            }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function ChannelBarChart({ metrics, loading }: ChannelBarChartProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Conversaciones por Canal</h3>
        <div className="h-64 animate-pulse bg-gray-200 dark:bg-gray-700 rounded" />
      </Card>
    );
  }

  const data = metrics.map(m => ({
    name: m.channelName,
    conversaciones: m.totalConversations,
    mensajes: m.totalMessages,
  }));

  if (data.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
          Conversaciones por Canal
        </h3>
        <div className="h-64 flex items-center justify-center text-gray-500">
          No hay datos de canales
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
        Conversaciones por Canal
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
          <XAxis 
            dataKey="name" 
            tick={{ fill: '#9CA3AF', fontSize: 12 }}
            axisLine={{ stroke: '#374151' }}
          />
          <YAxis 
            tick={{ fill: '#9CA3AF', fontSize: 12 }}
            axisLine={{ stroke: '#374151' }}
          />
          <Tooltip 
            contentStyle={{
              backgroundColor: 'var(--background)',
              borderColor: 'var(--border)',
              borderRadius: '8px'
            }}
          />
          <Legend />
          <Bar dataKey="conversaciones" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Conversaciones" />
          <Bar dataKey="mensajes" fill="#10B981" radius={[4, 4, 0, 0]} name="Mensajes" />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function PipelineFunnelChart({ metrics, loading }: PipelineFunnelChartProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Embudo de Ventas</h3>
        <div className="h-64 animate-pulse bg-gray-200 dark:bg-gray-700 rounded" />
      </Card>
    );
  }

  if (metrics.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
          Embudo de Ventas
        </h3>
        <div className="h-64 flex items-center justify-center text-gray-500">
          No hay datos de pipeline
        </div>
      </Card>
    );
  }

  // Tomar el primer pipeline para el gráfico principal
  const mainPipeline = metrics[0];
  const data = mainPipeline.stages.map(s => ({
    name: s.stageName,
    oportunidades: s.count,
    valor: s.value,
    fill: s.color || '#3B82F6'
  }));

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
        Embudo: {mainPipeline.pipelineName}
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart 
          data={data} 
          layout="vertical"
          margin={{ top: 20, right: 30, left: 100, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
          <XAxis 
            type="number"
            tick={{ fill: '#9CA3AF', fontSize: 12 }}
            axisLine={{ stroke: '#374151' }}
          />
          <YAxis 
            type="category"
            dataKey="name"
            tick={{ fill: '#9CA3AF', fontSize: 12 }}
            axisLine={{ stroke: '#374151' }}
            width={90}
          />
          <Tooltip 
            formatter={(value: number, name: string) => [
              name === 'valor' ? `$${value.toLocaleString()}` : value,
              name === 'valor' ? 'Valor' : 'Oportunidades'
            ]}
            contentStyle={{
              backgroundColor: 'var(--background)',
              borderColor: 'var(--border)',
              borderRadius: '8px'
            }}
          />
          <Legend />
          <Bar dataKey="oportunidades" radius={[0, 4, 4, 0]} name="Oportunidades">
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-4 grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold text-blue-600">{mainPipeline.totalOpportunities}</p>
          <p className="text-sm text-gray-500">Total Oportunidades</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-green-600">
            ${mainPipeline.totalValue.toLocaleString()}
          </p>
          <p className="text-sm text-gray-500">Valor Total</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-purple-600">{mainPipeline.conversionRate}%</p>
          <p className="text-sm text-gray-500">Conversión</p>
        </div>
      </div>
    </Card>
  );
}

interface TimelineChartProps {
  data: { date: string; value: number }[];
  title: string;
  loading?: boolean;
}

export function TimelineChart({ data, title, loading }: TimelineChartProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <div className="h-48 animate-pulse bg-gray-200 dark:bg-gray-700 rounded" />
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">{title}</h3>
        <div className="h-48 flex items-center justify-center text-gray-500">
          No hay datos disponibles
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">{title}</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
          <XAxis 
            dataKey="date" 
            tick={{ fill: '#9CA3AF', fontSize: 11 }}
            axisLine={{ stroke: '#374151' }}
          />
          <YAxis 
            tick={{ fill: '#9CA3AF', fontSize: 11 }}
            axisLine={{ stroke: '#374151' }}
          />
          <Tooltip 
            contentStyle={{
              backgroundColor: 'var(--background)',
              borderColor: 'var(--border)',
              borderRadius: '8px'
            }}
          />
          <Area 
            type="monotone" 
            dataKey="value" 
            stroke="#3B82F6" 
            fillOpacity={1}
            fill="url(#colorValue)" 
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}
