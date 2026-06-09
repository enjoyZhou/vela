# Reopen Finalized Draft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow only the latest finalized chapter to re-enter editable state, then require an explicit re-finalize pass before it becomes the stable manuscript again.

**Architecture:** Keep `finalized` as a strict read-only milestone and add a guarded reopen path in the renderer. The MVP reuses the existing `revised` status and existing finalize workflow, while a new guard prevents historical finalized chapters from being reopened.

**Tech Stack:** React 19, TypeScript, Zustand, Electron IPC, Vite, Vitest

---

## File Map

- Modify: `src/services/workflow-guards.ts`
- Modify: `src/components/editor/DraftEditor.tsx`
- Test: `src/services/workflow-guards.test.ts`
- Verify only: `src/components/panels/sidebar/ProjectTree.tsx`
- Verify only: `src/shared/draft-status.ts`

## Task 1: Add Guard For Reopening Finalized Chapters

**Files:**

- Modify: `src/services/workflow-guards.ts`
- Test: `src/services/workflow-guards.test.ts`

- [ ] **Step 1: Write the failing guard test**

Create `src/services/workflow-guards.test.ts` with focused unit coverage for the new reopen guard. Mock `useProjectStore`, `ipc.invoke`, and keep the test file local to the guard module.

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ipcInvoke = vi.fn()
let currentProject: { path: string } | null = { path: '/tmp/demo-project' }

vi.mock('../stores/project-store', () => ({
  useProjectStore: {
    getState: () => ({ currentProject }),
  },
}))

vi.mock('./ipc-client', () => ({
  ipc: {
    invoke: (...args: unknown[]) => ipcInvoke(...args),
  },
}))

describe('guardReopenFinalizedChapter', () => {
  beforeEach(() => {
    currentProject = { path: '/tmp/demo-project' }
    ipcInvoke.mockReset()
    vi.resetModules()
  })

  it('allows reopening the latest finalized chapter', async () => {
    ipcInvoke.mockResolvedValueOnce(12)

    const { guardReopenFinalizedChapter } = await import('./workflow-guards')
    const result = await guardReopenFinalizedChapter(12)

    expect(ipcInvoke).toHaveBeenCalledWith('db:draft-get-max-finalized-chapter')
    expect(result).toEqual({ ok: true })
  })

  it('blocks reopening non-latest finalized chapters', async () => {
    ipcInvoke.mockResolvedValueOnce(12)

    const { guardReopenFinalizedChapter } = await import('./workflow-guards')
    const result = await guardReopenFinalizedChapter(10)

    expect(result.ok).toBe(false)
    expect(result.message).toContain('只允许重新编辑最新定稿章节')
    expect(result.message).toContain('第 12 章')
  })

  it('fails when there is no open project', async () => {
    currentProject = null

    const { guardReopenFinalizedChapter } = await import('./workflow-guards')
    const result = await guardReopenFinalizedChapter(1)

    expect(result).toEqual({ ok: false, message: '请先打开或新建一个项目。' })
  })
})
```

- [ ] **Step 2: Run the guard test to verify it fails**

Run:

```bash
npx vitest run src/services/workflow-guards.test.ts
```

Expected:

```text
FAIL  src/services/workflow-guards.test.ts
Error: guardReopenFinalizedChapter is not exported from ./workflow-guards
```

- [ ] **Step 3: Implement the new guard**

Add `guardReopenFinalizedChapter()` near `guardRepairPostProcess()` so the two “latest finalized chapter only” rules stay together.

```ts
export async function guardReopenFinalizedChapter(chapterNumber: number): Promise<GuardResult> {
  const project = useProjectStore.getState().currentProject
  if (!project) {
    return { ok: false, message: '请先打开或新建一个项目。' }
  }

  const maxFinalized = await ipc.invoke('db:draft-get-max-finalized-chapter')

  if (maxFinalized === 0) {
    return { ok: false, message: '尚无已定稿章节，无法执行重新编辑。' }
  }

  if (chapterNumber !== maxFinalized) {
    return {
      ok: false,
      message: `只允许重新编辑最新定稿章节（第 ${maxFinalized} 章）。\n\n回溯修改第 ${chapterNumber} 章会破坏后续章节的角色状态和上下文链。`,
    }
  }

  return { ok: true }
}
```

- [ ] **Step 4: Run the guard test again**

Run:

```bash
npx vitest run src/services/workflow-guards.test.ts
```

Expected:

```text
PASS  src/services/workflow-guards.test.ts
3 passed
```

- [ ] **Step 5: Commit the guard task**

```bash
git add src/services/workflow-guards.ts src/services/workflow-guards.test.ts
git commit -m "feat: guard reopening finalized chapters"
```

## Task 2: Add Reopen Action To DraftEditor

**Files:**

- Modify: `src/components/editor/DraftEditor.tsx`

- [ ] **Step 1: Add the reopen icon import and guard import**

Update the editor imports so the component can render the new button and call the new guard.

```ts
import { Sparkles, Search, BadgeCheck, Save, FileStack, FileText, Wrench, Pencil } from 'lucide-react'
import { guardRepairPostProcess, guardReopenFinalizedChapter } from '../../services/workflow-guards'
```

- [ ] **Step 2: Add the reopen action handler**

Insert a new `doReopenFinalize()` callback next to `doFinalize()` and `doRepairFinalize()`.

```ts
const doReopenFinalize = useCallback(async () => {
  if (!meta || status !== 'finalized' || isChapterBusy) return

  try {
    const guard = await guardReopenFinalizedChapter(meta.chapterNumber)
    if (!guard.ok) {
      toast.error(guard.message || '无法重新编辑该章节')
      return
    }

    const ok = await confirm(
      `重新编辑后，本章将退出稳定定稿状态。\n\n已有的定稿后处理结果将视为过期，完成修改后需要重新定稿。`,
      {
        title: '确认重新编辑',
        confirmText: '重新编辑',
      }
    )
    if (!ok) return

    await ipc.invoke('db:draft-update-status', meta.id, 'revised', currentBodyRef.current.length)
    setMeta(prev => prev ? { ...prev, status: 'revised' } : prev)

    const { useDraftStore } = await import('../../stores/draft-store')
    await useDraftStore.getState().loadChapterDrafts(meta.chapterNumber)
    useProjectStore.getState().refreshFileTree()

    toast.success('已退出定稿状态，可以继续编辑并重新定稿')
  } catch (e) {
    toast.error(`重新编辑启动失败：${e}`)
  }
}, [meta, status, isChapterBusy])
```

- [ ] **Step 3: Add the button to the finalized toolbar state**

Extend the finalized toolbar so the button appears beside “修复定稿”.

```tsx
{status === 'finalized' && (
  <Button
    variant="outline"
    size="sm"
    onClick={doReopenFinalize}
    disabled={isChapterBusy}
    title="退出定稿状态并恢复编辑"
  >
    <Pencil size={11} />
    重新编辑
  </Button>
)}
```

- [ ] **Step 4: Update the finalize confirmation copy**

Replace the old “定稿后不再支持修改” wording inside `doFinalize()` with copy that still protects the workflow but no longer contradicts the new reopen flow.

```ts
const ok = await confirm(
  `确定要将第 ${meta.chapterNumber} 章定稿吗？\n\n定稿后章节将进入稳定终稿状态，并触发正文同步和后处理。若后续仍需修改，仅允许对最新定稿章节重新编辑。`,
  {
    title: '确认定稿',
    confirmText: '确认定稿',
  }
)
```

- [ ] **Step 5: Keep the button label simple for MVP**

Do not introduce new metadata just to distinguish “定稿” and “重新定稿”. Keep the primary action text as `定稿`, but make the reopen confirmation and finalize confirmation explain the semantics.

```tsx
<Button
  variant="success"
  size="sm"
  onClick={doFinalize}
  disabled={isChapterBusy}
  title="定稿 — 确认终稿并写入正文章节"
