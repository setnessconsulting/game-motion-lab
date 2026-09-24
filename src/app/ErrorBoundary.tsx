import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback: (message: string) => ReactNode;
}

interface ErrorBoundaryState {
  readonly message: string | null;
}

/**
 * Isolate a failing surface.
 *
 * Used around the renderer region so a presentation failure can never take down the
 * semantic investigation, which is the Epic's graceful-degradation requirement.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Intentionally not reported anywhere: no learner-runtime telemetry (docs/PRIVACY.md).
    if (import.meta.env.DEV) {
      console.error("Motion Lab surface failure", error, info.componentStack);
    }
  }

  override render(): ReactNode {
    if (this.state.message !== null) return this.props.fallback(this.state.message);
    return this.props.children;
  }
}
