import type { CourseChapter } from './types';
import type { Locale } from '../domain/locale';
import type { ExperimentEvidence } from './experiments/ExperimentLab';

export const COURSE_STORAGE_KEY = 'understanding-lab:course-progress:v1';
export interface ChapterProgress {
  prediction?: string;
  experiment?: ExperimentEvidence;
  transfer: string;
  reflection: string;
  answers: Record<string, string>;
  completedAt?: string;
  updatedAt?: string;
}
export interface CourseProgress { schemaVersion: 1; lastChapter?: string; chapters: Record<string, ChapterProgress> }
export const emptyChapter = (): ChapterProgress => ({ transfer: '', reflection: '', answers: {} });
export const emptyProgress = (): CourseProgress => ({ schemaVersion: 1, chapters: {} });
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export function parseProgress(raw: string | null): CourseProgress {
  if (raw === null) return emptyProgress();
  const data: unknown = JSON.parse(raw);
  if (!object(data) || data.schemaVersion !== 1 || !object(data.chapters)) throw new Error('Unsupported course progress');
  for (const value of Object.values(data.chapters)) {
    if (!object(value) || typeof value.transfer !== 'string' || typeof value.reflection !== 'string' || !object(value.answers) || !Object.values(value.answers).every(answer => typeof answer === 'string')) throw new Error('Invalid chapter progress');
    if (value.prediction !== undefined && typeof value.prediction !== 'string') throw new Error('Invalid prediction');
    if (value.completedAt !== undefined && (typeof value.completedAt !== 'string' || !Number.isFinite(Date.parse(value.completedAt)))) throw new Error('Invalid completion');
    if (value.updatedAt !== undefined && (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt)))) throw new Error('Invalid update time');
    if (value.experiment !== undefined) {
      const e = value.experiment;
      if (!object(e) || !object(e.config) || !Object.values(e.config).every(v => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) || !Array.isArray(e.runs) || !e.runs.every(r => object(r) && typeof r.signature === 'string' && typeof r.summary === 'string')) throw new Error('Invalid experiment');
    }
  }
  if (data.lastChapter !== undefined && typeof data.lastChapter !== 'string') throw new Error('Invalid last chapter');
  return data as unknown as CourseProgress;
}
export function completionRequirements(chapter: CourseChapter, locale: Locale, progress: ChapterProgress, labComplete: boolean) {
  const content = chapter.content[locale];
  return {
    prediction: content.prediction.options.some(o => o.id === progress.prediction),
    experiment: labComplete,
    transfer: progress.transfer.trim().length >= 20,
    quiz: content.quiz.length > 0 && content.quiz.every(q => progress.answers[q.id] === q.correctId),
    reflection: progress.reflection.trim().length >= 20,
  };
}

/** Optimistic guard against delayed cross-tab storage events; not an atomic transaction. */
export function writeProgress(storage: Pick<Storage, 'getItem' | 'setItem'>, expectedRaw: string | null, progress: CourseProgress): { status: 'saved'; raw: string } | { status: 'conflict' } {
  if (storage.getItem(COURSE_STORAGE_KEY) !== expectedRaw) return { status: 'conflict' };
  const raw = JSON.stringify(progress);
  storage.setItem(COURSE_STORAGE_KEY, raw);
  return { status: 'saved', raw };
}
