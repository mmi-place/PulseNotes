import type { AppUpdateStatus } from '../lib/api';

const phaseLabels: Record<string, string> = {
  idle: 'Préparation de la mise à jour…',
  download: 'Téléchargement de la nouvelle version…',
  verification: 'Vérification de la release…',
  preparation: 'Préparation des fichiers…',
  installation: 'Installation de la nouvelle version…'
};

export function MaintenanceScreen({ update, error, onRetry }: { update: AppUpdateStatus | null; error: string; onRetry: () => void }) {
  const unsupported = update && !update.supported;
  return <main className="maintenance-shell" aria-labelledby="maintenance-title" aria-busy={!error && !unsupported}>
    <section className="maintenance-card">
      <div className="maintenance-mark" aria-hidden="true"><span>PN</span></div>
      <p className="eyebrow">Maintenance PulseNotes</p>
      <h1 id="maintenance-title">Mise à jour en cours</h1>
      <p>PulseNotes installe une nouvelle version. Vos notes, votre compte et la configuration du serveur sont conservés.</p>
      {!error && !unsupported && <div className="maintenance-progress" role="status" aria-live="polite"><span aria-hidden="true"><i /></span><strong>{phaseLabels[update?.phase || 'idle'] || phaseLabels.idle}</strong><small>Cette opération peut prendre quelques minutes. Cette page se rechargera automatiquement.</small></div>}
      {(error || unsupported) && <div className="maintenance-failure" role="alert"><strong>La mise à jour n’a pas pu démarrer</strong><p>{error || update?.supportError}</p><button className="action-button primary" type="button" onClick={onRetry}>Réessayer</button></div>}
      {update?.latestVersion && <small className="maintenance-version">Version cible {update.latestVersion}</small>}
    </section>
  </main>;
}
