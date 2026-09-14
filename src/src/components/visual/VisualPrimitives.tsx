import type { ElementType, ReactNode } from 'react';

type VisualElementProps = {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  active?: boolean;
  glow?: boolean;
  'aria-label'?: string;
  'data-visual-component'?: string;
  onClick?: () => void;
};

export function BorderGlow({ as: Tag = 'div', children, className = '', active = false, glow = false, ...props }: VisualElementProps) {
  return <Tag className={`border-glow ${active || glow ? 'border-glow-active' : ''} ${className}`} data-visual-component={props['data-visual-component'] || 'border-glow'} {...props}>{children}</Tag>;
}

export function ChromaCard({ as: Tag = 'div', children, className = '', active = false, glow = false, ...props }: VisualElementProps) {
  return <BorderGlow as={Tag} className={`chroma-card ${className}`} active={active} glow={glow} data-visual-component="chroma-grid" {...props}>{children}</BorderGlow>;
}

export function StylizedBackdrop() {
  return <svg className="scene-terrain" viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden="true" data-visual-component="stylized-backdrop">
    <path d="M-30 330 C230 165 330 505 600 320 S980 160 1260 355 S1490 520 1660 330" fill="none" stroke="#ffffff" strokeOpacity=".48" strokeWidth="1.4" />
    <path d="M-20 690 C220 525 360 800 610 635 S1000 480 1270 660 S1500 790 1640 645" fill="none" stroke="#087c7a" strokeOpacity=".18" strokeWidth="1.2" />
  </svg>;
}
