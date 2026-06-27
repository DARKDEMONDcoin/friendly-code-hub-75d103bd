// AspectIcon — small wireframe icons for aspect ratios (Artlist-style)

interface Props {
  aspect: string;
  active?: boolean;
  size?: number;
}

const ASPECTS: Record<string, [number, number]> = {
  "1:1": [16, 16],
  "16:9": [22, 12],
  "9:16": [12, 22],
  "2:3": [13, 20],
  "3:2": [20, 13],
  "4:3": [20, 15],
  "3:4": [15, 20],
  "21:9": [22, 10],
  "4:5": [16, 20],
  "5:4": [20, 16],
};

export function AspectIcon({ aspect, active, size = 26 }: Props) {
  const [w, h] = ASPECTS[aspect] ?? [16, 16];
  const stroke = active ? "currentColor" : "currentColor";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      className={active ? "text-foreground" : "text-foreground/55"}
    >
      <rect
        x={(28 - w) / 2}
        y={(28 - h) / 2}
        width={w}
        height={h}
        rx="2"
        stroke={stroke}
        strokeWidth="1.6"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.15 : 0}
      />
    </svg>
  );
}
