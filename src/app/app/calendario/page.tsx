import { FC } from 'react';

interface CalendarioPageProps {}

const CalendarioPage: FC<CalendarioPageProps> = () => {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Calendario</h1>
      <p>Contenido del módulo Calendario</p>
    </div>
  );
};

export default CalendarioPage;
