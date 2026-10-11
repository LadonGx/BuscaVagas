import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '../../components/ui/EmptyState';

export function NotFoundPage() {
  return (
    <EmptyState icon={<Compass size={22} aria-hidden="true" />} title="Página não encontrada">
      Esse endereço não existe no BuscaVagas. <Link to="/">Voltar ao Início</Link>
    </EmptyState>
  );
}
