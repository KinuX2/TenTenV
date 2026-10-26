// node:sqlite の「試験的な機能」の警告だけを出さないようにする（ほかの警告はそのまま）
const original = process.emitWarning.bind(process)
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const text = typeof warning === 'string' ? warning : warning?.message
  const type = typeof rest[0] === 'string' ? rest[0] : (rest[0] as { type?: string } | undefined)?.type
  if (type === 'ExperimentalWarning' && /SQLite/i.test(String(text))) return
  return (original as (...a: unknown[]) => void)(warning, ...rest)
}) as typeof process.emitWarning

export {}
