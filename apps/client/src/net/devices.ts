// マイク・スピーカーの一覧
export const listDevices = async () => {
  try {
    const list = await navigator.mediaDevices.enumerateDevices()
    return { inputs: list.filter((d) => d.kind === 'audioinput'), outputs: list.filter((d) => d.kind === 'audiooutput') }
  } catch {
    return { inputs: [], outputs: [] }
  }
}
