import React from 'react';

// R3F/Suspense does NOT catch loader throws (e.g. a corrupt/missing .glb in
// useGLTF), so a failed model load would otherwise propagate and blank the
// whole Canvas subtree. This minimal boundary renders nothing on error,
// keeping the rest of the scene alive. It does not handle the iOS black-texture
// case — that is a successful load handled by prepMaterial's FALLBACK_COLOR.
interface State {
  hasError: boolean;
}

export class ModelErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export default ModelErrorBoundary;
