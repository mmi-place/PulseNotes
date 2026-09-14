export type ViewId = 'summary' | 'semesters' | 'notes' | 'analyses';
export type NoteKind = 'Ressource' | 'SAÉ';
export type DataQualityLevel = 'sourced' | 'indicative' | 'unavailable';

export interface SemesterRef { id: string; number: number | null; year: string; label: string; formation: string; programYear: number | null; yearScope: string | null; }
export interface EvaluationStats { rank: number; total: number; percentile: number; mean: number; median: number; min: number; max: number; distribution: Array<{ value: number; count: number }>; }
export type EvaluationChangeState = 'new' | 'modified' | 'seen';
export type EvaluationStatsState =
  | { status: 'available'; stats: EvaluationStats }
  | { status: 'insufficient'; total: number | null }
  | { status: 'unavailable'; reason: string };
export interface ReportQuality { level: DataQualityLevel; source: string; method: string; warnings: string[]; }

export interface Evaluation {
  id: string;
  label: string;
  date: string;
  note: number | null;
  promotionMean: number | null;
  moduleCode: string;
  moduleTitle: string;
  kind: NoteKind;
  coefficient: number | null;
  weights: Record<string, number>;
  url?: string;
}

export interface Module { id: string; code: string; title: string; kind: NoteKind; mean: number | null; promotionMean: number | null; context?: string; evaluations: Evaluation[]; }
export interface UE { id: string; code: string; logicalCode: string; title: string; mean: number | null; promotionMean: number | null; context?: string; capitalized: boolean; ectsAcquired: number | null; ectsTotal: number | null; }
export interface Report { id: string; label: string; status: 'En cours' | 'Terminé' | 'Non publié'; mean: number | null; promotionMean: number | null; rank: number | null; rankTotal: number | null; formation: string; published: boolean; quality: ReportQuality; ues: UE[]; modules: Module[]; evaluations: Evaluation[]; }
export interface StudentData { profile: { name: string; formation: string }; semesters: SemesterRef[]; reports: Report[]; lastSync: string; }

export interface NoteSharePayload {
  studentName: string;
  formation: string;
  semesterLabel: string;
  evaluation: Evaluation;
  stats: EvaluationStats;
  sharedAt: string;
}

export interface NoteShareSummary { token: string; evaluationId: string; createdAt: number; missing: boolean; label: string; moduleCode: string; }
export interface PublicNoteShare { payload: NoteSharePayload; createdAt: number; missing: boolean; }
