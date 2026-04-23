import { useMantineTheme } from '@mantine/core';

interface PageLayoutProps {
  children: React.ReactNode;
  /** Use the narrower max-width (56rem) — suitable for single-column settings pages */
  narrow?: boolean;
}

/**
 * Consistent page wrapper used by every top-level page.
 * Centers content and applies a uniform max-width.
 */
export function PageLayout({ children, narrow }: PageLayoutProps): React.ReactElement {
  const theme = useMantineTheme();
  const other = theme.other as { pageMaxWidth: string; pageMaxWidthNarrow: string };
  const maxWidth = narrow ? other.pageMaxWidthNarrow : other.pageMaxWidth;

  return (
    <div
      style={{
        maxWidth,
        margin: '0 auto',
      }}
    >
      {children}
    </div>
  );
}
