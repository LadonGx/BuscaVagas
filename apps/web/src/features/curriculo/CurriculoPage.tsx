import { PageHeader } from '../../components/ui/PageHeader';
import { Placeholder } from '../Placeholder';

export function CurriculoPage() {
  return (
    <>
      <PageHeader
        title="Currículo"
        subtitle="Preencha uma vez e copie cada campo no formulário da vaga."
      />
      <Placeholder step="6 (Currículo)" />
    </>
  );
}
