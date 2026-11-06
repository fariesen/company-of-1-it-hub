import { ArrowLeft, ExternalLink, FlaskConical, KeyRound, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Callout, ErrorPanel, GitHubMark, Logo } from '../components/ui';
import { useHub } from '../state';

export function SignIn() {
  const { bootstrap, signInError, signInWithToken, signInWithGitHubApp } = useHub();
  const [token, setToken] = useState('');
  const [persist, setPersist] = useState(false);
  const [busy, setBusy] = useState(false);

  const methods = bootstrap?.auth.methods ?? [];
  const appEnabled = methods.includes('github-app') && !!bootstrap?.auth.githubApp;
  const tokenEnabled = methods.includes('fine-grained-token');
  const repo = bootstrap ? `${bootstrap.bootstrap.owner}/${bootstrap.bootstrap.repository}` : 'the IT repository';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await signInWithToken(token, persist);
    setToken('');
    setBusy(false);
  };

  return (
    <div className="signin">
      <div className="card signin-card">
        <Link to="/" className="subtle row" style={{ gap: 4, marginBottom: 18 }}>
          <ArrowLeft size={15} aria-hidden="true" /> About the IT Hub
        </Link>
        <Logo />
        <h1>Sign in to the IT Hub</h1>
        <p className="muted">
          The IT Hub reads inventory and documentation directly from the private GitHub repository <strong>{repo}</strong> using your own GitHub identity.
          Only accounts the owner has granted access can see its content.
        </p>

        {signInError && (
          <div style={{ margin: '16px 0' }}>
            <ErrorPanel error={signInError} />
          </div>
        )}

        {!bootstrap && <p className="subtle">Loading configuration...</p>}

        {appEnabled && (
          <div className="stack" style={{ marginTop: 18 }}>
            <button className="btn btn-primary btn-lg" type="button" onClick={() => void signInWithGitHubApp(persist)}>
              <GitHubMark size={19} /> Continue with GitHub
            </button>
            <label className="check">
              <input type="checkbox" checked={persist} onChange={(e) => setPersist(e.target.checked)} />
              <span>Keep me signed in on this device. Leave this off on shared devices.</span>
            </label>
            <p className="subtle row" style={{ gap: 6 }}>
              <ShieldCheck size={15} aria-hidden="true" /> You sign in on github.com. The IT Hub never sees your GitHub password and only receives read access to the IT repository.
            </p>
          </div>
        )}

        {appEnabled && tokenEnabled && <div className="divider">or, for the repository owner</div>}

        {tokenEnabled && (
          <form onSubmit={(e) => void submit(e)} className="stack" style={{ marginTop: appEnabled ? 0 : 18 }} autoComplete="off">
            {!appEnabled && (
              <Callout tone="warn" icon={FlaskConical}>
                <strong>Prototype sign-in.</strong>
                <p>
                  Sign-in with GitHub is not enabled yet: it needs an approved token-exchange service (see docs/authentication.md). Until then, the repository
                  owner can sign in with a fine-grained personal access token. Collaborators cannot use this method yet.
                </p>
              </Callout>
            )}
            <div>
              <label htmlFor="pat" style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <KeyRound size={16} aria-hidden="true" /> Fine-grained personal access token
              </label>
              <input
                id="pat"
                className="input mono"
                type="password"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="github_pat_..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
              />
            </div>
            <label className="check">
              <input type="checkbox" checked={persist} onChange={(e) => setPersist(e.target.checked)} />
              <span>Remember this token on this device. Otherwise it is forgotten when you close the app.</span>
            </label>
            <button className="btn btn-primary" type="submit" disabled={busy || token.trim() === ''}>
              {busy ? 'Checking...' : 'Sign in with token'}
            </button>
            <details className="disclosure">
              <summary>How to create a least-privilege token</summary>
              <ol>
                <li>
                  Open{' '}
                  <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">
                    GitHub &rarr; Settings &rarr; Fine-grained tokens <ExternalLink size={12} aria-hidden="true" />
                  </a>
                  .
                </li>
                <li>Set an expiration (90 days or less).</li>
                <li>
                  Resource owner: <strong>{bootstrap?.bootstrap.owner ?? 'the repository owner'}</strong>. Repository access: <em>Only select repositories</em> &rarr; <strong>{bootstrap?.bootstrap.repository ?? 'the IT repository'}</strong>.
                </li>
                <li>
                  Repository permissions: <strong>Contents: Read-only</strong> (Metadata: Read-only is added automatically). Nothing else.
                </li>
                <li>Generate the token and paste it here. Revoke it on the same GitHub page when you no longer need it.</li>
              </ol>
            </details>
          </form>
        )}
      </div>
    </div>
  );
}
