import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  err: Error | null;
  info: ErrorInfo | null;
}

// Catches synchronous render errors so the user sees a stack trace instead of a blank
// cream window. Async failures (rejected promises from store loads, capture path) are
// surfaced separately via the `error` field on each store.
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { err: null, info: null };

  static getDerivedStateFromError(err: Error): State {
    return { err, info: null };
  }

  componentDidCatch(err: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] render crash', err, info);
    this.setState({ err, info });
  }

  render(): ReactNode {
    if (!this.state.err) return this.props.children;
    return (
      <div
        style={{
          minHeight: '100vh',
          padding: '24px',
          background: '#faf7f0',
          color: '#1c1a16',
          fontFamily: 'ui-monospace, monospace',
          fontSize: '13px',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
        }}
      >
        <div style={{ fontSize: '20px', marginBottom: '12px', color: '#b3402f' }}>
          Spool 渲染崩了
        </div>
        <div style={{ marginBottom: '12px', color: '#4a463d' }}>
          {this.state.err.message}
        </div>
        <pre
          style={{
            background: '#f3eee2',
            border: '1px solid #d6cdb3',
            borderRadius: '6px',
            padding: '12px',
            maxHeight: '40vh',
            overflow: 'auto',
            fontSize: '11px',
          }}
        >
          {this.state.err.stack}
        </pre>
        {this.state.info?.componentStack && (
          <pre
            style={{
              background: '#f3eee2',
              border: '1px solid #d6cdb3',
              borderRadius: '6px',
              padding: '12px',
              maxHeight: '30vh',
              overflow: 'auto',
              marginTop: '8px',
              fontSize: '11px',
            }}
          >
            {this.state.info.componentStack}
          </pre>
        )}
      </div>
    );
  }
}
