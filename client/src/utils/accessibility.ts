// Accessibility utilities for TaskZen

// Keyboard navigation hook
import React, { useEffect, useCallback } from 'react';

export const KEYS = {
  ENTER: 'Enter',
  ESCAPE: 'Escape',
  SPACE: ' ',
  TAB: 'Tab',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  HOME: 'Home',
  END: 'End',
} as const;

// Hook for keyboard navigation
export function useKeyboardNavigation<T>(
  items: T[],
  selectedIndex: number,
  onSelect: (index: number) => void,
  onEnter?: (item: T) => void,
  onEscape?: () => void
) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case KEYS.ARROW_DOWN:
          e.preventDefault();
          onSelect(Math.min(selectedIndex + 1, items.length - 1));
          break;
        case KEYS.ARROW_UP:
          e.preventDefault();
          onSelect(Math.max(selectedIndex - 1, 0));
          break;
        case KEYS.HOME:
          e.preventDefault();
          onSelect(0);
          break;
        case KEYS.END:
          e.preventDefault();
          onSelect(items.length - 1);
          break;
        case KEYS.ENTER:
          if (onEnter && items[selectedIndex]) {
            e.preventDefault();
            onEnter(items[selectedIndex]);
          }
          break;
        case KEYS.ESCAPE:
          if (onEscape) {
            e.preventDefault();
            onEscape();
          }
          break;
      }
    },
    [items, selectedIndex, onSelect, onEnter, onEscape]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// Focus trap hook for modals and dialogs
export function useFocusTrap(ref: React.RefObject<HTMLElement>, isActive: boolean) {
  useEffect(() => {
    if (!isActive || !ref.current) return;

    const element = ref.current;
    const focusableElements = element.querySelectorAll(
      'a[href], button, textarea, input[type="text"], input[type="radio"], input[type="checkbox"], select, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstFocusable = focusableElements[0] as HTMLElement;
    const lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable?.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable?.focus();
        }
      }
    };

    element.addEventListener('keydown', handleTabKey);
    firstFocusable?.focus();

    return () => {
      element.removeEventListener('keydown', handleTabKey);
    };
  }, [ref, isActive]);
}

// ARIA live region announcer
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite') {
  const announcement = document.createElement('div');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.setAttribute('class', 'sr-only');
  announcement.textContent = message;
  
  document.body.appendChild(announcement);
  
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

// Skip to main content link
export function SkipToMain() {
  return React.createElement(
    'a',
    {
      href: '#main-content',
      className:
        'sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-lg',
    },
    'Skip to main content'
  );
}

// Screen reader only text
export function ScreenReaderOnly({ children }: { children: React.ReactNode }) {
  return React.createElement('span', { className: 'sr-only' }, children);
}

// Accessible form field wrapper
export function FormField({
  label,
  error,
  required,
  children,
  id,
  description,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  id: string;
  description?: string;
}) {
  const nodes: React.ReactNode[] = [
    React.createElement(
      'label',
      { htmlFor: id, className: 'block text-sm font-medium mb-1', key: 'label' },
      [
        label,
        required
          ? React.createElement(
              'span',
              { className: 'text-red-500 ml-1', 'aria-label': 'required', key: 'req' },
              '*'
            )
          : null,
      ]
    ),
    description
      ? React.createElement(
          'p',
          { id: `${id}-description`, className: 'text-sm text-gray-500 mb-1', key: 'desc' },
          description
        )
      : null,
    children,
    error
      ? React.createElement(
          'p',
          { id: `${id}-error`, className: 'text-sm text-red-600 mt-1', role: 'alert', key: 'err' },
          error
        )
      : null,
  ].filter(Boolean) as React.ReactNode[];

  return React.createElement('div', { className: 'mb-4' }, nodes);
}

// Accessible icon button
export function IconButton({
  icon: Icon,
  label,
  className = '',
  ...props
}: IconButtonProps) {
  return React.createElement(
    'button',
    {
      ...props,
      className: `p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`,
      'aria-label': label,
    },
    React.createElement(Icon, { className: 'h-5 w-5', 'aria-hidden': true })
  );
}

type IconButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: React.ElementType;
  label: string;
  className?: string;
};
