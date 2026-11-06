import { AlertTriangle, Info, RefreshCw, ShieldAlert, WifiOff, type LucideIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { errorTitles, type AppError } from '../lib/errors';
import { UNKNOWN, type Lifecycle } from '../lib/inventory';

export function Logo({ className = 'logo' }: { className?: string }) {
  // Unique gradient id: a duplicate id inside a hidden (display:none) copy breaks the fill.
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14b8a6" />
          <stop offset="1" stopColor="#0f766e" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id})`} />
      <rect x="14" y="17" width="36" height="24" rx="4" fill="none" stroke="#fff" strokeWidth="4" />
      <path d="M25 48h14M32 41v7" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <circle cx="32" cy="29" r="4" fill="#fff" />
    </svg>
  );
}

/** GitHub mark, used only on the "Continue with GitHub" button and GitHub-related headings. */
export function GitHubMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

const lifecycleTone: Record<Lifecycle, string> = {
  active: 'ok',
  planned: 'info',
  ordered: 'info',
  maintenance: 'warn',
  retired: '',
  disposed: '',
  unknown: ''
};

export function LifecycleBadge({ lifecycle }: { lifecycle: Lifecycle }) {
  return <span className={`badge ${lifecycleTone[lifecycle]}`}>{lifecycle === 'unknown' ? 'Status unknown' : lifecycle[0]!.toUpperCase() + lifecycle.slice(1)}</span>;
}

export function Badge({ tone = '', children, plain }: { tone?: string; children: ReactNode; plain?: boolean }) {
  return <span className={`badge ${tone} ${plain ? 'plain' : ''}`}>{children}</span>;
}

/** Renders a value, styling the explicit "unknown" marker so it is never mistaken for data. */
export function Value({ v }: { v: string | number | undefined | null }) {
  if (v === undefined || v === null || v === '' || v === UNKNOWN) return <span className="unknown">unknown</span>;
  return <>{v}</>;
}

export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="icon-tile">
        <Icon size={24} aria-hidden="true" />
      </div>
      <h3>{title}</h3>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

export function Callout({ tone = 'info', children, icon }: { tone?: 'info' | 'warn' | 'bad'; children: ReactNode; icon?: LucideIcon }) {
  const Icon = icon ?? (tone === 'info' ? Info : AlertTriangle);
  return (
    <div className={`callout ${tone}`} role={tone === 'bad' ? 'alert' : undefined}>
      <Icon size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function ErrorPanel({ error, onRetry, children }: { error: AppError; onRetry?: () => void; children?: ReactNode }) {
  const icon = error.kind === 'network' ? WifiOff : error.kind === 'no-access' ? ShieldAlert : AlertTriangle;
  return (
    <Callout tone={error.kind === 'network' || error.kind === 'rate-limited' ? 'warn' : 'bad'} icon={icon}>
      <strong>{errorTitles[error.kind]}</strong>
      <p>{error.message}</p>
      {children}
      {onRetry && (
        <button className="btn btn-sm" onClick={onRetry} type="button">
          <RefreshCw size={15} aria-hidden="true" /> Try again
        </button>
      )}
    </Callout>
  );
}

export function Loading({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div>
        <div className="spinner" style={{ margin: '0 auto 12px' }} />
        {label}
      </div>
    </div>
  );
}

export function formatDate(iso: string | undefined | null): string {
  if (!iso || iso === UNKNOWN) return 'unknown';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function timeAgo(iso: string | number | undefined | null, now = Date.now()): string {
  if (iso === undefined || iso === null || iso === UNKNOWN) return 'unknown';
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  if (Number.isNaN(t)) return String(iso);
  const s = Math.round((now - t) / 1000);
  if (s < 45) return 'just now';
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'minute'],
    [3600, 'hour'],
    [86400, 'day'],
    [2592000, 'month'],
    [31536000, 'year']
  ];
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  let unit: Intl.RelativeTimeFormatUnit = 'minute';
  let div = 60;
  for (const [sec, u] of units) if (s >= sec) [div, unit] = [sec, u];
  return rtf.format(-Math.round(s / div), unit);
}

export function PageHead({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}
