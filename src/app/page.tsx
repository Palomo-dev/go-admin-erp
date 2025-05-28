import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/auth/login');
  
  // Esto no se mostrará debido a la redirección, pero es necesario para satisfacer
  // el requisito de retorno de componentes en React
  return null;
}
