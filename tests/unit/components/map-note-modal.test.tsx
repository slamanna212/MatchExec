import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { MapNoteModal } from '../../../src/components/map-note-modal';

// requestAnimationFrame in jsdom fires asynchronously; make it synchronous
vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
  cb(0);
  return 0;
});

const roots: Root[] = [];
const divs: HTMLDivElement[] = [];

afterEach(() => {
  act(() => {
    roots.forEach(r => r.unmount());
  });
  divs.forEach(d => d.remove());
  roots.length = 0;
  divs.length = 0;
  vi.clearAllMocks();
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

function defaultProps(overrides: Partial<{
  opened: boolean;
  onClose: () => void;
  mapName: string;
  initialNote: string;
  onSave: (note: string) => void;
}> = {}) {
  return {
    opened: true,
    onClose: vi.fn(),
    mapName: 'Hanamura',
    initialNote: '',
    onSave: vi.fn(),
    ...overrides,
  };
}

describe('MapNoteModal', () => {
  it('renders modal content when opened', () => {
    renderWithMantine(<MapNoteModal {...defaultProps()} />);
    expect(document.body.textContent).toContain('Hanamura');
  });

  it('does not render the input when closed', () => {
    renderWithMantine(<MapNoteModal {...defaultProps({ opened: false })} />);
    // Mantine may still mount but hide modal — check no visible input
    const input = document.body.querySelector('input[placeholder="Enter a note for this map..."]');
    expect(input).toBeNull();
  });

  it('shows initial note text in the input', () => {
    renderWithMantine(
      <MapNoteModal {...defaultProps({ initialNote: 'Check left flank' })} />
    );
    const input = document.body.querySelector('input[placeholder="Enter a note for this map..."]') as HTMLInputElement;
    expect(input?.value).toBe('Check left flank');
  });

  it('calls onSave with trimmed text when Save is clicked', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    renderWithMantine(
      <MapNoteModal {...defaultProps({ onSave, onClose, initialNote: '  note  ' })} />
    );
    const buttons = document.body.querySelectorAll('button');
    const saveButton = Array.from(buttons).find(b => b.textContent?.trim() === 'Save');
    act(() => { saveButton?.click(); });
    expect(onSave).toHaveBeenCalledWith('note');
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    renderWithMantine(<MapNoteModal {...defaultProps({ onClose })} />);
    const buttons = document.body.querySelectorAll('button');
    const cancelButton = Array.from(buttons).find(b => b.textContent?.trim() === 'Cancel');
    act(() => { cancelButton?.click(); });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the map name in the title', () => {
    renderWithMantine(
      <MapNoteModal {...defaultProps({ mapName: "King's Row" })} />
    );
    expect(document.body.textContent).toContain("King's Row");
  });

  it('renders Save and Cancel buttons when open', () => {
    renderWithMantine(<MapNoteModal {...defaultProps()} />);
    const buttons = Array.from(document.body.querySelectorAll('button')).map(b => b.textContent?.trim());
    expect(buttons).toContain('Save');
    expect(buttons).toContain('Cancel');
  });

  it('is a function component', () => {
    expect(typeof MapNoteModal).toBe('function');
  });
});
