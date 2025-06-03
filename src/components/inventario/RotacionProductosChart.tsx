import { FC } from 'react';

interface RotacionProductosChartProps {
  data?: Array<{
    mes: string;
    rotacion: number;
    id?: string; // Añadir ID para usar como key
  }>;
  loading?: boolean;
}

const RotacionProductosChart: FC<RotacionProductosChartProps> = ({ 
  data = [
    { mes: 'Ene', rotacion: 65, id: 'ene' },
    { mes: 'Feb', rotacion: 59, id: 'feb' },
    { mes: 'Mar', rotacion: 80, id: 'mar' },
    { mes: 'Abr', rotacion: 81, id: 'abr' },
    { mes: 'May', rotacion: 76, id: 'may' },
    { mes: 'Jun', rotacion: 85, id: 'jun' },
  ], 
  loading = false 
}) => {
  // En un escenario real, usaríamos una librería como Chart.js o ReCharts
  // Para esta implementación simple, vamos a crear una gráfica básica
  
  const maxRotacion = Math.max(...data.map(item => item.rotacion));
  
  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <h3 className="text-lg font-semibold mb-4 text-gray-900">Rotación de Productos</h3>
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <p>Cargando...</p>
        </div>
      ) : (
        <div className="h-64">
          <div className="flex h-full items-end space-x-2">
            {data.map((item) => (
              <div key={item.id ?? item.mes} className="flex flex-col items-center flex-1">
                <div 
                  className="w-full bg-blue-500 rounded-t" 
                  style={{ 
                    height: `${(item.rotacion / maxRotacion) * 80}%`,
                    minHeight: '1rem'
                  }}
                ></div>
                <span className="text-xs mt-1 text-gray-900">{item.mes}</span>
                <span className="text-xs font-medium text-gray-900">{item.rotacion}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RotacionProductosChart;
