import type { ChapterInfo } from './chapter-workflow'
import type { ChapterBlueprint } from './directory-workflow'

export interface ChapterCreationFormValues {
  chapterNumber: number | ''
  title: string
  role: string
  purpose: string
  keyEvents: string
  characters: string
  suspenseHook: string
  userGuidance: string
  knowledgeQueryHint: string
}

export function buildChapterCreationPrefillFromBlueprint(blueprint: ChapterBlueprint): Record<string, unknown> {
  return {
    chapterNumber: blueprint.chapterNumber,
    title: blueprint.title,
    role: blueprint.role,
    purpose: blueprint.purpose,
    keyEvents: blueprint.keyEvents,
    characters: blueprint.characters.join('、'),
    suspenseHook: blueprint.suspenseHook || '',
    userGuidance: blueprint.userGuidance || '',
  }
}

export function buildChapterWorkflowInput(values: ChapterCreationFormValues): ChapterInfo {
  return {
    chapterNumber: Number(values.chapterNumber) || 1,
    title: values.title || `第${Number(values.chapterNumber) || 1}章`,
    role: values.role,
    purpose: values.purpose,
    characters: values.characters.split(/[、,，]/).map(s => s.trim()).filter(Boolean),
    keyEvents: values.keyEvents,
    suspenseHook: values.suspenseHook,
    userGuidance: values.userGuidance,
    knowledgeQueryHint: values.knowledgeQueryHint.trim() || undefined,
  }
}
