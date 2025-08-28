export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold mb-3">Page not found</h1>
      <p className="text-muted-foreground mb-8">
        We couldn't find the page you're looking for.
      </p>
      <div className="flex items-center justify-center gap-3">
        <a
          href="/"
          className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Go to Home
        </a>
      </div>
    </div>
  )
}
