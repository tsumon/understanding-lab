import type { Locale } from '../domain/locale';

export type ExperimentKind = 'data-split' | 'regression' | 'overfitting' | 'gradient-descent' | 'classification' | 'neural-network' | 'embeddings' | 'attention' | 'generation' | 'rag' | 'evaluation' | 'safety';
export interface CourseQuestion {
  id: string;
  question: string;
  options: { id: string; text: string; feedback: string }[];
  correctId: string;
}
export interface ChapterContent {
  title: string;
  summary: string;
  objectives: string[];
  explanation: { title: string; text: string }[];
  misconception: { claim: string; correction: string };
  prediction: CourseQuestion;
  experiment: { prompt: string; steps: string[]; interpretation: string; limitation: string };
  transfer: { prompt: string; rubric: string[]; sampleAnswer: string };
  quiz: CourseQuestion[];
  reflection: string[];
  glossary: { term: string; definition: string }[];
  sources: { title: string; url: string; usedFor: string }[];
}
export interface CourseChapter {
  id: string;
  order: number;
  prerequisites: string[];
  minutes: number;
  experimentKind: ExperimentKind;
  content: Record<Locale, ChapterContent>;
}
