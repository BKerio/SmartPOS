import AppLoader from './AppLoader';

interface PageLoaderProps {
  /** Minimum height of the loading area, so the layout doesn't jump when data lands. */
  height?: number;
  /** Announced to screen readers only - nothing is shown beside the loader. */
  label?: string;
}

/** Centred AppLoader for a page or panel that's still fetching its data. */
function PageLoader({ height = 240, label = 'Loading' }: PageLoaderProps) {
  return (
    <div className="page-loader" style={{ minHeight: height }}>
      <AppLoader size={56} label={label} />
    </div>
  );
}

export default PageLoader;
