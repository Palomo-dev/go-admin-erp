import { FC } from 'react';

interface CrmPageProps {}

const CrmPage: FC<CrmPageProps> = () => {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">CRM</h1>
      <p>Contenido del módulo CRM</p>
    </div>
  );
};

export default CrmPage;
