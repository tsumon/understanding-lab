import { Component, type ReactNode } from "react";
import { useLocale } from "./LocaleProvider";
import type { Messages } from "./i18n";

class Boundary extends Component<{ children: ReactNode; copy: Messages }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="app-shell">
      <section className="card warning-card" role="alert">
        <h1>{this.props.copy.pageError}</h1>
        <p>{this.props.copy.pageErrorBody}</p>
      </section>
    </main>;
  }
}

export function ErrorBoundary({ children }: { children: ReactNode }) {
  const { copy } = useLocale();
  return <Boundary copy={copy}>{children}</Boundary>;
}
