'use client'

import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface PublicSettings {
  siteName: string;
  features: {
    enableRegistration: boolean;
    enableGoogleAuth: boolean;
    enablePublicBoards: boolean;
    enableRealTimeUpdates: boolean;
    enableComments: boolean;
    enableFileUploads: boolean;
    enableAnalytics: boolean;
    enableEmailNotifications: boolean;
  };
  maintenance: {
    enabled: boolean;
    message: string;
    scheduledAt: string | null;
    estimatedDuration: number | null;
  };
  limits: {
    maxBoardsPerUser: number;
  };
  payments: {
    enabled: boolean;
    provider: string;
    currency: string;
    monthlyPrice: number;
    yearlyPrice: number;
    trialDays: number;
  };
}

interface SettingsContextType {
  settings: PublicSettings | null;
  loading: boolean;
  refreshSettings: () => Promise<void>;
}

const defaultSettings: PublicSettings = {
  siteName: 'TaskZen',
  features: {
    enableRegistration: true,
    enableGoogleAuth: false,
    enablePublicBoards: false,
    enableRealTimeUpdates: true,
    enableComments: true,
    enableFileUploads: true,
    enableAnalytics: true,
    enableEmailNotifications: true,
  },
  maintenance: {
    enabled: false,
    message: '',
    scheduledAt: null,
    estimatedDuration: null,
  },
  limits: {
    maxBoardsPerUser: 3,
  },
  payments: {
    enabled: true,
    provider: 'stripe',
    currency: 'USD',
    monthlyPrice: 9.99,
    yearlyPrice: 99.99,
    trialDays: 14,
  },
};

const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings,
  loading: true,
  refreshSettings: async () => {},
});

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = async () => {
    try {
      const response = await api.get('/public/settings');
      setSettings(response.data);
    } catch (error) {
      console.error('Failed to fetch public settings:', error);
      setSettings(defaultSettings);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const refreshSettings = async () => {
    await fetchSettings();
  };

  return (
    <SettingsContext.Provider value={{ settings, loading, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

