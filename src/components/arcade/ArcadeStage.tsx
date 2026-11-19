import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from '@phosphor-icons/react'
import { ArcadeSoundToggle } from './ArcadeCabinetMenu'
import { fitStage, type ArcadeLabels } from './arcadeCabinet'
import './arcadeCabinet.css'

export interface StageSize {
  width: number
  height: number
}

/** Fordybet spilleflade: dækker hele vinduet, så kun spillet er synligt mens man spiller. */
export function ArcadeStage({
  theme,
  title,
  badge,
  labels,
  soundEnabled,
  onSoundToggle,
  onQuit,
  aspect,
  onFit,
  playing,
  children,
  screenHandlers,
}: {
  theme: string
  title: string
  badge: string
  labels: ArcadeLabels
  soundEnabled: boolean
  onSoundToggle: () => void
  onQuit: () => void
  aspect: number
  onFit: (size: StageSize) => void
  playing: boolean
  children: ReactNode
  screenHandlers?: React.HTMLAttributes<HTMLDivElement>
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<StageSize | null>(null)
  const onFitRef = useRef(onFit)
  onFitRef.current = onFit

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const measure = () => {
      const style = getComputedStyle(frame)
      const available = {
        width: frame.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        height: frame.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
      }
      const next = fitStage(available, aspect)
      setSize((current) => (current && current.width === next.width && current.height === next.height ? current : next))
      onFitRef.current(next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [aspect])

  useEffect(() => {
    const root = document.documentElement
    const previous = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = previous
    }
  }, [])

  return createPortal(
    <section className="arcade-stage" data-arcade-theme={theme} data-immersive="" aria-label={title}>
      <div className="arcade-stage__bar">
        <span className="arcade-stage__title">{title}</span>
        <span className="arcade-stage__difficulty">{badge}</span>
        <div className="arcade-stage__actions">
          <ArcadeSoundToggle enabled={soundEnabled} onToggle={onSoundToggle} labels={labels} />
          <button type="button" className="arcade-stage__quit" onClick={onQuit}>
            <X size={16} weight="bold" aria-hidden="true" />
            {labels.quit}
          </button>
        </div>
      </div>
      <div ref={frameRef} className="arcade-stage__frame">
        <div
          className="arcade-stage__screen"
          data-playing={playing ? '' : undefined}
          style={size ? { width: size.width, height: size.height } : undefined}
          {...screenHandlers}
        >
          {children}
        </div>
      </div>
    </section>,
    document.body,
  )
}
