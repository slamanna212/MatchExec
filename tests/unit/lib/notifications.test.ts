import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isValidElement } from 'react';

vi.mock('@mantine/notifications', () => ({
  notifications: {
    show: vi.fn(),
    update: vi.fn(),
    hide: vi.fn(),
    clean: vi.fn(),
  },
}));

import { notifications } from '@mantine/notifications';
import {
  notificationHelper,
  showSuccess,
  showError,
  showWarning,
  showInfo,
} from '../../../src/lib/notifications';

const mockShow = notifications.show as ReturnType<typeof vi.fn>;
const mockUpdate = notifications.update as ReturnType<typeof vi.fn>;
const mockHide = notifications.hide as ReturnType<typeof vi.fn>;
const mockClean = notifications.clean as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('notificationHelper.success', () => {
  it('calls notifications.show with color green', () => {
    notificationHelper.success({ message: 'saved' });
    expect(mockShow).toHaveBeenCalledOnce();
    expect(mockShow.mock.calls[0][0].color).toBe('green');
  });

  it('uses default title "Success"', () => {
    notificationHelper.success({ message: 'ok' });
    expect(mockShow.mock.calls[0][0].title).toBe('Success');
  });

  it('uses custom title when provided', () => {
    notificationHelper.success({ message: 'ok', title: 'Done!' });
    expect(mockShow.mock.calls[0][0].title).toBe('Done!');
  });

  it('default autoClose is 4000', () => {
    notificationHelper.success({ message: 'ok' });
    expect(mockShow.mock.calls[0][0].autoClose).toBe(4000);
  });

  it('custom autoClose overrides default', () => {
    notificationHelper.success({ message: 'ok', autoClose: false });
    expect(mockShow.mock.calls[0][0].autoClose).toBe(false);
  });

  it('forwards id when provided', () => {
    notificationHelper.success({ message: 'ok', id: 'my-id' });
    expect(mockShow.mock.calls[0][0].id).toBe('my-id');
  });

  it('icon is a valid React element', () => {
    notificationHelper.success({ message: 'ok' });
    expect(isValidElement(mockShow.mock.calls[0][0].icon)).toBe(true);
  });
});

describe('notificationHelper.error', () => {
  it('calls notifications.show with color red', () => {
    notificationHelper.error({ message: 'failed' });
    expect(mockShow.mock.calls[0][0].color).toBe('red');
  });

  it('uses default title "Error"', () => {
    notificationHelper.error({ message: 'err' });
    expect(mockShow.mock.calls[0][0].title).toBe('Error');
  });

  it('default autoClose is 6000', () => {
    notificationHelper.error({ message: 'err' });
    expect(mockShow.mock.calls[0][0].autoClose).toBe(6000);
  });

  it('icon is a valid React element', () => {
    notificationHelper.error({ message: 'err' });
    expect(isValidElement(mockShow.mock.calls[0][0].icon)).toBe(true);
  });
});

describe('notificationHelper.warning', () => {
  it('calls notifications.show with color orange', () => {
    notificationHelper.warning({ message: 'caution' });
    expect(mockShow.mock.calls[0][0].color).toBe('orange');
  });

  it('uses default title "Warning"', () => {
    notificationHelper.warning({ message: 'w' });
    expect(mockShow.mock.calls[0][0].title).toBe('Warning');
  });

  it('default autoClose is 5000', () => {
    notificationHelper.warning({ message: 'w' });
    expect(mockShow.mock.calls[0][0].autoClose).toBe(5000);
  });
});

describe('notificationHelper.info', () => {
  it('calls notifications.show with color blue', () => {
    notificationHelper.info({ message: 'fyi' });
    expect(mockShow.mock.calls[0][0].color).toBe('blue');
  });

  it('uses default title "Info"', () => {
    notificationHelper.info({ message: 'i' });
    expect(mockShow.mock.calls[0][0].title).toBe('Info');
  });

  it('default autoClose is 4000', () => {
    notificationHelper.info({ message: 'i' });
    expect(mockShow.mock.calls[0][0].autoClose).toBe(4000);
  });
});

