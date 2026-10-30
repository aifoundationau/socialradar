/** The soft indigo/cyan aura behind page tops. Clipped so it never causes sideways scrolling on phones. */
export function AmbientGlow() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] overflow-hidden">
      <div className="absolute -top-32 left-1/4 h-[340px] w-[620px] max-w-[160vw] rounded-full bg-primary-container/10 blur-[140px]" />
      <div className="absolute top-10 right-[8%] h-[280px] w-[480px] max-w-[120vw] rounded-full bg-secondary-container/10 blur-[130px]" />
    </div>
  );
}
