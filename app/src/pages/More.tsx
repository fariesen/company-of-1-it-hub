import { Boxes, ChevronRight, LogOut, MonitorDown, Network, Settings as SettingsIcon, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHead } from '../components/ui';
import { useHub } from '../state';

const ITEMS = [
  { to: '/hub/software', label: 'Software', icon: Boxes },
  { to: '/hub/infrastructure', label: 'Infrastructure', icon: Network },
  { to: '/hub/setup', label: 'Setup', icon: Wrench },
  { to: '/hub/setup-pc', label: 'Set up a PC', icon: MonitorDown },
  { to: '/hub/settings', label: 'Settings', icon: SettingsIcon }
];

export function More() {
  const { logout } = useHub();
  return (
    <>
      <PageHead title="More" />
      <div className="card">
        <ul className="list">
          {ITEMS.map((i) => (
            <li key={i.to}>
              <Link className="list-item" to={i.to}>
                <div className="icon-tile">
                  <i.icon size={18} aria-hidden="true" />
                </div>
                <span className="grow t">{i.label}</span>
                <ChevronRight size={17} aria-hidden="true" />
              </Link>
            </li>
          ))}
          <li>
            <button className="list-item btn-ghost" type="button" style={{ width: '100%', border: 0, background: 'none', font: 'inherit', cursor: 'pointer' }} onClick={() => void logout()}>
              <div className="icon-tile">
                <LogOut size={18} aria-hidden="true" />
              </div>
              <span className="grow t" style={{ textAlign: 'left', color: 'var(--bad)' }}>
                Sign out
              </span>
            </button>
          </li>
        </ul>
      </div>
    </>
  );
}
