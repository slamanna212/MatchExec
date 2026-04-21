import { Group, ThemeIcon, Title, Text, Breadcrumbs, Anchor } from '@mantine/core';
import Link from 'next/link';
import type React from 'react';

export interface BreadcrumbItem {
  title: string;
  href?: string;
}

interface PageHeaderProps {
  icon: React.ComponentType<{ size: number | string }>;
  title: string;
  subtitle?: string;
  /** Optional element rendered on the right side (e.g. a Button or Badge) */
  action?: React.ReactNode;
  /** Navigation trail shown above the title. Intermediate items link; last item is plain text. */
  breadcrumbs?: BreadcrumbItem[];
}

export function PageHeader({ icon: Icon, title, subtitle, action, breadcrumbs }: PageHeaderProps) {
  const parentCrumb = breadcrumbs?.[0];

  return (
    <div style={{ marginBottom: 'var(--mantine-spacing-xl)' }}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <>
          {/* Desktop: full trail */}
          <Breadcrumbs mb="xs" visibleFrom="sm">
            {breadcrumbs.map((crumb, i) =>
              crumb.href ? (
                <Anchor key={i} size="sm" component={Link} href={crumb.href}>
                  {crumb.title}
                </Anchor>
              ) : (
                <Text key={i} size="sm" c="dimmed">{crumb.title}</Text>
              )
            )}
            <Text size="sm" c="dimmed">{title}</Text>
          </Breadcrumbs>

          {/* Mobile: single back link */}
          {parentCrumb?.href && (
            <Anchor
              component={Link}
              href={parentCrumb.href}
              size="sm"
              mb="xs"
              hiddenFrom="sm"
              style={{ display: 'block' }}
            >
              ← {parentCrumb.title}
            </Anchor>
          )}
        </>
      )}

      <Group justify="space-between" align="flex-start">
        <Group gap="md" align="flex-start">
          <ThemeIcon size={44} radius="md" variant="light" color="violet">
            <Icon size={24} />
          </ThemeIcon>
          <div>
            <Title order={2} size="h3">{title}</Title>
            {subtitle && (
              <Text size="sm" c="dimmed" mt={2}>{subtitle}</Text>
            )}
          </div>
        </Group>
        {action}
      </Group>
    </div>
  );
}
