import type { AppUpdateStatus } from '../lib/api';

const formatDeadline = (timestamp: number | null) => timestamp
  ? new Date(timestamp * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  : '';

export function UpdateDialog({ update, loading, error, onInstall, onLater }: { update: AppUpdateStatus; loading: boolean; error: string; onInstall: () => void; onLater: () => void }) {
  return <div className="dialog-backdrop update-dialog-backdrop" role="presentation">
    <section className="update-dialog" role="dialog" aria-modal="true" aria-labelledby="update-title" aria-describedby="update-description">
      <p className="eyebrow">Mise à jour disponible</p>
      <h1 id="update-title">PulseNotes {update.latestVersion}</h1>
      <p id="update-description">Une nouvelle version stable peut être installée automatiquement sans supprimer votre configuration ni vos données.</p>
      <dl className="update-version-grid">
        <div><dt>Version installée</dt><dd>{update.currentVersion}</dd></div>
        <div><dt>Nouvelle version</dt><dd>{update.latestVersion}</dd></div>
      </dl>
      {update.mandatoryOnLogout && <p className="update-warning" role="note">Le délai de 15 jours est terminé. Vous pouvez continuer cette session, mais la mise à jour sera obligatoire dès votre déconnexion.</p>}
      {!update.mandatoryOnLogout && update.forceAfter && <p className="update-deadline">Vous pourrez reporter la mise à jour jusqu’au {formatDeadline(update.forceAfter)}.</p>}
      {!update.supported && <p className="update-error" role="alert">{update.supportError}</p>}
      {error && <p className="update-error" role="alert">{error}</p>}
      <div className="update-actions">
        <button className="action-button secondary" type="button" disabled={loading} onClick={onLater}>Plus tard</button>
        <button className="action-button primary" type="button" disabled={loading || !update.supported || !update.token} onClick={onInstall}>{loading ? 'Préparation…' : 'Mettre à jour maintenant'}</button>
      </div>
    </section>
  </div>;
}
