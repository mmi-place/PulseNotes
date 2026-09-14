import type { PersonalAuthMethod } from '../lib/api';

const methodLabels: Record<PersonalAuthMethod, string> = {
  pin4: 'Code PIN à 4 chiffres',
  pin8: 'Code PIN à 8 chiffres',
  pattern: 'Schéma à relier',
  password: 'Mot de passe local'
};

export const personalMethodLabels = methodLabels;

export function LocalSecretControl({ method, value, onChange, label = 'Votre accès local', autoFocus = false }: { method: PersonalAuthMethod; value: string; onChange: (value: string) => void; label?: string; autoFocus?: boolean }) {
  if (method === 'password') return <label className="personal-password-field"><span>{label}</span><input autoFocus={autoFocus} type="password" value={value} minLength={8} maxLength={128} autoComplete="current-password" onChange={event => onChange(event.target.value)} required /><small>8 caractères minimum. Ce mot de passe reste propre à PulseNotes.</small></label>;

  if (method === 'pattern') return <fieldset className="local-secret-control pattern-control"><legend>{label}</legend><div className="pattern-status" aria-live="polite"><span>{value.length ? `${value.length} point${value.length > 1 ? 's' : ''} relié${value.length > 1 ? 's' : ''}` : 'Touchez au moins 4 points'}</span><button type="button" onClick={() => onChange('')} disabled={!value}>Effacer</button></div><div className="pattern-grid" role="group" aria-label="Grille du schéma">{Array.from({ length: 9 }, (_, index) => String(index + 1)).map(point => <button autoFocus={autoFocus && point === '1'} type="button" key={point} className={value.includes(point) ? 'selected' : ''} aria-label={`Point ${point}${value.includes(point) ? ', sélectionné' : ''}`} aria-pressed={value.includes(point)} disabled={value.includes(point) || value.length >= 9} onClick={() => onChange(value + point)}><span>{value.includes(point) ? value.indexOf(point) + 1 : ''}</span></button>)}</div><small>Reliez 4 à 9 points différents dans l’ordre de votre choix.</small></fieldset>;

  const length = method === 'pin4' ? 4 : 8;
  return <fieldset className="local-secret-control pin-control"><legend>{label}</legend><div className="pin-dots" aria-label={`${value.length} chiffre sur ${length}`} aria-live="polite">{Array.from({ length }, (_, index) => <i key={index} className={index < value.length ? 'filled' : ''} />)}</div><div className="pin-keypad">{['1','2','3','4','5','6','7','8','9'].map((digit, index) => <button autoFocus={autoFocus && index === 0} type="button" key={digit} disabled={value.length >= length} onClick={() => onChange(value + digit)}>{digit}</button>)}<button type="button" className="keypad-word" onClick={() => onChange('')} disabled={!value}>Effacer</button><button type="button" disabled={value.length >= length} onClick={() => onChange(value + '0')}>0</button><button type="button" className="keypad-word" aria-label="Supprimer le dernier chiffre" onClick={() => onChange(value.slice(0, -1))} disabled={!value}>Retour</button></div><small>Saisissez le code uniquement avec les boutons affichés.</small></fieldset>;
}
