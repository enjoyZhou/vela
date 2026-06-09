interface FinalizeGuardOptions {
  isDirty: boolean
}

export function getFinalizeGuardMessage({ isDirty }: FinalizeGuardOptions): string | null {
  if (isDirty) return '请先保存当前草稿，再执行定稿'
  return null
}
