import React, { createContext, useState, useContext, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  useEffect(() => {
    if (appPublicSettings) {
      const primary = appPublicSettings.primaryColor || '#1B3A6B';
      const secondary = appPublicSettings.secondaryColor || '#C8960C';
      const fontFamily = appPublicSettings.fontFamily || 'Cairo';
      
      const styleId = 'dynamic-branding-styles';
      let styleEl = document.getElementById(styleId);
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }
      
      styleEl.innerHTML = `
        :root {
          --primary-custom: ${primary};
          --secondary-custom: ${secondary};
        }
        /* Custom overrides for exact primary/secondary hardcoded Tailwind colors */
        .bg-\\[\\#1B3A6B\\] {
          background-color: ${primary} !important;
        }
        .bg-\\[\\#C8960C\\] {
          background-color: ${secondary} !important;
        }
        .text-\\[\\#1B3A6B\\] {
          color: ${primary} !important;
        }
        .text-\\[\\#C8960C\\] {
          color: ${secondary} !important;
        }
        .border-\\[\\#1B3A6B\\] {
          border-color: ${primary} !important;
        }
        .border-\\[\\#C8960C\\] {
          border-color: ${secondary} !important;
        }
        
        /* Custom state changes for sidebar and list items */
        .hover\\:bg-\\[\\#2a4f8f\\]:hover {
          background-color: ${primary}bb !important;
        }
        .border-\\[\\#2a4f8f\\] {
          border-color: ${primary}88 !important;
        }
        
        body {
          font-family: '${fontFamily}', 'Segoe UI', Arial, sans-serif !important;
        }
      `;
      
      // Store settings in localStorage for immediate retrieval in salaryTable.js calculation
      localStorage.setItem('SYSTEM_SETTINGS_PRESETS', JSON.stringify(appPublicSettings));
    }
  }, [appPublicSettings]);

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      const settings = await apiClient.settings.get().catch(() => ({
        platformName: 'نظام إدارة شؤون الموظفين',
        beneficiaryName: 'وزارة الموارد البشرية العراقية',
        copyrightText: 'جميع الحقوق محفوظة © 2026',
        primaryColor: '#1B3A6B',
        secondaryColor: '#C8960C',
        logoUrl: 'https://img.icons8.com/color/48/gender-neutral-user.png',
        fontFamily: 'Cairo'
      }));
      
      setAppPublicSettings(settings);
      setIsLoadingPublicSettings(false);
      await checkUserAuth();
    } catch (error) {
      console.error('Unexpected error checking app state:', error);
      setIsLoadingPublicSettings(false);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await apiClient.auth.me();
      if (currentUser) {
        setUser(currentUser);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      console.error('User auth check failed:', error);
      setUser(null);
      setIsAuthenticated(false);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    apiClient.auth.logout();
    if (shouldRedirect) {
      window.location.href = '/login';
    }
  };

  const navigateToLogin = () => {
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      setAppPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

