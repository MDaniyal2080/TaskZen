"use client";

import React from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { usePathname, useSearchParams } from "next/navigation";

// A lightweight top progress bar that appears during route changes and
// any in-flight React Query requests or mutations.
// No external deps (like nprogress). Pure CSS + timers.
export default function TopLoader() {
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Track navigation start before the path updates (best-effort) by capturing link clicks.
  const [routeLoading, setRouteLoading] = React.useState(false);
  const routeLoadingTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    const onClickCapture = (e: MouseEvent) => {
      // Only consider left-click without modifiers
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      let el = e.target as HTMLElement | null;
      while (el && el.tagName !== "A") el = el.parentElement;
      if (!el) return;
      const a = el as HTMLAnchorElement;
      // Same-origin client-side nav only
      if (!a.href) return;
      try {
        const url = new URL(a.href);
        const sameOrigin = url.origin === window.location.origin;
        const isHashOnly = sameOrigin && url.pathname === window.location.pathname && url.search === window.location.search && url.hash !== window.location.hash;
        if (sameOrigin && !isHashOnly && a.target !== "_blank") {
          // Start route loading optimistically
          startRouteLoading();
        }
      } catch {}
    };

    window.addEventListener("click", onClickCapture, true);
    return () => window.removeEventListener("click", onClickCapture, true);
  }, []);

  // Also start loader for programmatic navigations (router.push/replace) and back/forward
  React.useEffect(() => {
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    const shouldStartForUrl = (rawUrl: string | URL | null | undefined) => {
      if (!rawUrl) return true;
      try {
        const url = new URL(rawUrl as string | URL, window.location.href);
        const sameOrigin = url.origin === window.location.origin;
        const samePath = url.pathname === window.location.pathname;
        const sameSearch = url.search === window.location.search;
        const sameHash = url.hash === window.location.hash;
        // Skip if absolutely nothing changes
        if (sameOrigin && samePath && sameSearch && sameHash) return false;
        // Skip if only the hash changes
        if (sameOrigin && samePath && sameSearch && !sameHash) return false;
        return true;
      } catch {
        return true;
      }
    };

    const wrap = (fn: typeof window.history.pushState) =>
      function(this: History, data: unknown, unused: string, url?: string | URL | null) {
        // Defer state updates to avoid scheduling updates during useInsertionEffect
        try {
          if (shouldStartForUrl(url)) {
            window.setTimeout(() => startRouteLoading(), 0);
          }
        } catch {}
        return fn.apply(this, [data, unused, url as string | URL | null | undefined]);
      } as typeof window.history.pushState;

    // Patch history methods
    (window.history as unknown as { pushState: typeof window.history.pushState }).pushState = wrap(originalPushState);
    (window.history as unknown as { replaceState: typeof window.history.replaceState }).replaceState = wrap(originalReplaceState);

    const onPopState = () => {
      startRouteLoading();
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  // When the URL actually changes, stop the optimistic route loader after a short delay
  React.useEffect(() => {
    if (!routeLoading) return;
    // Give the new route a short time to mount and queries to kick in
    const t = window.setTimeout(() => stopRouteLoading(), 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  const startRouteLoading = () => {
    if (routeLoadingTimer.current) {
      window.clearTimeout(routeLoadingTimer.current);
      routeLoadingTimer.current = null;
    }
    setRouteLoading(true);
  };

  const stopRouteLoading = () => {
    if (routeLoadingTimer.current) {
      window.clearTimeout(routeLoadingTimer.current);
      routeLoadingTimer.current = null;
    }
    // Ensure the bar stays at least a minimum visible time to avoid flicker
    routeLoadingTimer.current = window.setTimeout(() => {
      setRouteLoading(false);
    }, 200) as unknown as number;
  };

  const active = routeLoading || isFetching > 0 || isMutating > 0;

  // Progress simulation: ramp to 90% while active; complete to 100% then hide
  const [progress, setProgress] = React.useState(0);
  const rafRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (active) {
      // Start or continue progressing toward 90%
      const step = () => {
        setProgress((p) => {
          if (p < 90) {
            // Slow down as it grows
            const delta = Math.max(0.5, 4 - p / 30);
            return Math.min(90, p + delta);
          }
          return p;
        });
        rafRef.current = window.requestAnimationFrame(step);
      };
      if (rafRef.current == null) rafRef.current = window.requestAnimationFrame(step);
      return () => {
        if (rafRef.current != null) {
          window.cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      };
    } else {
      // Finish to 100, then reset to 0 after a brief delay
      setProgress(100);
      const t = window.setTimeout(() => setProgress(0), 250);
      return () => window.clearTimeout(t);
    }
  }, [active]);

  // Hidden when progress is 0
  const visible = progress > 0;

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none"
      style={{ height: visible ? 2 : 0 }}
    >
      <div
        className="h-0.5 bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-violet-500 shadow-[0_1px_8px_rgba(99,102,241,0.35)] transition-[width,opacity] duration-150"
        style={{ width: `${progress}%`, opacity: visible ? 1 : 0 }}
      />
      {/* Optional glow at the leading edge */}
      {visible && (
        <div
          className="absolute top-[2px] h-[2px] w-2 rounded-full bg-violet-500 blur-sm"
          style={{ left: `calc(${progress}% - 4px)` }}
        />
      )}
    </div>
  );
}
