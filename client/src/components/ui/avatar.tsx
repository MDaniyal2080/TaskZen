/* eslint-disable @next/next/no-img-element */
import * as React from "react"
import { cn, normalizeAvatarUrl } from "@/lib/utils"

const Avatar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)}
      {...props}
    />
  )
)
Avatar.displayName = "Avatar"

const AvatarImage = React.forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>(
  ({ className, alt, src, onError, ...rest }, ref) => {
    const [errored, setErrored] = React.useState(false)
    const normalized = normalizeAvatarUrl(typeof src === 'string' ? src : undefined)
    React.useEffect(() => {
      // reset error when the image source changes
      setErrored(false)
    }, [normalized])
    if (errored || !normalized) {
      return null
    }
    return (
      <img
        ref={ref}
        className={cn("aspect-square h-full w-full", className)}
        alt={alt ?? ""}
        src={normalized}
        onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
          setErrored(true)
          onError?.(e)
        }}
        {...rest}
      />
    )
  }
)
AvatarImage.displayName = "AvatarImage"

const AvatarFallback = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex h-full w-full items-center justify-center rounded-full bg-muted", className)}
      {...props}
    />
  )
)
AvatarFallback.displayName = "AvatarFallback"

export { Avatar, AvatarImage, AvatarFallback }

