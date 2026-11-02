import type { CourseChapter } from './types';
import { foundationChapters } from './foundations';
import { advancedChapters } from './advanced';

/** Original bilingual lessons; source links support concepts, not learning-effectiveness claims. */
export const chapters: CourseChapter[] = [...foundationChapters, ...advancedChapters];
