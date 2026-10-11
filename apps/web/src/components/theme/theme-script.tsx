import { THEME_SCRIPT } from "./theme";

/** Sets the stored or requested theme on <html> before first paint. Render it first in <head>. */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
