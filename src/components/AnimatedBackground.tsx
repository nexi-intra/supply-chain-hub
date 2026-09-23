// Baggrunden er papir, ikke pynt.
//
// Her lå tidligere seks svævende figurer og tre pulserende glød-orber, der kørte
// i al den tid appen var åben. De sagde ingenting om indholdet, og bevægelse i
// udkanten af synsfeltet trækker blikket væk fra det, der faktisk betyder noget
// på et vagtbord. Tilbage er én meget svag tone i mærkefarven langs toppen, så
// fladen ikke er helt død — og den står stille.
export function AnimatedBackground() {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-0"
      aria-hidden="true"
      style={{
        background:
          'linear-gradient(180deg, color-mix(in oklab, var(--primary) 4%, transparent) 0%, transparent 34rem)',
      }}
    />
  )
}
