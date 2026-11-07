import { toast } from 'sonner'

/**
 * Runs a write to the shared folder without making the screen wait for it – a write to M: can take 20 s. The kvArrays
 * helpers already show the change at once; this reports how it went as a toast. Returns whether it was saved.
 */
export function saveInBackground(write: Promise<unknown>, { success, failure }: { success?: string; failure: string }): Promise<boolean> {
  return write.then(
    () => { if (success) toast.success(success); return true },
    error => { console.error(failure, error); toast.error(failure); return false },
  )
}
