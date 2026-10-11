import { PageHeader } from '../../components/ui/PageHeader';
import { Placeholder } from '../Placeholder';

export function CandidaturasPage() {
  return (
    <>
      <PageHeader title="Candidaturas" subtitle="Quadro por status e linha do tempo." />
      <Placeholder step="5 (Candidaturas)" />
    </>
  );
}
