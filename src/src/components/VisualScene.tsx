import type { ReactNode } from 'react';
import { StylizedBackdrop } from './visual/VisualPrimitives';

export function VisualScene({ children }: { children: ReactNode }) {
  return <div className="visual-scene">
    <div className="scene-grid" aria-hidden="true" />
    <StylizedBackdrop />
    <div className="scene-content">{children}</div>
  </div>;
}
