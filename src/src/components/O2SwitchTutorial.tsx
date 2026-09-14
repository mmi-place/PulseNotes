import { useEffect, useRef, useState } from 'react';

const INSTALL_COMMAND = 'curl -fsSL https://pulsenotes.mmi.place/install.sh | bash';

function CpanelIllustration() {
  return <svg className="tutorial-svg cpanel-svg" viewBox="0 0 720 430" role="img" aria-labelledby="cpanel-svg-title cpanel-svg-description">
    <title id="cpanel-svg-title">Accès au Terminal dans cPanel Jupiter</title><desc id="cpanel-svg-description">La page cPanel défile jusqu’à la catégorie Avancé puis le pointeur sélectionne Terminal.</desc>
    <rect className="browser-frame" x="1" y="1" width="718" height="428" rx="16" />
    <rect className="browser-bar" x="1" y="1" width="718" height="42" rx="16" /><circle cx="22" cy="22" r="5" /><circle cx="39" cy="22" r="5" /><circle cx="56" cy="22" r="5" />
    <rect className="cpanel-sidebar" x="1" y="43" width="155" height="386" /><text x="25" y="83" className="cpanel-logo">cPanel</text><text x="25" y="119" className="svg-muted">Outils</text><text x="25" y="151">Accueil</text><text x="25" y="181">Domaines</text><text x="25" y="211">Fichiers</text><text x="25" y="241">Bases de données</text>
    <g className="cpanel-scroll-content">
      <text x="186" y="82" className="svg-page-title">Outils</text><rect x="186" y="101" width="474" height="36" rx="7" className="svg-search" /><text x="204" y="124" className="svg-muted">Rechercher un outil</text>
      <text x="186" y="179" className="svg-section-title">Fichiers</text><g className="tool-tile"><rect x="186" y="195" width="145" height="72" rx="8" /><path d="M207 218h20l8 8v19h-28z" /><text x="247" y="237">Gestionnaire</text></g><g className="tool-tile"><rect x="344" y="195" width="145" height="72" rx="8" /><path d="M365 220h28v22h-28z" /><text x="405" y="237">Sauvegardes</text></g>
      <text x="186" y="312" className="svg-section-title">Avancé</text><g className="tool-tile terminal-tile"><rect x="186" y="328" width="190" height="76" rx="8" /><rect x="207" y="348" width="34" height="28" rx="4" /><path d="m214 356 7 6-7 6m10 0h9" /><text x="258" y="365">Terminal</text></g><g className="tool-tile"><rect x="390" y="328" width="190" height="76" rx="8" /><circle cx="417" cy="365" r="13" /><text x="442" y="365">Tâches cron</text></g>
    </g>
    <rect className="scroll-track" x="692" y="61" width="6" height="340" rx="3" /><rect className="scroll-thumb" x="692" y="70" width="6" height="75" rx="3" />
    <g className="tutorial-cursor"><circle className="cursor-click" cx="0" cy="0" r="18" /><path d="M0 0v27l7-7 6 13 7-4-6-12h10z" /></g>
  </svg>;
}

