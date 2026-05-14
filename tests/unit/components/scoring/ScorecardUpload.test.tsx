import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';

vi.mock('@/lib/notifications', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import { ScorecardUpload } from '../../../../src/components/scoring/ScorecardUpload';

const roots: Root[] = [];
const divs: HTMLDivElement[] = [];
const originalFetch = globalThis.fetch;

afterEach(() => {
  act(() => { roots.forEach(r => r.unmount()); });
  divs.forEach(d => d.remove());
  roots.length = 0;
  divs.length = 0;
  globalThis.fetch = originalFetch;
});

function renderWithMantine(element: React.ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  divs.push(container);
  act(() => {
    const root = createRoot(container);
    roots.push(root);
    root.render(<MantineProvider>{element}</MantineProvider>);
  });
  return container;
}

const defaultProps = {
  matchId: 'm-1',
  matchGameId: 'mg-1',
  onUploadComplete: vi.fn(),
};

describe('ScorecardUpload', () => {
  it('renders Upload Scorecard heading', () => {
    const container = renderWithMantine(<ScorecardUpload {...defaultProps} />);
    expect(container.textContent).toContain('Upload Scorecard');
  });

  it('renders Blue Team and Red Team team side options', () => {
    const container = renderWithMantine(<ScorecardUpload {...defaultProps} />);
    expect(container.textContent).toContain('Blue Team');
    expect(container.textContent).toContain('Red Team');
  });

  it('renders drop zone with drag & drop instruction', () => {
    const container = renderWithMantine(<ScorecardUpload {...defaultProps} />);
    expect(container.textContent).toContain('Drag & drop');
  });

  it('renders Confirm button disabled when no file selected', () => {
    const container = renderWithMantine(<ScorecardUpload {...defaultProps} />);
    const buttons = Array.from(container.querySelectorAll('button'));
    const confirmBtn = buttons.find(b => b.textContent?.includes('Confirm'));
    expect(confirmBtn).not.toBeUndefined();
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders Cancel button when onCancel is provided', () => {
    const container = renderWithMantine(
      <ScorecardUpload {...defaultProps} onCancel={vi.fn()} />
    );
    expect(container.textContent).toContain('Cancel');
  });

  it('does not render Cancel button when onCancel is not provided', () => {
    const container = renderWithMantine(<ScorecardUpload {...defaultProps} />);
    expect(container.textContent).not.toContain('Cancel');
  });

  it('calls onCancel when Cancel button is clicked', () => {
    const onCancel = vi.fn();
    const container = renderWithMantine(
      <ScorecardUpload {...defaultProps} onCancel={onCancel} />
    );
    const buttons = Array.from(container.querySelectorAll('button'));
    const cancelBtn = buttons.find(b => b.textContent?.includes('Cancel'));
    act(() => { cancelBtn?.click(); });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders hidden file input with image/* accept', () => {
    const container = renderWithMantine(<ScorecardUpload {...defaultProps} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input?.accept).toBe('image/*');
  });

  it('is a function component', () => {
    expect(typeof ScorecardUpload).toBe('function');
  });
});
