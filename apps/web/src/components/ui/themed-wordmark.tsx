import type { Brand } from "../../lib/brand";

/**
 * A brand's wordmark in the theme in effect: both files are in the page and CSS shows one
 * (.theme-light-only / .theme-dark-only), so it is right before hydration and never flashes.
 * `surface="ink"` is for ink panels, which invert with the theme (dark in light, light in dark).
 */
export function ThemedWordmark({ brand, surface = "page", className = "" }: { brand: Brand; surface?: "page" | "ink"; className?: string }) {
  const { onLight, onDark, width, height } = brand.wordmark;
  const [inLight, inDark] = surface === "page" ? [onLight, onDark] : [onDark, onLight];
  const style = { width, height: "auto", aspectRatio: `${width} / ${height}` };
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG gains nothing from the optimizer */}
      <img src={inLight} alt="" width={width} height={height} style={style} className={`theme-light-only max-w-none ${className}`} />
      {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG gains nothing from the optimizer */}
      <img src={inDark} alt="" width={width} height={height} style={style} className={`theme-dark-only max-w-none ${className}`} />
    </>
  );
}
