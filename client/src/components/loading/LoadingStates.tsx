'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

// Skeleton loader for cards
export function CardSkeleton() {
  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm animate-pulse">
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full mb-3"></div>
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
      <div className="flex gap-2 mt-4">
        <div className="h-6 w-16 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
        <div className="h-6 w-16 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
      </div>
    </div>
  );
}

// Skeleton loader for lists
export function ListSkeleton() {
  return (
    <div className="w-80 flex-shrink-0">
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-4"></div>
        <div className="space-y-2">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    </div>
  );
}

// Skeleton loader for boards
export function BoardSkeleton() {
  return (
    <div className="flex gap-4 p-4 overflow-x-auto">
      <ListSkeleton />
      <ListSkeleton />
      <ListSkeleton />
    </div>
  );
}

// Full page spinner
export function PageSpinner({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400">{message}</p>
      </div>
    </div>
  );
}

// Inline spinner
export function InlineSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  return (
    <Loader2 className={`${sizeClasses[size]} animate-spin text-gray-500`} />
  );
}

// Button with loading state
export function LoadingButton({
  loading,
  disabled,
  children,
  className = '',
  onClick,
  ...props
}: {
  loading: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      disabled={loading || disabled}
      onClick={onClick}
      className={`
        relative flex items-center justify-center gap-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
      {...props}
    >
      {loading && <InlineSpinner size="sm" />}
      <span className={loading ? 'opacity-70' : ''}>{children}</span>
    </button>
  );
}

// Optimistic update wrapper
export function OptimisticUpdate({
  isPending,
  children,
}: {
  isPending: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`transition-opacity ${isPending ? 'opacity-50' : ''}`}>
      {children}
    </div>
  );
}

// Lazy load wrapper with intersection observer
export function LazyLoad({
  children,
  fallback = <CardSkeleton />,
  rootMargin = '100px',
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  rootMargin?: string;
}) {
  const [isVisible, setIsVisible] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [rootMargin]);

  return <div ref={ref}>{isVisible ? children : fallback}</div>;
}
