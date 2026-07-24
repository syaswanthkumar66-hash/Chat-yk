import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
    
    // Check if it is a Google Translate / DOM manipulation error
    const isDOMError = error.message.includes('NotFoundError') || 
                       error.message.includes('Failed to execute \'removeChild\'') || 
                       error.message.includes('Failed to execute \'insertBefore\'') ||
                       error.message.includes('The node to be removed is not a child of this node');
                       
    if (isDOMError) {
      console.warn("Detected potential Google Translate / DOM corruption error. Attempting auto-recovery in 500ms...");
      setTimeout(() => {
        this.setState({ hasError: false, error: null });
      }, 500);
    }
  }

  public override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      return (
        <div className="p-6 bg-[#FFF1E7] border border-primary/20 rounded-2xl max-w-md mx-auto my-12 text-center space-y-4 shadow-xl">
          <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mx-auto">
            <span className="material-symbols-outlined text-2xl">sync_trouble</span>
          </div>
          <h2 className="text-lg font-black text-slate-800 uppercase italic tracking-tight">Sync Recovery Protocol</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            The page translation modified the layout, pausing live sync. We are auto-recovering now.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-primary text-white font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-primary/90 transition-all shadow-md cursor-pointer"
          >
            Reconnect Sync
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
