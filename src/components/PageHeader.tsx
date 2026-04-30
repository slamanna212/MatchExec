import { Group, ThemeIcon, Title, Text, Breadcrumbs, Anchor, ActionIcon, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import Link from 'next/link';
import type React from 'react';
import classes from './PageHeader.module.css';

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
  /** Link to the documentation page for this section */
  docLink?: string;
}

function DocLink({ href }: { href: string }) {
  return (
    <Tooltip
      label="View documentation"
      position="right"
      withArrow
      openDelay={300}
      arrowSize={6}
      styles={{ tooltip: { fontSize: 'var(--mantine-font-size-xs)', padding: '4px 10px' } }}
    >
      <ActionIcon
        component="a"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        variant="subtle"
        size="sm"
        radius="xl"
        aria-label="View documentation"
        className={classes.docLink}
      >
        <IconInfoCircle size={15} stroke={1.75} />
      </ActionIcon>
    </Tooltip>
  );
}

export function PageHeader({ icon: Icon, title, subtitle, action, breadcrumbs, docLink }: PageHeaderProps) {
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
            <Group gap={6} align="center" wrap="nowrap">
              <Title order={2} size="h3">{title}</Title>
              {docLink && <DocLink href={docLink} />}
            </Group>
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