describe('notificationHelper.loading', () => {
  it('shows with loading=true and autoClose=false', () => {
    notificationHelper.loading({ message: 'please wait' });
    const call = mockShow.mock.calls[0][0];
    expect(call.loading).toBe(true);
    expect(call.autoClose).toBe(false);
    expect(call.withCloseButton).toBe(false);
  });

  it('uses default id "loading" when none provided', () => {
    notificationHelper.loading({ message: 'w' });
    expect(mockShow.mock.calls[0][0].id).toBe('loading');
  });

  it('uses custom id when provided', () => {
    notificationHelper.loading({ message: 'w', id: 'upload-progress' });
    expect(mockShow.mock.calls[0][0].id).toBe('upload-progress');
  });
});

describe('notificationHelper.update', () => {
  it('calls notifications.update with correct color for success', () => {
    notificationHelper.update('my-id', { message: 'done', type: 'success' });
    expect(mockUpdate).toHaveBeenCalledOnce();
    expect(mockUpdate.mock.calls[0][0].color).toBe('green');
    expect(mockUpdate.mock.calls[0][0].id).toBe('my-id');
  });

  it('calls notifications.update with color red for error', () => {
    notificationHelper.update('id', { message: 'oops', type: 'error' });
    expect(mockUpdate.mock.calls[0][0].color).toBe('red');
  });

  it('calls notifications.update with color orange for warning', () => {
    notificationHelper.update('id', { message: 'w', type: 'warning' });
    expect(mockUpdate.mock.calls[0][0].color).toBe('orange');
  });

  it('calls notifications.update with color blue for info', () => {
    notificationHelper.update('id', { message: 'i', type: 'info' });
    expect(mockUpdate.mock.calls[0][0].color).toBe('blue');
  });

  it('sets loading=false on update', () => {
    notificationHelper.update('id', { message: 'done', type: 'success' });
    expect(mockUpdate.mock.calls[0][0].loading).toBe(false);
  });

  it('icon is a valid React element', () => {
    notificationHelper.update('id', { message: 'done', type: 'success' });
    expect(isValidElement(mockUpdate.mock.calls[0][0].icon)).toBe(true);
  });

  it('default autoClose is 4000', () => {
    notificationHelper.update('id', { message: 'done', type: 'success' });
    expect(mockUpdate.mock.calls[0][0].autoClose).toBe(4000);
  });
});

describe('notificationHelper.hide and clean', () => {
  it('hide calls notifications.hide with id', () => {
    notificationHelper.hide('some-id');
    expect(mockHide).toHaveBeenCalledWith('some-id');
  });

  it('clean calls notifications.clean', () => {
    notificationHelper.clean();
    expect(mockClean).toHaveBeenCalledOnce();
  });
});

describe('convenience exports', () => {
  it('showSuccess calls success helper with message', () => {
    showSuccess('saved');
    expect(mockShow).toHaveBeenCalledOnce();
    expect(mockShow.mock.calls[0][0].color).toBe('green');
    expect(mockShow.mock.calls[0][0].message).toBe('saved');
  });

  it('showSuccess forwards optional title', () => {
    showSuccess('saved', 'Custom Title');
    expect(mockShow.mock.calls[0][0].title).toBe('Custom Title');
  });

  it('showError calls error helper', () => {
    showError('bad');
    expect(mockShow.mock.calls[0][0].color).toBe('red');
  });

  it('showWarning calls warning helper', () => {
    showWarning('careful');
    expect(mockShow.mock.calls[0][0].color).toBe('orange');
  });

  it('showInfo calls info helper', () => {
    showInfo('note');
    expect(mockShow.mock.calls[0][0].color).toBe('blue');
  });
});
