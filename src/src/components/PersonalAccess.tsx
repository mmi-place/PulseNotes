import { useEffect, useState, type FormEvent } from 'react';
import type { PersonalAuthMethod } from '../lib/api';
import { LocalSecretControl, personalMethodLabels } from './LocalSecretControl';

const methods: { id: PersonalAuthMethod; text: string }[] = [
  { id: 'pin4', text: 'Rapide sur un appareil privé' },
  { id: 'pin8', text: 'Plus robuste, toujours tactile' },
  { id: 'pattern', text: 'Confortable sur mobile' },
  { id: 'password', text: 'Saisie classique au clavier' }
];

export function PersonalAccess({ setupRequired, credentialInvalid, authMethod, username, displayName, instanceName, error, loading, onSetup, onUnlock, onCredential }: { setupRequired: boolean; credentialInvalid: boolean; authMethod: PersonalAuthMethod | ''; username: string; displayName?: string; instanceName: string; error: string; loading: boolean; onSetup: (username: string, password: string, method: PersonalAuthMethod, secret: string) => Promise<void>; onUnlock: (secret: string) => Promise<void>; onCredential: (password: string) => Promise<void> }) {
  const [step, setStep] = useState(1);
  const [identifier, setIdentifier] = useState(username);
  const [casPassword, setCasPassword] = useState('');
  const [method, setMethod] = useState<PersonalAuthMethod>('pin4');
  const [secret, setSecret] = useState('');
  const [confirmation, setConfirmation] = useState('');
  useEffect(() => { setSecret(''); setConfirmation(''); }, [method]);

  if (credentialInvalid) return <main className="personal-access-shell"><section className="personal-access-card compact" aria-labelledby="credential-title"><p className="eyebrow">{instanceName}</p><h1 id="credential-title">Votre mot de passe UVSQ a changé</h1><p>Entrez le nouveau mot de passe utilisé sur le service officiel. Votre identifiant reste inchangé.</p><form className="personal-form" onSubmit={event => { event.preventDefault(); void onCredential(casPassword); }}><input className="sr-only" tabIndex={-1} aria-hidden="true" value={username} autoComplete="username" readOnly /><label><span>Nouveau mot de passe UVSQ</span><input autoFocus type="password" value={casPassword} autoComplete="current-password" onChange={event => setCasPassword(event.target.value)} required /></label>{error && <p className="personal-error" role="alert">{error}</p>}<button className="action-button primary" disabled={loading}>{loading ? 'Vérification…' : 'Mettre à jour et continuer'}</button></form><p className="personal-security-note">Le nouveau mot de passe est vérifié auprès de l’UVSQ, puis chiffré dans votre installation.</p></section></main>;

  if (!setupRequired) {
    const activeMethod = authMethod || 'password';
    return <main className="personal-access-shell"><section className="personal-access-card unlock-card" aria-labelledby="unlock-title"><p className="eyebrow">{instanceName}</p><h1 id="unlock-title">Bonjour{displayName ? ` ${displayName}` : ''}</h1><p>Déverrouillez votre espace personnel.</p><form className="personal-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void onUnlock(secret); }}><LocalSecretControl method={activeMethod} value={secret} onChange={setSecret} label={personalMethodLabels[activeMethod]} autoFocus />{error && <p className="personal-error" role="alert">{error}</p>}<button className="action-button primary" disabled={loading || !secret}>{loading ? 'Connexion…' : 'Ouvrir PulseNotes'}</button></form><p className="personal-security-note">Un seul compte est configuré sur ce serveur personnel.</p></section></main>;
  }

  const nextCredentials = (event: FormEvent) => { event.preventDefault(); if (identifier && casPassword) setStep(2); };
  const nextMethod = () => setStep(3);
  const finish = (event: FormEvent) => { event.preventDefault(); if (secret !== confirmation) return; void onSetup(identifier, casPassword, method, secret); };
  return <main className="personal-access-shell"><section className="personal-access-card setup-card" aria-labelledby="setup-title"><header className="setup-heading"><div><p className="eyebrow">Première configuration</p><h1 id="setup-title">Préparons votre espace personnel</h1></div><span>Étape {step} sur 3</span></header><ol className="setup-progress" aria-label="Progression"><li className={step >= 1 ? 'active' : ''}>Compte UVSQ</li><li className={step >= 2 ? 'active' : ''}>Accès local</li><li className={step >= 3 ? 'active' : ''}>Confirmation</li></ol>
    {step === 1 && <form className="personal-form" onSubmit={nextCredentials}><div className="setup-copy"><h2>Connectez le compte à consulter</h2><p>PulseNotes vérifie ces informations sur le portail UVSQ. Le mot de passe sera chiffré dans la base SQLite de ce serveur.</p></div><label><span>Identifiant UVSQ</span><input autoFocus value={identifier} autoComplete="username" onChange={event => setIdentifier(event.target.value)} required /></label><label><span>Mot de passe UVSQ</span><input type="password" value={casPassword} autoComplete="current-password" onChange={event => setCasPassword(event.target.value)} required /></label><button className="action-button primary">Continuer</button></form>}
    {step === 2 && <div className="personal-form"><div className="setup-copy"><h2>Choisissez comment ouvrir PulseNotes</h2><p>Cette protection locale évite de ressaisir votre mot de passe UVSQ.</p></div><div className="method-grid" role="radiogroup" aria-label="Méthode d’accès local">{methods.map(item => <button type="button" role="radio" aria-checked={method === item.id} className={method === item.id ? 'selected' : ''} key={item.id} onClick={() => setMethod(item.id)}><strong>{personalMethodLabels[item.id]}</strong><span>{item.text}</span></button>)}</div><div className="wizard-actions"><button type="button" className="action-button secondary" onClick={() => setStep(1)}>Retour</button><button type="button" className="action-button primary" onClick={nextMethod}>Continuer</button></div></div>}
    {step === 3 && <form className="personal-form" onSubmit={finish}><div className="setup-copy"><h2>Créez votre {personalMethodLabels[method].toLowerCase()}</h2><p>Vous l’utiliserez à chaque nouvelle session sur cette installation.</p></div><div className="secret-confirm-grid"><LocalSecretControl method={method} value={secret} onChange={setSecret} label="Créer l’accès local" autoFocus /><LocalSecretControl method={method} value={confirmation} onChange={setConfirmation} label="Confirmer l’accès local" /></div>{confirmation && secret !== confirmation && <p className="personal-error" role="alert">Les deux saisies ne correspondent pas.</p>}{error && <p className="personal-error" role="alert">{error}</p>}<div className="wizard-actions"><button type="button" className="action-button secondary" onClick={() => setStep(2)}>Retour</button><button className="action-button primary" disabled={loading || !secret || secret !== confirmation}>{loading ? 'Configuration…' : 'Terminer la configuration'}</button></div></form>}
  </section></main>;
}
