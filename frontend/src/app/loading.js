export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin w-10 h-10 border-4 border-brand-orange border-t-transparent rounded-full" />
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    </div>
  );
}
