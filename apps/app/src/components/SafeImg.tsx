import React from 'react';

// Thin <img> wrapper that hides the element on a load error instead of showing
// the browser's broken-image glyph. Complements (does not replace) the existing
// empty-src guards around avatar layers and cover placeholders. Used for local
// static assets (avatar PNGs, logos) so a failed/case-mismatched fetch degrades
// gracefully — especially important on the case-sensitive iOS WKWebView bundle.
type Props = React.ImgHTMLAttributes<HTMLImageElement>;

export const SafeImg = (props: Props) => (
  <img
    {...props}
    onError={(e) => {
      (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
      props.onError?.(e);
    }}
  />
);

export default SafeImg;
