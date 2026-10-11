import { PageHeader } from '../../components/ui/PageHeader';
import { Placeholder } from '../Placeholder';

export function DeslizarPage() {
  return (
    <>
      <PageHeader title="Deslizar" subtitle="Caixa de entrada, da maior nota para a menor." />
      <Placeholder step="4 (Deslizar)" />
    </>
  );
}
