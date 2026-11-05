export interface SynthTools {
  tone: (type: OscillatorType, from: number, to: number, duration: number, volume: number, delay?: number) => void
  noise: (duration: number, volume: number, filter: BiquadFilterType, frequency: number, delay?: number) => void
  arpeggio: (notes: number[], step: number, volume: number, type?: OscillatorType) => void
}

export interface Synth<Name extends string> {
  setEnabled: (enabled: boolean) => void
  play: (name: Name) => void
  dispose: () => void
}

function defaultCreateContext(): AudioContext | null {
  try {
    const Ctor = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    return Ctor ? new Ctor() : null
  } catch {
    return null
  }
}

/** Fælles WebAudio-syntese for arkadespillene; lydsystemet oprettes først når lyd er slået til. */
export function createSynth<Name extends string>(options: {
  enabled: boolean
  createContext?: () => AudioContext | null
  minGaps?: Partial<Record<Name, number>>
  sounds: Record<Name, (tools: SynthTools) => void>
  volume?: number
}): Synth<Name> {
  const createContext = options.createContext ?? defaultCreateContext
  let enabled = options.enabled
  let ctx: AudioContext | null | undefined
  let master: GainNode | null = null
  let noiseBuffer: AudioBuffer | null = null
  const lastPlayed = new Map<Name, number>()

  const context = (): AudioContext | null => {
    if (!enabled) return null
    if (ctx === undefined) {
      ctx = createContext()
      if (ctx) {
        master = ctx.createGain()
        master.gain.value = options.volume ?? 0.25
        master.connect(ctx.destination)
      }
    }
    if (ctx?.state === 'suspended') void ctx.resume()
    return ctx
  }

  const toolsFor = (ac: AudioContext, output: GainNode): SynthTools => {
    const tone: SynthTools['tone'] = (type, from, to, duration, volume, delay = 0) => {
      const start = ac.currentTime + delay
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(from, start)
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration)
      gain.gain.setValueAtTime(volume, start)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      osc.connect(gain).connect(output)
      osc.start(start)
      osc.stop(start + duration + 0.02)
    }
    const noise: SynthTools['noise'] = (duration, volume, filter, frequency, delay = 0) => {
      if (!noiseBuffer) {
        noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate)
        const data = noiseBuffer.getChannelData(0)
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      }
      const start = ac.currentTime + delay
      const source = ac.createBufferSource()
      const biquad = ac.createBiquadFilter()
      const gain = ac.createGain()
      source.buffer = noiseBuffer
      source.loop = true
      biquad.type = filter
      biquad.frequency.value = frequency
      gain.gain.setValueAtTime(volume, start)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      source.connect(biquad).connect(gain).connect(output)
      source.start(start)
      source.stop(start + duration + 0.02)
    }
    const arpeggio: SynthTools['arpeggio'] = (notes, step, volume, type = 'triangle') => {
      notes.forEach((note, i) => tone(type, note, note, step * 1.6, volume, i * step))
    }
    return { tone, noise, arpeggio }
  }

  return {
    setEnabled: (value) => {
      enabled = value
    },
    play: (name) => {
      const ac = context()
      if (!ac || !master) return
      const gap = options.minGaps?.[name]
      if (gap !== undefined && ac.currentTime - (lastPlayed.get(name) ?? -Infinity) < gap) return
      lastPlayed.set(name, ac.currentTime)
      options.sounds[name](toolsFor(ac, master))
    },
    dispose: () => {
      if (ctx) void ctx.close().catch(() => undefined)
      ctx = undefined
      master = null
      noiseBuffer = null
    },
  }
}
