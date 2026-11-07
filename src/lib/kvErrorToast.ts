import { toast } from 'sonner'
import type { KvStore } from './localKvStore'
import { trackPendingWrite } from './pendingWrites'

// Wrapper omkring en KvStore, der viser en synlig fejl-toast hvis en
// skrivning (set/delete/update/updateField) fejler — uden dette forsvinder
// fejlen stille (kun i konsollen), og brugeren tror fejlagtigt at deres
// ændring blev gemt. Fejlen kastes videre bagefter, så kald der allerede har
// egen try/catch/toast stadig opfører sig som før.
// Hver skrivning tælles (trackPendingWrite), så appen ved, hvad der stadig er på vej til M:.
export function withErrorToast(store: KvStore): KvStore {
  return {
    ...store,
    set(key, value) {
      return trackPendingWrite((async () => {
        try {
          await store.set(key, value)
        } catch (error) {
          console.error(`Kunne ikke gemme "${key}":`, error)
          toast.error('Kunne ikke gemme ændringen — prøv igen om lidt')
          throw error
        }
      })())
    },
    delete(key) {
      return trackPendingWrite((async () => {
        try {
          await store.delete(key)
        } catch (error) {
          console.error(`Kunne ikke slette "${key}":`, error)
          toast.error('Kunne ikke slette — prøv igen om lidt')
          throw error
        }
      })())
    },
    update(key, operation) {
      return trackPendingWrite((async () => {
        try {
          return await store.update(key, operation)
        } catch (error) {
          if (String(error).includes('KV_CONFLICT')) throw error
          console.error(`Kunne ikke opdatere "${key}":`, error)
          toast.error('Kunne ikke gemme ændringen — prøv igen om lidt')
          throw error
        }
      })())
    },
    updateField(key, operation) {
      return trackPendingWrite((async () => {
        try {
          return await store.updateField(key, operation)
        } catch (error) {
          console.error(`Kunne ikke opdatere felt i "${key}":`, error)
          toast.error('Kunne ikke gemme ændringen — prøv igen om lidt')
          throw error
        }
      })())
    },
    compareAndSet(key, expected, value) {
      return trackPendingWrite(store.compareAndSet(key, expected, value))
    },
  }
}
