import { notifications } from '@mantine/notifications';
import { IconCheck, IconX, IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
import { createElement } from 'react';

export interface NotificationOptions {
  title?: string;
  message: string;
  autoClose?: boolean | number;
  loading?: boolean;
  id?: string;
}

export const notificationHelper = {
  success: (options: NotificationOptions) => {
    notifications.show({
      title: options.title || 'Success',
      message: options.message,
      color: 'green',
      icon: createElement(IconCheck, { size: 16 }),
      autoClose: options.autoClose !== undefined ? options.autoClose : 4000,
      id: options.id,
    });
  },

  error: (options: NotificationOptions) => {
    notifications.show({
      title: options.title || 'Error',
      message: options.message,
      color: 'red',
      icon: createElement(IconX, { size: 16 }),
      autoClose: options.autoClose !== undefined ? options.autoClose : 6000,
      id: options.id,
    });
  },

  warning: (options: NotificationOptions) => {
    notifications.show({
      title: options.title || 'Warning',
      message: options.message,
      color: 'orange',
      icon: createElement(IconAlertTriangle, { size: 16 }),
      autoClose: options.autoClose !== undefined ? options.autoClose : 5000,
      id: options.id,
    });
  },

  info: (options: NotificationOptions) => {
    notifications.show({
      title: options.title || 'Info',
      message: options.message,
      color: 'blue',
      icon: createElement(IconInfoCircle, { size: 16 }),
      autoClose: options.autoClose !== undefined ? options.autoClose : 4000,
      id: options.id,
    });
  },

  loading: (options: NotificationOptions) => {
    notifications.show({
      id: options.id || 'loading',
      title: options.title || 'Loading',
      message: options.message,
      loading: true,
      autoClose: false,
      withCloseButton: false,
    });
  },

  update: (id: string, options: NotificationOptions & { type: 'success' | 'error' | 'warning' | 'info' }) => {
    const config = {
      success: { color: 'green', icon: createElement(IconCheck, { size: 16 }) },
      error: { color: 'red', icon: createElement(IconX, { size: 16 }) },
      warning: { color: 'orange', icon: createElement(IconAlertTriangle, { size: 16 }) },
      info: { color: 'blue', icon: createElement(IconInfoCircle, { size: 16 }) }
    };

    notifications.update({
      id,
      title: options.title || (options.type.charAt(0).toUpperCase() + options.type.slice(1)),
      message: options.message,
      color: config[options.type].color,
      icon: config[options.type].icon,
      loading: false,
      autoClose: options.autoClose !== undefined ? options.autoClose : 4000,
    });
  },

  hide: (id: string) => {
    notifications.hide(id);
  },

  clean: () => {
    notifications.clean();
  }
};

// Convenience exports for common patterns
export const showSuccess = (message: string, title?: string) =>
  notificationHelper.success({ message, title });

export const showError = (message: string, title?: string) =>
  notificationHelper.error({ message, title });

export const showWarning = (message: string, title?: string) =>
  notificationHelper.warning({ message, title });

export const showInfo = (message: string, title?: string) =>
  notificationHelper.info({ message, title });