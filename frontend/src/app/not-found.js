export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-8xl font-bold text-brand-orange mb-4">404</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Page not found</h1>
        <p className="text-gray-600 mb-8">The page you're looking for doesn't exist or has moved.</p>
        <div className="flex gap-3 justify-center">
          <a href="/" className="btn-primary px-8 py-3 inline-block">Go Home</a>
          <a href="/search" className="btn-secondary px-8 py-3 inline-block">Find Guides</a>
        </div>
      </div>
    </div>
  );
}