function TerminalIllustration() {
  return <svg className="tutorial-svg terminal-svg" viewBox="0 0 720 390" role="img" aria-labelledby="terminal-svg-title terminal-svg-description">
    <title id="terminal-svg-title">Terminal cPanel exécutant l’installation PulseNotes</title><desc id="terminal-svg-description">La commande d’installation est collée, puis cinq étapes de configuration s’affichent.</desc>
    <rect className="terminal-frame" x="1" y="1" width="718" height="388" rx="14" /><rect className="terminal-bar" x="1" y="1" width="718" height="42" rx="14" /><circle cx="22" cy="22" r="5" /><circle cx="39" cy="22" r="5" /><circle cx="56" cy="22" r="5" /><text x="360" y="27" textAnchor="middle" className="terminal-title">Terminal — cPanel</text>
    <text x="28" y="82" className="terminal-prompt">[utilisateur@serveur ~]$</text><text x="194" y="82" className="terminal-command-svg">curl -fsSL …/install.sh | bash</text>
    <g className="terminal-output"><text x="28" y="127">Installation o2switch — PulseNotes personnel</text><text x="28" y="162"><tspan className="terminal-step">[1/5]</tspan> Téléchargement et contrôle de la distribution</text><text x="28" y="193"><tspan className="terminal-step">[2/5]</tspan> Détection de votre domaine o2switch</text><text x="28" y="224"><tspan className="terminal-step">[3/5]</tspan> Création du sous-domaine</text><text x="28" y="255"><tspan className="terminal-step">[4/5]</tspan> Installation sécurisée de l’application</text><text x="28" y="286"><tspan className="terminal-step">[5/5]</tspan> Vérification</text><text x="28" y="334" className="terminal-success">Installation terminée : https://pulsenotes.votre-domaine.fr</text></g><rect className="terminal-caret" x="632" y="67" width="8" height="18" />
  </svg>;
}

export function O2SwitchTutorial({ onBack }: { onBack: () => void }) {
  const root = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const elements = [...(root.current?.querySelectorAll<HTMLElement>('[data-install-reveal]') || [])];
    if (!('IntersectionObserver' in window)) { elements.forEach(element => element.classList.add('is-visible')); return; }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { (entry.target as HTMLElement).classList.add('is-visible'); observer.unobserve(entry.target); } }), { threshold: .22 });
    elements.forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(INSTALL_COMMAND); setCopied(true); window.setTimeout(() => setCopied(false), 2200); }
    catch { setCopied(false); }
  };
  return <main ref={root} className="o2-tutorial"><header className="o2-tutorial-header"><button className="auth-back" onClick={onBack}>← Retour au choix</button><span>Guide o2switch · 2–5 min</span></header><section className="o2-tutorial-hero" data-install-reveal><p className="eyebrow">Votre installation personnelle</p><h1>Installer PulseNotes depuis cPanel</h1><p>Vous n’avez ni base MySQL à créer, ni fichier à modifier. Le Terminal o2switch prépare le sous-domaine, PHP, SQLite et les mises à jour.</p><a className="action-button primary" href="#commande-installation">Voir la commande</a></section>
    <section className="tutorial-step" data-install-reveal><div className="tutorial-step-copy"><span>Étape 1</span><h2>Ouvrez le Terminal o2switch</h2><p>Dans cPanel avec le thème Jupiter, descendez jusqu’à la catégorie <strong>Avancé</strong>, puis sélectionnez <strong>Terminal</strong>.</p><p className="tutorial-caption">L’animation reproduit seulement les éléments utiles&nbsp;: votre cPanel peut contenir davantage d’outils.</p></div><div className="tutorial-visual"><CpanelIllustration /></div></section>
    <section className="tutorial-step terminal-step-section" data-install-reveal><div className="tutorial-step-copy"><span>Étape 2</span><h2>Collez une seule commande</h2><p>Le script vérifie son archive, conserve une installation existante et configure automatiquement votre espace personnel.</p><ul><li>Archive vérifiée en SHA-256</li><li>Configuration et SQLite conservées</li><li>Retour arrière en cas d’échec de mise à jour</li></ul></div><div className="tutorial-visual"><TerminalIllustration /></div></section>
    <section className="installation-command-section" id="commande-installation" data-install-reveal><div><span>Commande à copier</span><h2>Prêt à installer</h2><p>Copiez la ligne, collez-la dans le Terminal avec un clic droit, puis appuyez sur Entrée.</p></div><div className="copy-command"><code>{INSTALL_COMMAND}</code><button type="button" onClick={() => void copy()} aria-live="polite">{copied ? 'Copié ✓' : 'Copier'}</button></div><p className="command-help">À la fin, le Terminal affiche l’adresse de votre PulseNotes. Ouvrez-la pour choisir votre PIN, schéma ou mot de passe local.</p></section>
  </main>;
}
