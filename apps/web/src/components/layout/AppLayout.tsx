import { Outlet } from 'react-router';
import styles from './AppLayout.module.css';
import { OfflineBanner } from './OfflineBanner';
import { Sidebar } from './Sidebar';

/** Menu à esquerda, conteúdo da tela à direita. */
export function AppLayout() {
  return (
    <div className={styles.app}>
      <Sidebar />
      <main className={styles.main}>
        <OfflineBanner />
        <Outlet />
      </main>
    </div>
  );
}
