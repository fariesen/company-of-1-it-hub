import { ArrowRight, BookOpen, CheckCircle2, Cpu, Download, Lock, MonitorDown, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePwa } from '../components/Layout';
import { GitHubMark, Logo } from '../components/ui';
import { APP_VERSION, detectPlatform, isStandalone, promptInstall, type pwaState, type Platform } from '../lib/pwa';
import { useTheme } from '../theme';

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'ios', label: 'iPhone & iPad' },
  { id: 'android', label: 'Android' },
  { id: 'windows', label: 'Windows' },
  { id: 'macos', label: 'macOS' },
  { id: 'linux', label: 'Linux' }
];

const INSTRUCTIONS: Record<Exclude<Platform, 'other'>, { browsers: string; steps: string[]; note?: string }> = {
  ios: {
    browsers: 'Safari (iOS / iPadOS 16.4 or later recommended)',
    steps: [
      'Open this page in Safari.',
      'Tap the Share button (square with an arrow).',
      'Scroll down and tap "Add to Home Screen". If you do not see it, tap "Edit Actions" first.',
      'Make sure "Open as Web App" is on, then tap "Add".',
      'Start the IT Hub from its Home Screen icon.'
    ],
    note: 'iOS does not offer an automatic install prompt. Installed web apps keep their own storage, separate from Safari, so you sign in once inside the app.'
  },
  android: {
    browsers: 'Chrome, Edge or Samsung Internet',
    steps: ['Open this page in Chrome.', 'Tap "Install IT Hub" above, or open the browser menu (three dots).', 'Choose "Install app" (or "Add to Home screen") and confirm.', 'Start the IT Hub from your app drawer or Home screen.']
  },
  windows: {
    browsers: 'Microsoft Edge or Google Chrome',
    steps: [
      'Open this page in Edge or Chrome.',
      'Click "Install IT Hub" above, or the install icon at the right end of the address bar.',
      'Confirm with "Install". The IT Hub opens in its own window and appears in the Start menu.',
      'Optional: pin it to the taskbar.'
    ],
    note: 'Installing the PWA does not install the Windows inventory agent. The agent is a separate, optional tool - see "Windows inventory agent" below.'
  },
  macos: {
    browsers: 'Safari 17+ (macOS Sonoma or later), Chrome or Edge',
    steps: [
      'Safari: choose File > "Add to Dock...", then "Add".',
      'Chrome / Edge: click "Install IT Hub" above, or the install icon in the address bar.',
      'Start the IT Hub from the Dock, Launchpad or Applications.'
    ],
    note: 'Firefox on macOS does not support installing web apps.'
  },
  linux: {
    browsers: 'Chromium, Google Chrome, Microsoft Edge or Brave',
    steps: [
      'Open this page in a Chromium-based browser.',
      'Click "Install IT Hub" above, or the install icon in the address bar (or menu > "Install IT Hub...").',
      'The IT Hub gets a desktop entry in your application launcher.'
    ],
    note: 'Firefox does not support installing web apps; use it in a normal browser tab instead.'
  }
};

