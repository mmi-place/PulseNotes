import { FormEvent, useState } from 'react';

export function AuthForm({ initialUsername, error, loading, instanceName, canGoBack, onBack, onSubmit }: { initialUsername: string; error: string; loading: boolean; instanceName: string; canGoBack: boolean; onBack: () => void; onSubmit: (username: string, password: string) => Promise<void> }) {
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try { await onSubmit(username.trim(), password); } finally { setPassword(''); }
  };
  return <main className="cas-shell">
    <div className="cas-brand" aria-label="PulseNotes"><span>PN</span><strong>PulseNotes</strong><small>Connexion étudiante</small></div>
    <section className="cas-card" aria-labelledby="auth-title">
      {canGoBack && <button className="auth-back" type="button" onClick={onBack}>← Changer de méthode</button>}
      <div className="cas-warning" role="note"><strong>Interface non officielle</strong><span>Vous êtes sur {instanceName}, et non sur le site de connexion UVSQ.</span></div>
      <header className="cas-heading"><h1 id="auth-title">Connexion</h1><span className="cas-lock" aria-hidden="true" /></header>
      <p className="cas-security">Votre mot de passe est transmis uniquement au service CAS pendant la connexion, puis immédiatement supprimé. Il n’est jamais enregistré par PulseNotes.</p>
      <form className="cas-form" onSubmit={submit} aria-describedby={error ? 'auth-error' : 'auth-security'}>
        <label htmlFor="username">Identifiant UVSQ</label>
        <input id="username" name="username" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required disabled={loading} aria-invalid={!!error} />
        <label htmlFor="password">Mot de passe</label>
        <input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required disabled={loading} aria-invalid={!!error} />
        {error && <p id="auth-error" className="auth-error" role="alert">{error}</p>}
        <button className="cas-submit" type="submit" disabled={loading}>{loading ? 'Connexion en cours…' : 'Se connecter'}</button>
      </form>
      <p id="auth-security" className="cas-footnote">Connexion chiffrée en production. Vous pouvez utiliser le remplissage automatique et coller votre mot de passe.</p>
    </section>
  </main>;
}
