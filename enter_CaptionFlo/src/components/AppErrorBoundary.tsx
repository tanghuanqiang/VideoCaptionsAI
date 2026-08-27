import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("CaptionFlo render failure", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="flex h-screen items-center justify-center bg-background p-6">
        <section className="w-full max-w-md rounded-xl border border-destructive/25 bg-card p-6 text-center shadow-soft">
          <h1 className="text-lg font-semibold">编辑器遇到异常</h1>
          <p className="mt-2 text-sm text-foreground/60">当前界面已停止渲染，项目恢复快照仍会保留。</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            重新加载
          </button>
        </section>
      </main>
    );
  }
}
