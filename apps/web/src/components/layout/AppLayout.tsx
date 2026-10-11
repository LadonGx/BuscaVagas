import { Outlet } from 'react-router';
import styles from './AppLayout.module.css';
import { OfflineBanner } from './OfflineBanner';
import { Sidebar } from './Sidebar';

/** Menu à esquerda, conteúdo da tela à direita. */
export function AppLayout() {
  return (
    <div className={styles.app}>
      {/* A faixa do menu ocupa a altura toda da página; o menu fica fixo dentro dela. */}
      <div className={styles.rail}>
        <Sidebar />
      </div>
      <main className={styles.main}>
        <OfflineBanner />
        <Outlet />
      </main>
    </div>
  );
}
