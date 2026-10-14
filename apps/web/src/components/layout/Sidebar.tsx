import { Moon, Search, Sun } from 'lucide-react';
import { NavLink } from 'react-router';
import { activeApplications, useApplicationSummary, useJobCounts } from '../../api/overview';
import { formatNumber } from '../../lib/format';
import { useTheme } from '../../lib/theme';
import { NAV_ITEMS, type NavCount } from './nav';
import { NotificationBell } from './NotificationBell';
import { ScanStatus } from './ScanStatus';
import styles from './Sidebar.module.css';

function useNavCounts(): Partial<Record<NavCount, number>> {
  const { data: counts } = useJobCounts();
  const { data: summary } = useApplicationSummary();
  return {
    // A caixa esconde as encerradas por padrão: o número acompanha.
    inbox: counts && counts.triage.inbox - counts.inboxClosed,
    swipeable: counts?.swipeable,
    activeApplications: summary ? activeApplications(summary) : undefined,
  };
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const toLight = theme === 'escuro';
  const Icon = toLight ? Sun : Moon;

  return (
    <button type="button" className={styles.footerButton} onClick={toggle}>
      <Icon size={18} aria-hidden="true" />
      {toLight ? 'Modo claro' : 'Modo escuro'}
    </button>
  );
}

export function Sidebar() {
  const counts = useNavCounts();

  return (
    <nav className={styles.sidebar} aria-label="Principal">
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden="true">
          <Search size={18} strokeWidth={2.4} />
        </span>
        <span className={styles.brandName}>BuscaVagas</span>
        <NotificationBell />
      </div>

      <ul className={styles.list}>
        {NAV_ITEMS.map(({ to, label, icon: Icon, count }) => {
          const value = count ? counts[count.key] : undefined;
          const showCount = count !== undefined && value !== undefined && value > 0;
          return (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                aria-label={
                  showCount ? `${label}, ${formatNumber(value)} ${count.label}` : undefined
                }
                className={({ isActive }) =>
                  isActive ? `${styles.link} ${styles.active}` : styles.link
                }
              >
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
                {showCount && (
                  <span className={styles.count} aria-hidden="true">
                    {formatNumber(value)}
                  </span>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>

      <div className={styles.footer}>
        <ThemeToggle />
        <ScanStatus />
      </div>
    </nav>
  );
}
