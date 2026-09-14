import assert from 'node:assert/strict';
import test from 'node:test';
import { demoData } from '../src/lib/demo';
import { buildPulsePdfModel, PDF_PRESETS, type PulsePdfOptions } from '../src/pdf/model';

const options: PulsePdfOptions = {
  preset: 'balanced',
  sections: { ...PDF_PRESETS.balanced },
  color: true
};

test('builds the final balanced PDF model for a selected year', () => {
  const data = demoData();
  const model = buildPulsePdfModel(data, ['S1', 'S2'], 'Année 1', options);
  assert.equal(model.periodLabel, 'Année 1');
  assert.equal(model.reports.length, 2);
  assert.equal(model.status, 'Final');
  assert.equal(model.reports[0].evaluationRows.length, 24);
  assert.ok(model.reports[0].ueChart.length > 0);
  assert.doesNotMatch(JSON.stringify(model), /NaN/);
});

test('marks a selection containing an active semester as provisional', () => {
  const model = buildPulsePdfModel(demoData(), ['S3', 'S4'], 'Année 2', options);
  assert.equal(model.status, 'Provisoire');
});

test('refuses an empty bulletin', () => {
  assert.throws(() => buildPulsePdfModel(demoData(), [], 'Vide', options), /Aucun semestre/);
});
