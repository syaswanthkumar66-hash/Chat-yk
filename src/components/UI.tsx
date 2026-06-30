import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const Icon = ({ name, className, fill = false }: { name: string, className?: string, fill?: boolean }) => (
  <span className={cn(
    "material-symbols-outlined",
    fill && "material-symbols-fill",
    className
  )}>
    {name}
  </span>
);

export const Button = ({ 
  children, 
  className, 
  variant = 'primary',
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'outline' }) => {
  const variants = {
    primary: 'bg-primary text-white shadow-xl shadow-primary/20 hover:brightness-105 active:scale-95',
    secondary: 'bg-[#FFE4D1] text-primary hover:bg-[#FFD8C1] active:scale-95',
    ghost: 'hover:bg-primary/10 text-slate-600 active:scale-95',
    outline: 'border-2 border-primary text-primary hover:bg-primary/5 active:scale-95',
  };

  return (
    <button 
      className={cn(
        'flex items-center justify-center gap-2 rounded-2xl font-black uppercase tracking-widest italic text-sm transition-all disabled:opacity-50 disabled:pointer-events-none px-6 py-3',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

export const Card = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div 
    className={cn('bg-white rounded-[2rem] p-5 shadow-xl shadow-slate-200/50 border border-white/50', className)}
    {...props}
  >
    {children}
  </div>
);

export const GlassCard = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div 
    className={cn('bg-white/80 backdrop-blur-xl rounded-[2.5rem] p-8 border border-white/40 shadow-2xl shadow-slate-200/40', className)}
    {...props}
  >
    {children}
  </div>
);

export const Avatar = ({ 
  src, 
  className, 
  status, 
  onClick 
}: { 
  src: string; 
  className?: string; 
  status?: 'online' | 'offline' | 'away'; 
  onClick?: () => void; 
}) => {
  const [isLoaded, setIsLoaded] = React.useState(false);

  React.useEffect(() => {
    setIsLoaded(false);
  }, [src]);

  return (
    <div className={cn('relative shrink-0 transition-transform active:scale-95', className)} onClick={onClick}>
      <div className="size-full rounded-[35%] overflow-hidden bg-primary/10 border-2 border-white dark:border-slate-800 shadow-sm">
        {src ? (
          <img 
            src={src} 
            alt="avatar" 
            onLoad={() => setIsLoaded(true)}
            className={cn(
              "size-full object-cover transition-opacity duration-300",
              isLoaded ? "opacity-100" : "opacity-0"
            )} 
            referrerPolicy="no-referrer" 
          />
        ) : (
          <div className="size-full bg-primary/10 flex items-center justify-center text-primary font-bold">
            <Icon name="person" className="text-lg opacity-60" />
          </div>
        )}
      </div>
      {status && (
        <div className={cn(
          "absolute -bottom-1 -right-1 size-4 rounded-full border-2 border-white dark:border-slate-800 shadow-sm",
          status === 'online' ? 'bg-green-500' : status === 'away' ? 'bg-yellow-500' : 'bg-slate-400'
        )} />
      )}
    </div>
  );
};
