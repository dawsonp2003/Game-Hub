export interface GenerateStatus {
  /** Primary status line shown under the spinner. */
  message: string
  /** Optional secondary line (e.g. retry reason, item count). */
  detail?: string
}

export type GenerateStatusCallback = (status: GenerateStatus) => void

export class TierGenerateError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
  ) {
    super(message)
    this.name = 'TierGenerateError'
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export { sleep }
