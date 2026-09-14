import { useState } from 'react';
import type { PersonalAuthMethod } from '../lib/api';
import { AuthForm } from './AuthForm';
import { PersonalAccess } from './PersonalAccess';
import { O2SwitchTutorial } from './O2SwitchTutorial';

type Route = 'choice' | 'hosted' | 'selfhosted';
const STORAGE_KEY = 'pulsenotes:connection-choice';

export function AuthGateway({ serverMode, instanceName, initialUsername, error, loading, setupRequired = false, credentialInvalid = false, authMethod = '', onSubmit, onPersonalSetup, onPersonalUnlock, onPersonalCredential }: { serverMode: 'global' | 'selfhosted'; instanceName: string; initialUsername: string; error: string; loading: boolean; setupRequired?: boolean; credentialInvalid?: boolean; authMethod?: PersonalAuthMethod | ''; onSubmit: (username: string, password: string) => Promise<void>; onPersonalSetup: (username: string, password: string, method: PersonalAuthMethod, secret: string) => Promise<void>; onPersonalUnlock: (secret: string) => Promise<void>; onPersonalCredential: (password: string) => Promise<void> }) {
  const [saved] = useState(() => localStorage.getItem(STORAGE_KEY));
  const [route, setRoute] = useState<Route>(() => saved === 'hosted' || saved === 'selfhosted' ? saved : 'choice');
  const [remember, setRemember] = useState(saved === 'hosted' || saved === 'selfhosted');
  if (serverMode === 'selfhosted') return <PersonalAccess setupRequired={setupRequired} credentialInvalid={credentialInvalid} authMethod={authMethod} username={initialUsername} instanceName={instanceName} error={error} loading={loading} onSetup={onPersonalSetup} onUnlock={onPersonalUnlock} onCredential={onPersonalCredential} />;
  const choose = (next: Exclude<Route, 'choice'>) => {
    if (remember) localStorage.setItem(STORAGE_KEY, next); else localStorage.removeItem(STORAGE_KEY);
    setRoute(next);
  };
  const back = () => { localStorage.removeItem(STORAGE_KEY); setRemember(false); setRoute('choice'); };
  if (route === 'hosted') return <AuthForm initialUsername={initialUsername} error={error} loading={loading} instanceName={instanceName} canGoBack onBack={back} onSubmit={onSubmit} />;
  if (route === 'selfhosted') return <O2SwitchTutorial onBack={back} />;
  return <main className="gateway-shell"><section className="gateway-card" aria-labelledby="gateway-title">
    <h1 id="gateway-title">Comment souhaitez-vous utiliser PulseNotes&nbsp;?</h1>
    <label className="remember-choice"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} /><span className="remember-switch" aria-hidden="true"><i /></span><span className="remember-copy"><strong>Retenir mon choix sur cet appareil</strong><small>PulseNotes ouvrira directement la méthode sélectionnée. Ce réglage reste modifiable.</small></span><span className="remember-state" aria-hidden="true">{remember ? 'Activé' : 'Désactivé'}</span></label>
    <div className="gateway-options">
      <button className="gateway-option selfhost" onClick={() => choose('selfhosted')}><span className="gateway-option-topline"><span className="option-label">Hébergement recommandé</span><span className="o2switch-duration">2–5 min</span></span><span className="o2switch-brand" aria-hidden="true"><b>o2</b>switch</span><strong>Installer sur votre o2switch</strong><p>Votre espace personnel sur votre propre hébergement, avec une installation guidée.</p><span className="option-summary"><span>3 étapes accompagnées</span><span>Mises à jour incluses</span></span><span className="option-action">Découvrir l’installation <i aria-hidden="true">→</i></span></button>
      <button className="gateway-option hosted" onClick={() => choose('hosted')}><span className="gateway-option-topline"><span className="option-label">Nous faire confiance</span><span className="hosted-speed">Immédiat</span></span><strong>Se connecter maintenant</strong><p>Accédez à vos résultats sans installer de serveur.</p><span className="option-summary"><span>Aucune installation</span><span>Mot de passe non conservé</span></span><span className="option-action">Continuer vers la connexion <i aria-hidden="true">→</i></span></button>
    </div>
  </section></main>;
}
