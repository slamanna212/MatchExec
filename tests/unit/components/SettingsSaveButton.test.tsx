import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { SettingsSaveButton } from '../../../src/components/SettingsSaveButton';

function renderWithMantine(element: React.ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(<MantineProvider>{element}</MantineProvider>);
  });
  return container;
}

function getButton(container: HTMLDivElement): HTMLButtonElement | null {
  return container.querySelector('button');
}

describe('SettingsSaveButton', () => {
  it('renders with default label "Save Settings"', () => {
    const container = renderWithMantine(<SettingsSaveButton />);
    expect(container.textContent).toContain('Save Settings');
    container.remove();
  });

  it('renders with custom label', () => {
    const container = renderWithMantine(<SettingsSaveButton label="Update Config" />);
    expect(container.textContent).toContain('Update Config');
    container.remove();
  });

  it('button is not disabled by default', () => {
    const container = renderWithMantine(<SettingsSaveButton />);
    const button = getButton(container);
    expect(button?.disabled).toBe(false);
    container.remove();
  });

  it('button is disabled when disabled=true', () => {
    const container = renderWithMantine(<SettingsSaveButton disabled />);
    const button = getButton(container);
    expect(button?.disabled).toBe(true);
    container.remove();
  });

  it('calls onClick handler when clicked', () => {
    const onClick = vi.fn();
    const container = renderWithMantine(
      <SettingsSaveButton type="button" onClick={onClick} />
    );
    act(() => {
      getButton(container)?.click();
    });
    expect(onClick).toHaveBeenCalledOnce();
    container.remove();
  });

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn();
    const container = renderWithMantine(
      <SettingsSaveButton type="button" disabled onClick={onClick} />
    );
    act(() => {
      getButton(container)?.click();
    });
    expect(onClick).not.toHaveBeenCalled();
    container.remove();
  });

  it('renders a button element', () => {
    const container = renderWithMantine(<SettingsSaveButton />);
    expect(getButton(container)).not.toBeNull();
    container.remove();
  });

  it('is a function component', () => {
    expect(typeof SettingsSaveButton).toBe('function');
  });
});
