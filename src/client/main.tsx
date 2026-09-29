import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="app-shell">
      <section className="card warning-card" role="alert">
        <h1>页面出错</h1>
        <p>本机草稿仍在浏览器存储里。可以导出后再刷新。这次错误没有发送到服务器。</p>
      </section>
    </main>;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("缺少页面根节点");
createRoot(root).render(<ErrorBoundary><App /></ErrorBoundary>);
