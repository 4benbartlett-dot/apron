/* eslint-disable @next/next/no-img-element */
export function TeamLogo({ id, size = 28 }: { id: string; size?: number }) {
  return (
    <img
      src={`/logos/${id}.png`}
      alt={id}
      width={size}
      height={size}
      loading="lazy"
      style={{ objectFit: "contain", flexShrink: 0 }}
    />
  );
}
