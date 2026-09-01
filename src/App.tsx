import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { CategoryPage, HomePage, WatchPage } from "./KidApp";
import ParentApp from "./ParentApp";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: "40px 20px",
          textAlign: "center",
          maxWidth: "500px",
          margin: "80px auto",
          background: "#fff",
          borderRadius: "20px",
          boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}>
          <h2 style={{ fontSize: "24px", color: "#2f543e", marginBottom: "12px" }}>畫面載入時發生小問題</h2>
          <p style={{ color: "#666", fontSize: "15px", marginBottom: "24px" }}>
            {this.state.error?.message || "請嘗試重新整理頁面。"}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              background: "#4a775b",
              color: "#fff",
              border: "none",
              padding: "10px 24px",
              borderRadius: "12px",
              fontSize: "16px",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            重新載入
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/category/:categoryId" element={<CategoryPage />} />
        <Route path="/watch/:videoId" element={<WatchPage />} />
        <Route path="/parent/*" element={<ParentApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
