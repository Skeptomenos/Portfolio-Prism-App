/** Reject promptly even if a trusted connector fails to cooperate with abort.
 * Every persistence callback must additionally recheck the signal. */
export async function boundedOperation<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  let abort: () => void = () => {}
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(signal.reason ?? new DOMException('Aborted','AbortError'))
    signal.addEventListener('abort',abort,{once:true})
  })
  try { return await Promise.race([work,cancelled]) }
  finally { signal.removeEventListener('abort',abort) }
}
