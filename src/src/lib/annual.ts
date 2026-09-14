import type { Module, Report } from '../types';

export interface ModuleProgression {
  key: string;
  title: string;
  kind: Module['kind'];
  from: Module;
  to: Module;
  fromLabel: string;
  toLabel: string;
  delta: number;
}

interface ModulePoint { module: Module; reportId: string; reportLabel: string; }

function comparableTitle(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function cumulativeSemesterMeans(reports: Report[]) {
  let total = 0;
  let count = 0;
  return reports.map(report => {
    if (report.mean === null) return null;
    total += report.mean;
    count += 1;
    return total / count;
  });
}

export function moduleProgressions(reports: Report[]): ModuleProgression[] {
  const groups = new Map<string, ModulePoint[]>();
  reports.forEach(report => report.modules.forEach(module => {
    if (module.mean === null) return;
    const key = `${module.kind}:${comparableTitle(module.title)}`;
    const points = groups.get(key) || [];
    points.push({ module, reportId: report.id, reportLabel: report.label });
    groups.set(key, points);
  }));

  return [...groups.entries()].flatMap(([key, points]) => {
    const distinct = [...new Map(points.map(point => [point.reportId, point])).values()];
    if (distinct.length < 2) return [];
    const first = distinct[0];
    const last = distinct[distinct.length - 1];
    const from = first.module;
    const to = last.module;
    if (from.mean === null || to.mean === null) return [];
    return [{ key, title: to.title, kind: to.kind, from, to, fromLabel: first.reportLabel, toLabel: last.reportLabel, delta: to.mean - from.mean }];
  }).sort((first, second) => second.delta - first.delta);
}
