import { Hammer } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

/** Tela ainda não construída — diz em qual passo do plano ela chega. */
export function Placeholder({ step }: { step: string }) {
  return (
    <EmptyState icon={<Hammer size={22} aria-hidden="true" />} title="Esta tela está a caminho">
      Chega no passo {step} do plano (<code>docs/features/10-frontend.md</code>).
    </EmptyState>
  );
}