export function Landing() {
  const pwa = JSON.parse(usePwa()) as ReturnType<typeof pwaState>;
  const detected = useMemo(() => detectPlatform(), []);
  const [platform, setPlatform] = useState<Platform>(detected.platform === 'other' ? 'windows' : detected.platform);
  const [installMsg, setInstallMsg] = useState<string | null>(null);
  const [theme, setTheme] = useTheme();

  useEffect(() => {
    document.title = 'The Company of 1 - IT Hub';
  }, []);

  const install = async () => {
    const result = await promptInstall();
    if (result === 'unavailable') {
      setInstallMsg(
        detected.platform === 'ios'
          ? 'On iPhone and iPad, install from Safari: Share > Add to Home Screen.'
          : 'Your browser did not offer automatic installation. Follow the steps for your platform below.'
      );
      document.getElementById('install')?.scrollIntoView({ behavior: 'smooth' });
    } else if (result === 'accepted') setInstallMsg('Installed. You can now start the IT Hub from your apps.');
  };

  const standalone = isStandalone();
  const info = platform === 'other' ? null : INSTRUCTIONS[platform];

  return (
    <div className="landing">
      <header className="landing-nav">
        <span className="brand" style={{ padding: 0 }}>
          <Logo />
          <span>
            IT Hub
            <small>The Company of 1</small>
          </span>
        </span>
        <div className="row">
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode">
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <Link className="btn btn-sm" to="/hub">
            Open
          </Link>
        </div>
      </header>

      <main>
        <section className="hero">
          <div>
            <span className="eyebrow">
              <ShieldCheck size={14} aria-hidden="true" /> Private by default. Powered by GitHub.
            </span>
            <h1>
              Every device, guide and setup step, <span>in one app.</span>
            </h1>
            <p className="lead">
              The IT Hub is the internal IT management app of The Company of 1. It shows the device inventory, software, infrastructure and setup documentation, read
              live from the company's private GitHub repository with your own GitHub account.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary btn-lg" to="/hub">
                Open IT Hub <ArrowRight size={18} aria-hidden="true" />
              </Link>
              {!standalone && !pwa.installed && (
                <button className="btn btn-lg" type="button" onClick={() => void install()}>
                  <Download size={18} aria-hidden="true" /> Install IT Hub
                </button>
              )}
              {(standalone || pwa.installed) && (
                <span className="badge ok" style={{ alignSelf: 'center' }}>
                  Installed on this device
                </span>
              )}
            </div>
            {installMsg && (
              <p className="subtle" role="status" style={{ marginTop: 12 }}>
                {installMsg}
              </p>
            )}
          </div>
          <div className="preview" aria-hidden="true">
            <div className="preview-bar">
              <i />
              <i />
              <i />
            </div>
            <div className="preview-grid">
              <div className="preview-tile">
                <Cpu size={16} />
                <b>&nbsp;</b>
                <span>Devices</span>
              </div>
              <div className="preview-tile">
                <BookOpen size={16} />
                <b>&nbsp;</b>
                <span>Guides</span>
              </div>
              <div className="preview-tile">
                <RefreshCw size={16} />
                <b>&nbsp;</b>
                <span>Live</span>
              </div>
            </div>
            <div className="preview-rows">
              {[0, 1, 2].map((i) => (
                <div className="preview-row" key={i}>
                  <Cpu size={15} />
                  <div className="skeleton" style={{ animation: 'none', maxWidth: `${80 - i * 15}%` }} />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="features">
            <div className="card feature">
              <div className="icon-tile">
                <Cpu size={19} aria-hidden="true" />
              </div>
              <h3>Inventory at a glance</h3>
              <p>Devices with IDs, lifecycle, hardware and the latest automatic inventory snapshot. Unknown values are shown as unknown, never guessed.</p>
            </div>
            <div className="card feature">
              <div className="icon-tile">
                <BookOpen size={19} aria-hidden="true" />
              </div>
              <h3>Documentation that stays current</h3>
              <p>Setup guides, software standards and infrastructure notes rendered from Markdown in the repository. Edit in GitHub, refresh in the app.</p>
            </div>
            <div className="card feature">
              <div className="icon-tile">
                <Smartphone size={19} aria-hidden="true" />
              </div>
              <h3>One app, every platform</h3>
              <p>Installable on iPhone, iPad, Android, Windows, macOS and Linux. Fast, responsive, with light and dark themes.</p>
            </div>
          </div>
        </section>

        <section className="section" id="install">
          <h2>Install the IT Hub</h2>
          <p className="muted">The IT Hub is a Progressive Web App: no app store needed. Installation differs per platform.</p>
          <div className="platform-tabs" role="tablist" aria-label="Platform">
            {PLATFORMS.map((p) => (
              <button key={p.id} role="tab" type="button" aria-selected={platform === p.id} onClick={() => setPlatform(p.id)}>
                {p.label}
                {detected.platform === p.id ? ' (this device)' : ''}
              </button>
            ))}
          </div>
          {info && (
            <div className="card" role="tabpanel">
              <p className="subtle">
                <strong>Supported browsers:</strong> {info.browsers}
              </p>
              <ol className="steps">
                {info.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              {info.note && <p className="subtle" style={{ marginTop: 14, marginBottom: 0 }}>{info.note}</p>}
            </div>
          )}
        </section>

        <section className="section">
          <div className="grid grid-2">
            <div className="card">
              <h2>
                <GitHubMark size={18} /> How sign-in works
              </h2>
              <ul className="list">
                {[
                  'You sign in with your own GitHub account. There are no shared accounts or passwords.',
                  'Being signed in is not enough: the app checks that your account has read access to the private IT repository before loading anything.',
                  'The app requests read-only access to that one repository. It cannot change anything in GitHub.',
                  'The owner grants and removes access in GitHub. Removing access takes effect on the next refresh.'
                ].map((t) => (
                  <li key={t} className="list-item" style={{ alignItems: 'flex-start' }}>
                    <CheckCircle2 size={17} style={{ color: 'var(--ok)', flex: 'none', marginTop: 3 }} aria-hidden="true" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card">
              <h2>
                <Lock size={18} aria-hidden="true" /> Privacy and access control
              </h2>
              <ul className="list">
                {[
                  'This public website contains only the application. No inventory or internal documentation is published here.',
                  'Private content is fetched from GitHub after sign-in and kept in memory only. It is not stored for offline use.',
                  'Signing out removes your session and all loaded content from this device.',
                  'No analytics, no tracking, no third-party scripts.'
                ].map((t) => (
                  <li key={t} className="list-item" style={{ alignItems: 'flex-start' }}>
                    <CheckCircle2 size={17} style={{ color: 'var(--ok)', flex: 'none', marginTop: 3 }} aria-hidden="true" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="card row" style={{ alignItems: 'flex-start', gap: 16 }}>
            <div className="icon-tile">
              <MonitorDown size={19} aria-hidden="true" />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <h2>Windows inventory agent</h2>
              <p className="muted" style={{ margin: 0 }}>
                An optional, separate tool for Windows PCs. It reads hardware and installed software and proposes inventory updates as GitHub pull requests for review.
                It is distributed from the private repository; after sign-in, see Settings &rarr; Windows agent.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <span>The Company of 1 - IT Hub</span>
        <span>Version {APP_VERSION}</span>
      </footer>
    </div>
  );
}
