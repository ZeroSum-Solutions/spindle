import type { CSSProperties } from "react";
import { paintPair, type CoverView } from "./view";

// Spindle-drawn 16:9 covers. Geometry only, from an enum; the colours are the course's two
// validated literals (or a pair per theme for Spindle and accent covers), passed as literal hex
// variables that the .course-cover rule in globals.css resolves per theme. The foreground is drawn at
// 18% (spec rev4 §2). Decorative: hidden from assistive technology and free of text.

const W = 320;
const H = 180;

export function CourseCover({ cover }: { cover: CoverView }) {
  const [bg, fg] = [paintPair(cover.background), paintPair(cover.foreground)];
  const vars = { "--cover-bg-light": bg.light, "--cover-bg-dark": bg.dark, "--cover-fg-light": fg.light, "--cover-fg-dark": fg.dark } as CSSProperties;
  const line = { stroke: "currentColor", strokeOpacity: 0.18, strokeWidth: 1.5, fill: "none", vectorEffect: "non-scaling-stroke" } as const;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
      data-pattern={cover.pattern}
      className="course-cover block aspect-video h-auto w-full"
      style={vars}
    >
      <rect width={W} height={H} className="course-cover-bg" />
      {cover.pattern === "solid" ? (
        // One quiet slanted rule, the Cut 03 angle, so a solid cover still reads as designed.
        <path d={`M ${W - 72} ${H} L ${W - 72 + 0.2126 * H} 0`} {...line} />
      ) : null}
      {cover.pattern === "diagonal" ? Array.from({ length: 22 }, (_, i) => <path key={i} d={`M ${i * 22 - H} ${H} L ${i * 22} 0`} {...line} />) : null}
      {cover.pattern === "grid" ? (
        <>
          {Array.from({ length: 14 }, (_, i) => <path key={`v${i}`} d={`M ${12 + i * 24} 0 V ${H}`} {...line} />)}
          {Array.from({ length: 8 }, (_, i) => <path key={`h${i}`} d={`M 0 ${6 + i * 24} H ${W}`} {...line} />)}
        </>
      ) : null}
      {cover.pattern === "dots"
        ? Array.from({ length: 16 * 9 }, (_, i) => <circle key={i} cx={10 + (i % 16) * 20} cy={10 + Math.floor(i / 16) * 20} r={2} fill="currentColor" fillOpacity={0.18} />)
        : null}
      {cover.pattern === "rings" ? Array.from({ length: 9 }, (_, i) => <circle key={i} cx={W - 64} cy={H - 36} r={18 + i * 26} {...line} />) : null}
      {cover.pattern === "waves"
        ? Array.from({ length: 9 }, (_, i) => {
            const y = 14 + i * 20;
            return <path key={i} d={`M -10 ${y} C 60 ${y - 16}, 100 ${y + 16}, 160 ${y} S 260 ${y - 16}, 330 ${y}`} {...line} />;
          })
        : null}
    </svg>
  );
}
