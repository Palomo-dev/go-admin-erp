import { FC } from 'react';

interface HrmPageProps {}

const HrmPage: FC<HrmPageProps> = () => {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">HRM</h1>
      <p>Contenido del módulo HRM</p>
    </div>
  );
};

export default HrmPage;
