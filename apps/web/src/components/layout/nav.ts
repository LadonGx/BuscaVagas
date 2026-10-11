import {
  FileText,
  House,
  SquareKanban,
  LayoutGrid,
  SlidersHorizontal,
  TabletSmartphone,
  type LucideIcon,
} from 'lucide-react';

export type NavCount = 'inbox' | 'swipeable' | 'activeApplications';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Número ao lado do nome, e o que ele significa (para leitor de tela). */
  count?: { key: NavCount; label: string };
}

/** Ordem do menu. A rota de cada tela fica em `router.tsx`. */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Início', icon: House },
  { to: '/vagas', label: 'Vagas', icon: LayoutGrid, count: { key: 'inbox', label: 'na caixa' } },
  {
    to: '/deslizar',
    label: 'Deslizar',
    icon: TabletSmartphone,
    count: { key: 'swipeable', label: 'para triar' },
  },
  {
    to: '/candidaturas',
    label: 'Candidaturas',
    icon: SquareKanban,
    count: { key: 'activeApplications', label: 'em andamento' },
  },
  { to: '/curriculo', label: 'Currículo', icon: FileText },
  { to: '/preferencias', label: 'Preferências', icon: SlidersHorizontal },
];
