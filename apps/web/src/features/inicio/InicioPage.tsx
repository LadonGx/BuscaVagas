import { ScanButton } from '../../components/ScanButton';
import { PageHeader } from '../../components/ui/PageHeader';
import { Placeholder } from '../Placeholder';

const today = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export function InicioPage() {
  return (
    <>
      <PageHeader title="Início" subtitle={today.format(new Date())} actions={<ScanButton />} />
      <Placeholder step="8 (Início)" />
    </>
  );
}