>
  <BadgeCheck size={12} />
  定稿
</Button>
```

- [ ] **Step 6: Run lint diagnostics on the edited file**

Run:

```bash
npx eslint src/components/editor/DraftEditor.tsx src/services/workflow-guards.ts src/services/workflow-guards.test.ts
```

Expected:

```text
0 problems
```

- [ ] **Step 7: Commit the editor task**

```bash
git add src/components/editor/DraftEditor.tsx
git commit -m "feat: add reopen action for finalized drafts"
```

## Task 3: Verify Manuscript And Chapter Flow Behavior

**Files:**

- Verify only: `src/components/panels/sidebar/ProjectTree.tsx`
- Verify only: `src/components/editor/DraftEditor.tsx`
- Verify only: `src/services/workflow-guards.ts`

- [ ] **Step 1: Confirm no extra ProjectTree change is needed**

Re-read the finalized manuscript projection and verify that reverting a chapter to `revised` naturally removes it from the manuscript list.

```ts
const manuscriptFiles = Object.values(draftsByChapter)
  .map(drafts => drafts.find(d => d.status === 'finalized'))
  .filter(Boolean)
  .sort((a, b) => a!.chapterNumber - b!.chapterNumber)
```

Expected result:

```text
No code change required in ProjectTree.tsx for the MVP.
```

- [ ] **Step 2: Manually verify the happy path**

Run the app locally:

```bash
npm run dev
```

Manual checks:

```text
1. Open the latest finalized chapter.
2. Click “重新编辑”.
3. Confirm the chapter becomes editable.
4. Confirm the “已定稿（只读）” hint disappears.
5. Confirm the chapter disappears from “正文章节”.
6. Edit and save content.
7. Click “定稿”.
8. Confirm the chapter returns to “正文章节”.
```

- [ ] **Step 3: Manually verify the guard path**

Manual checks:

```text
1. Open a non-latest finalized chapter.
2. Click “重新编辑”.
3. Confirm a toast explains only the latest finalized chapter can be reopened.
4. Confirm the chapter remains read-only.
5. Try to start writing the next chapter while the latest chapter is only revised.
6. Confirm the existing “前一章未定稿” guard still blocks the flow.
```

- [ ] **Step 4: Capture final verification notes**

Record the MVP-specific limitations in the PR or handoff note.

```text
- Sidebar revised label still shows “已修稿” in the MVP.
- No new persisted flag like needsRefinalize is introduced yet.
- Data-layer hardening via dedicated IPC remains a follow-up task.
```

- [ ] **Step 5: Commit the verification notes if docs changed**

```bash
git add docs/superpowers/specs/2026-06-08-reopen-finalized-draft-design.md
git commit -m "docs: document reopened finalized draft limitations"
```
