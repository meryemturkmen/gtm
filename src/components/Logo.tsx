/** Favicon when the logo column has one, otherwise a monogram in the same slot. */
export function Logo({ src, domain, size = 'size-5 text-[10px]' }: { src?: string; domain: string; size?: string }) {
  return src
    ? <img src={src} alt="" className={`${size} rounded-[5px] shrink-0 bg-surface`} loading="lazy" />
    : <span aria-hidden className={`${size} rounded-[5px] shrink-0 bg-fill text-label-2 grid place-items-center font-semibold uppercase`}>{domain.charAt(0)}</span>
}
