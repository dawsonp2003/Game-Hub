const DEVICE_ID_KEY = 'game-arcade-device-id'

/** Stable device id in localStorage — survives tab close and refresh. */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(DEVICE_ID_KEY, id)
    }
    return id
  } catch {
    return 'ephemeral'
  }
}
