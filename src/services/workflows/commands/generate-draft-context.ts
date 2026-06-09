import type { ChapterPromptBuilder } from '../../prompts/prompt-builder'
import type { ChapterInfo } from '../chapter-workflow'

export function applySharedChapterContext(
  builder: ChapterPromptBuilder,
  chapterInfo: ChapterInfo,
  futureBlueprints: string,
) {
  builder
    .withChapterInfo(chapterInfo)
    .withFutureBlueprints(futureBlueprints)
    .withUserGuidance(chapterInfo.userGuidance?.trim() || '（无微操指导）')

  return builder
}
