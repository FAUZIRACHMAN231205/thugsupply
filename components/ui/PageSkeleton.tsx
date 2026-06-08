export default function PageSkeleton() {
  return (
    <div className="page-skeleton" aria-busy="true" aria-label="Memuat halaman">
      <div className="page-skeleton-header">
        <div className="skeleton-bar skeleton-bar-title" />
        <div className="skeleton-bar skeleton-bar-sub" />
      </div>
      <div className="page-skeleton-card">
        <div className="skeleton-bar skeleton-bar-action" />
        <div className="skeleton-table">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton-row">
              <div className="skeleton-bar" />
              <div className="skeleton-bar skeleton-bar-short" />
              <div className="skeleton-bar skeleton-bar-medium" />
              <div className="skeleton-bar skeleton-bar-tiny" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
