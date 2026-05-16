import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Display ErrorBoundary:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100dvh",
            padding: "24px",
            background: "#060912",
            color: "#f0f4f8",
            fontFamily: "system-ui, sans-serif",
            textAlign: "center",
            gap: "16px",
          }}
        >
          <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Etwas ist schiefgelaufen</h1>
          <p style={{ margin: 0, opacity: 0.6, fontSize: "0.9rem" }}>Ein unerwarteter Fehler ist aufgetreten.</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "14px 32px",
              borderRadius: "10px",
              border: "none",
              background: "linear-gradient(135deg, #f6c76a, #ffdf9a)",
              color: "#170f02",
              fontWeight: 900,
              fontSize: "1rem",
              cursor: "pointer",
            }}
            type="button"
          >
            Seite neu laden
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
