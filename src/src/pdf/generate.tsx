import { renderPdf } from '@formepdf/core/browser';
import { serialize } from '@formepdf/react';
import type { StudentData } from '../types';
import { PulseNotesDocument } from './PulseNotesDocument';
import { buildPulsePdfModel, type PulsePdfOptions } from './model';

const safeFilename = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

export async function generatePulseNotesPdf(data: StudentData, reportIds: string[], periodLabel: string, options: PulsePdfOptions) {
  const model = buildPulsePdfModel(data, reportIds, periodLabel, options);
  const serialized = serialize(<PulseNotesDocument model={model} />);
  const bytes = await renderPdf(JSON.stringify(serialized));
  return {
    blob: new Blob([bytes.slice().buffer], { type: 'application/pdf' }),
    filename: `bulletin-pulsenotes-${safeFilename(periodLabel)}.pdf`
  };
}

export function downloadPdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
