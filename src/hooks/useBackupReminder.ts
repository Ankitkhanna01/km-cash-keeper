import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';

const STORAGE_KEYS = {
  LAST_BACKUP: 'cra_last_backup_date',
  REMINDER_ENABLED: 'cra_backup_reminder_enabled',
  REMINDER_TIME: 'cra_backup_reminder_time',
  AUTO_BACKUP_ENABLED: 'cra_auto_backup_enabled',
  NOTIFICATION_PERMISSION: 'cra_notification_permission_asked',
};

export interface BackupSettings {
  reminderEnabled: boolean;
  reminderTime: string; // HH:mm format
  autoBackupEnabled: boolean;
  lastBackupDate: string | null;
}

export function useBackupReminder() {
  const [settings, setSettings] = useState<BackupSettings>({
    reminderEnabled: true,
    reminderTime: '18:00', // Default 6 PM
    autoBackupEnabled: false,
    lastBackupDate: null,
  });
  const [showReminder, setShowReminder] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

  // Load settings from localStorage
  useEffect(() => {
    const lastBackup = localStorage.getItem(STORAGE_KEYS.LAST_BACKUP);
    const reminderEnabled = localStorage.getItem(STORAGE_KEYS.REMINDER_ENABLED);
    const reminderTime = localStorage.getItem(STORAGE_KEYS.REMINDER_TIME);
    const autoBackupEnabled = localStorage.getItem(STORAGE_KEYS.AUTO_BACKUP_ENABLED);

    setSettings({
      reminderEnabled: reminderEnabled !== 'false',
      reminderTime: reminderTime || '18:00',
      autoBackupEnabled: autoBackupEnabled === 'true',
      lastBackupDate: lastBackup,
    });

    // Check notification permission
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  // Check if backup reminder should show
  useEffect(() => {
    if (!settings.reminderEnabled) {
      setShowReminder(false);
      return;
    }

    const checkReminder = () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const lastBackup = settings.lastBackupDate;

      // Show reminder if no backup today
      if (lastBackup !== today) {
        const now = new Date();
        const [reminderHour, reminderMinute] = settings.reminderTime.split(':').map(Number);
        const reminderDate = new Date();
        reminderDate.setHours(reminderHour, reminderMinute, 0, 0);

        // Show reminder if current time is past reminder time
        if (now >= reminderDate) {
          setShowReminder(true);
        }
      } else {
        setShowReminder(false);
      }
    };

    checkReminder();
    const interval = setInterval(checkReminder, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [settings.reminderEnabled, settings.reminderTime, settings.lastBackupDate]);

  // Request notification permission
  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      return 'denied' as NotificationPermission;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    localStorage.setItem(STORAGE_KEYS.NOTIFICATION_PERMISSION, 'true');
    return permission;
  }, []);

  // Send browser notification
  const sendNotification = useCallback((title: string, body: string) => {
    if (notificationPermission === 'granted') {
      new Notification(title, {
        body,
        icon: '/pwa-192x192.png',
        tag: 'backup-reminder',
      });
    }
  }, [notificationPermission]);

  // Mark backup as done
  const markBackupDone = useCallback(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    localStorage.setItem(STORAGE_KEYS.LAST_BACKUP, today);
    setSettings((prev) => ({ ...prev, lastBackupDate: today }));
    setShowReminder(false);
  }, []);

  // Update settings
  const updateSettings = useCallback((updates: Partial<BackupSettings>) => {
    setSettings((prev) => {
      const newSettings = { ...prev, ...updates };

      if (updates.reminderEnabled !== undefined) {
        localStorage.setItem(STORAGE_KEYS.REMINDER_ENABLED, String(updates.reminderEnabled));
      }
      if (updates.reminderTime !== undefined) {
        localStorage.setItem(STORAGE_KEYS.REMINDER_TIME, updates.reminderTime);
      }
      if (updates.autoBackupEnabled !== undefined) {
        localStorage.setItem(STORAGE_KEYS.AUTO_BACKUP_ENABLED, String(updates.autoBackupEnabled));
      }

      return newSettings;
    });
  }, []);

  // Dismiss reminder for today
  const dismissReminder = useCallback(() => {
    setShowReminder(false);
  }, []);

  // Check if auto-backup should trigger
  const shouldAutoBackup = useCallback(() => {
    if (!settings.autoBackupEnabled) return false;

    const today = format(new Date(), 'yyyy-MM-dd');
    if (settings.lastBackupDate === today) return false;

    const now = new Date();
    const [hour, minute] = settings.reminderTime.split(':').map(Number);
    const targetTime = new Date();
    targetTime.setHours(hour, minute, 0, 0);

    // Auto-backup within 5 minutes of target time
    const diff = Math.abs(now.getTime() - targetTime.getTime());
    return diff < 5 * 60 * 1000;
  }, [settings]);

  return {
    settings,
    showReminder,
    notificationPermission,
    requestNotificationPermission,
    sendNotification,
    markBackupDone,
    updateSettings,
    dismissReminder,
    shouldAutoBackup,
  };
}
