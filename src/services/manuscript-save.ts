import type { FileNode } from '../shared/ipc-channels'
import { useProjectStore } from '../stores/project-store'
import { ipc } from './ipc-client'

export function buildManuscriptPhysicalPath(projectPath: string, chapterNumber: number, chapterTitle: string): string {
  const safeTitle = chapterTitle ? ` ${chapterTitle.replace(/[/\\]/g, '_')}` : ''
  return `${projectPath}/第${chapterNumber}章${safeTitle}.txt`
}

function buildManuscriptTextContent(chapterNumber: number, chapterTitle: string, text: string): string {
  const titleLine = chapterTitle
    ? `第${chapterNumber}章 ${chapterTitle}\n\n`
    : `第${chapterNumber}章\n\n`

  return titleLine + text.replace(/^#+ .*\n*/, '')
}

export async function resolveManuscriptTitle(chapterNumber: number, fallbackTitle = ''): Promise<string> {
  try {
    const bp = await ipc.invoke('db:blueprint-get', chapterNumber) as { title?: string } | null
    return bp?.title?.trim() || fallbackTitle
  } catch {
    return fallbackTitle
  }
}

function findLoneLegacyManuscriptPath(files: FileNode[], chapterNumber: number, targetPath: string): string | null {
  const chapterPrefix = `第${chapterNumber}章`
  const candidates = files.filter(file =>
    !file.isDir
    && file.name.startsWith(chapterPrefix)
    && file.name.endsWith('.txt'),
  )

  if (candidates.some(file => file.path === targetPath)) return null
  if (candidates.length !== 1) return null
  return candidates[0].path
}

async function syncManuscriptPhysicalFile(
  projectPath: string,
  chapterNumber: number,
  chapterTitle: string,
  text: string,
): Promise<void> {
  const physicalPath = buildManuscriptPhysicalPath(projectPath, chapterNumber, chapterTitle)
  const projectFiles = await ipc.invoke('fs:list-dir', projectPath)
  const legacyPath = findLoneLegacyManuscriptPath(projectFiles, chapterNumber, physicalPath)
  if (legacyPath) {
    await ipc.invoke('fs:rename-file', legacyPath, physicalPath)
  }

  const contentToWrite = buildManuscriptTextContent(chapterNumber, chapterTitle, text)
  await ipc.invoke('fs:write-file', physicalPath, contentToWrite)
}

export async function saveChapterContent(filePath: string, text: string): Promise<void> {
  if (!filePath.startsWith('vela://manuscript/')) {
    await ipc.invoke('fs:write-file', filePath, text)
    return
  }

  const draftId = parseInt(filePath.replace('vela://manuscript/', ''), 10)
  if (!Number.isFinite(draftId)) {
    throw new Error(`无效的 manuscript 路径: ${filePath}`)
  }

  await ipc.invoke('db:draft-update-content', draftId, text, text.length)

  const currentProject = useProjectStore.getState().currentProject
  if (!currentProject?.path) {
    throw new Error('未打开项目，无法同步正文 txt 文件')
  }

  const meta = await ipc.invoke('db:draft-get-meta', draftId) as { chapterNumber?: number } | null
  if (!meta?.chapterNumber) {
    throw new Error(`无法获取正文元数据: ${draftId}`)
  }

  const chapterTitle = await resolveManuscriptTitle(meta.chapterNumber)
  await syncManuscriptPhysicalFile(currentProject.path, meta.chapterNumber, chapterTitle, text)
}

export { buildManuscriptTextContent, syncManuscriptPhysicalFile }
