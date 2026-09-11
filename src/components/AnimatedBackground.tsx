// Letvægts animeret baggrund. Bevidst UDEN framer-motion og CSS-blur:
// JS-drevne animationer + blur på animerede lag tvang fuld re-rasterisering
// 60 gange/sek. og åd 40-60 % CPU på maskiner uden GPU-acceleration.
// Ren CSS (kun transform/opacity) composites billigt — også i software-rendering.

interface FloatingShape {
  left: string
  top: string
  size: number
  duration: number
  delay: number
  opacity: number
  shape: 'circle' | 'square' | 'triangle'
}

// Faste værdier i stedet for Math.random: ingen re-render, samme udtryk hver gang.
const SHAPES: FloatingShape[] = [
  { left: '8%', top: '70%', size: 96, duration: 26, delay: 0, opacity: 0.04, shape: 'circle' },
  { left: '22%', top: '25%', size: 64, duration: 32, delay: -8, opacity: 0.03, shape: 'square' },
  { left: '45%', top: '80%', size: 80, duration: 28, delay: -15, opacity: 0.05, shape: 'triangle' },
  { left: '68%', top: '15%', size: 72, duration: 34, delay: -4, opacity: 0.03, shape: 'circle' },
  { left: '82%', top: '60%', size: 104, duration: 30, delay: -20, opacity: 0.04, shape: 'square' },
  { left: '55%', top: '40%', size: 56, duration: 36, delay: -12, opacity: 0.03, shape: 'triangle' },
]

const SHAPE_CLASSES = {
  circle: 'w-full h-full rounded-full bg-primary',
  square: 'w-full h-full rounded-lg bg-accent',
  triangle: 'w-full h-full bg-secondary',
} as const

export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
      {/* Statisk grundtone (var tidligere et pulserende fuldskærms-lag) */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-accent/8" />

      {SHAPES.map((shape, index) => (
        <div
          key={index}
          className="bg-floating-shape absolute"
          style={{
            left: shape.left,
            top: shape.top,
            width: shape.size,
            height: shape.size,
            animationDuration: `${shape.duration}s`,
            animationDelay: `${shape.delay}s`,
          }}
        >
          <div
            className={SHAPE_CLASSES[shape.shape]}
            style={{
              opacity: shape.opacity,
              ...(shape.shape === 'triangle' ? { clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' } : {}),
            }}
          />
        </div>
      ))}

      {/* Glød-orber: radial-gradient i stedet for blur — samme look, ingen filterkost */}
      <div
        className="bg-glow-orb absolute top-1/4 left-1/4 w-96 h-96"
        style={{
          background: 'radial-gradient(circle closest-side, color-mix(in oklab, var(--primary) 10%, transparent), transparent 72%)',
          animationDuration: '10s',
        }}
      />
      <div
        className="bg-glow-orb absolute bottom-1/4 right-1/4 w-96 h-96"
        style={{
          background: 'radial-gradient(circle closest-side, color-mix(in oklab, var(--accent) 10%, transparent), transparent 72%)',
          animationDuration: '12s',
          animationDelay: '-6s',
        }}
      />
      <div
        className="bg-glow-orb absolute top-1/2 left-1/2 w-[28rem] h-[28rem] -translate-x-1/2 -translate-y-1/2"
        style={{
          background: 'radial-gradient(circle closest-side, color-mix(in oklab, var(--primary) 5%, transparent), transparent 72%)',
          animationDuration: '14s',
          animationDelay: '-3s',
        }}
      />
    </div>
  )
}
