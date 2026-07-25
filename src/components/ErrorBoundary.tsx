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
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
    
    // Auto recover DOM/translation errors immediately without disrupting user
    if (this.state.isDOMError) {
      console.warn("Detected browser translation / DOM node reconciliation error. Auto-recovering immediately...");
      requestAnimationFrame(() => {
        this.setState({ hasError: false, error: null, isDOMError: false });
      });
    }
  }

  public override render() {
    if (this.state.hasError) {
      // If it's a transient DOM / translation error, render children directly or a transparent retry shell
      if (this.state.isDOMError) {
        return <div key={Date.now()}>{this.props.children}</div>;
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
            Layout sync was momentarily paused due to DOM translation. Re-establishing live view...
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

