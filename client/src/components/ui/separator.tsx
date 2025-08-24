import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical'
}

const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, orientation = 'horizontal', ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="separator"
        aria-orientation={orientation}
        className={cn(
          orientation === 'vertical'
            ? 'h-full w-px bg-border mx-2'
            : 'w-full h-px bg-border my-4',
          className
        )}
        {...props}
      />
    )
  }
)
Separator.displayName = 'Separator'

export { Separator }
