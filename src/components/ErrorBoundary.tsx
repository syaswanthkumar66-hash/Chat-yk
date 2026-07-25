import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isDOMError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
    isDOMError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    const isDOMError = Boolean(
      error?.message?.includes('NotFoundError') || 
      error?.message?.includes('Failed to execute \'removeChild\'') || 
      error?.message?.includes('Failed to execute \'insertBefore\'') ||
      error?.message?.includes('The node to be removed is not a child of this node') ||
      error?.message?.includes('Node.removeChild') ||
      error?.name === 'NotFoundError'
    );
    return { hasError: true, error, isDOMError };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn("Caught error in ErrorBoundary:", error, errorInfo);
  }

  public override render() {
    if (this.state.hasError) {
      if (this.state.isDOMError) {
        return <React.Fragment>{this.props.children}</React.Fragment>;
      }

      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      return (
        <div className="p-6 bg-white border border-primary/20 rounded-3xl max-w-md mx-auto my-12 text-center space-y-4 shadow-2xl animate-fadeIn">
          <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mx-auto">
            <span className="material-symbols-outlined text-2xl">sync_trouble</span>
          </div>
          <h2 className="text-lg font-black text-slate-800 uppercase italic tracking-tight">Sync Recovery Protocol</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Connection view was temporarily paused. Click below to reconnect your session.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null, isDOMError: false })}
            className="px-5 py-2.5 bg-primary text-white font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-primary/90 transition-all shadow-md cursor-pointer"
          >
            Reconnect Sync
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

