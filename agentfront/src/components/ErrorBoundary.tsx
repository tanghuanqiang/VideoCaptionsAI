import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          padding: "2rem",
          background: "#0a1628",
          color: "#f5f0e8",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}>
          <h1 style={{ color: "#ff6b35", marginBottom: "0.5rem" }}>Something went wrong</h1>
          <p style={{ color: "#8899aa", marginBottom: "1rem", maxWidth: "400px" }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              padding: "10px 24px",
              background: "#3a7bd5",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
