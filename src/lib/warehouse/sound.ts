// Short tones for scan feedback (no audio files needed). Can be muted; the choice is remembered.
import type { Tone } from '@/lib/warehouse/format'

const STORAGE_KEY = 'warehouse-sound'
let context: AudioContext | null = null

export function isSoundOn(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== 'off' } catch { return true }
}

export function setSoundOn(on: boolean) {
  try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off') } catch {}
}

const PATTERNS: Record<Tone, { frequency: number; duration: number; gap?: number; repeat?: number; type: OscillatorType }> = {
  success: { frequency: 1046, duration: 0.09, type: 'sine' },
  warning: { frequency: 660, duration: 0.09, gap: 0.06, repeat: 2, type: 'triangle' },
  error: { frequency: 220, duration: 0.32, type: 'square' },
}

export function playTone(tone: Tone) {
  if (!isSoundOn()) return
  try {
    context ||= new AudioContext()
    const pattern = PATTERNS[tone]
    const start = context.currentTime + 0.01
    for (let index = 0; index < (pattern.repeat || 1); index++) {
      const at = start + index * (pattern.duration + (pattern.gap || 0))
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = pattern.type
      oscillator.frequency.value = pattern.frequency
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(tone === 'error' ? 0.08 : 0.15, at + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + pattern.duration)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(at)
      oscillator.stop(at + pattern.duration + 0.02)
    }
  } catch {
    // Sound is a nicety; scanning works without it.
  }
}
