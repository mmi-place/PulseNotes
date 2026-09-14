import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderPdf } from '@formepdf/core';
import { serialize } from '@formepdf/react';
import React from 'react';
import { demoData } from '../src/lib/demo';
import { PulseNotesDocument } from '../src/pdf/PulseNotesDocument';
import { buildPulsePdfModel, PDF_PRESETS, type PulsePdfOptions } from '../src/pdf/model';

const options: PulsePdfOptions = {
  preset: 'complete',
  sections: { ...PDF_PRESETS.complete },
  color: true
};
const model = buildPulsePdfModel(demoData(), ['S3', 'S4'], 'Année 2 · 2025–2026', options);
const bytes = await renderPdf(JSON.stringify(serialize(<PulseNotesDocument model={model} />)));
const outputDirectory = resolve(process.cwd(), '..', 'output', 'pdf');
await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, 'bulletin-pulsenotes-demo.pdf'), bytes);
