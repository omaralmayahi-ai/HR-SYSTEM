import React, { createContext, useState, useContext, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';

const AuthContext = createContext();

const GOOGLE_FONTS_MAP = {
  'Cairo': 'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&display=swap',
  'Tajawal': 'https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&display=swap',
  'Almarai': 'https://fonts.googleapis.com/css2?family=Almarai:wght@300;400;700;800&display=swap',
  'Readex Pro': 'https://fonts.googleapis.com/css2?family=Readex+Pro:wght@300;400;500;600;700&display=swap',
  'Alexandria': 'https://fonts.googleapis.com/css2?family=Alexandria:wght@300;400;500;600;700;800;900&display=swap',
  'Amiri': 'https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&display=swap',
  'IBM Plex Sans Arabic': 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap',
  'Rubik': 'https://fonts.googleapis.com/css2?family=Rubik:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900&display=swap',
  'Noto Sans Arabic': 'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@300;400;500;600;700;800;900&display=swap',
  'Inter': 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap',
};

function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return { r: 27, g: 58, b: 107 };
  let c = hex.replace('#', '').trim();
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  if (c.length !== 6) return { r: 27, g: 58, b: 107 };
  const num = parseInt(c, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

function adjustColor(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const factor = 1 + (percent / 100);
  const clamp = (val) => Math.min(255, Math.max(0, Math.round(val)));
  const nr = clamp(r * factor);
  const ng = clamp(g * factor);
  const nb = clamp(b * factor);
  return `#${((1 << 24) + (nr << 16) + (ng << 8) + nb).toString(16).slice(1)}`;
}

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
      const platformName = appPublicSettings.platformName || 'نظام إدارة شؤون الموظفين';
      const beneficiaryName = appPublicSettings.beneficiaryName || 'الجمهورية العراقية';
      const logoUrl = appPublicSettings.logoUrl || '';

      // 1. Dynamic Browser Document Title & Favicon
      if (typeof document !== 'undefined') {
        document.title = `${platformName} | ${beneficiaryName}`;
        if (logoUrl) {
          let favicon = document.querySelector("link[rel*='icon']");
          if (!favicon) {
            favicon = document.createElement('link');
            favicon.rel = 'shortcut icon';
            document.head.appendChild(favicon);
          }
          favicon.href = logoUrl;
        }
      }

      // 2. Dynamic Google Font Loading
      const fontId = 'dynamic-google-font-link';
      let fontLink = document.getElementById(fontId);
      if (!fontLink) {
        fontLink = document.createElement('link');
        fontLink.id = fontId;
        fontLink.rel = 'stylesheet';
        document.head.appendChild(fontLink);
      }
      const targetFontUrl = GOOGLE_FONTS_MAP[fontFamily] || GOOGLE_FONTS_MAP['Cairo'];
      if (fontLink.href !== targetFontUrl) {
        fontLink.href = targetFontUrl;
      }

      // 3. Color derivations
      const pr = hexToRgb(primary);
      const sr = hexToRgb(secondary);
      const primaryHsl = rgbToHsl(pr.r, pr.g, pr.b);
      const secondaryHsl = rgbToHsl(sr.r, sr.g, sr.b);
      
      const primaryDark = adjustColor(primary, -22);
      const primaryDarker = adjustColor(primary, -38);
      const primaryHover = adjustColor(primary, 14);
      const primaryBorder = adjustColor(primary, 22);

      const secondaryDark = adjustColor(secondary, -18);
      const secondaryLight = adjustColor(secondary, 18);

      // 4. Dynamic Stylesheet Injection
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
          --primary-rgb: ${pr.r}, ${pr.g}, ${pr.b};
          --primary-dark: ${primaryDark};
          --primary-darker: ${primaryDarker};
          --primary-hover: ${primaryHover};
          --primary-border: ${primaryBorder};

          --secondary-custom: ${secondary};
          --secondary-rgb: ${sr.r}, ${sr.g}, ${sr.b};
          --secondary-dark: ${secondaryDark};
          --secondary-light: ${secondaryLight};

          --font-family-custom: '${fontFamily}', 'Segoe UI', system-ui, -apple-system, sans-serif;

          /* Shadcn & Tailwind CSS variables */
          --primary: ${primaryHsl.h} ${primaryHsl.s}% ${primaryHsl.l}%;
          --primary-foreground: 0 0% 100%;
          --ring: ${primaryHsl.h} ${primaryHsl.s}% ${primaryHsl.l}%;
          --accent: ${secondaryHsl.h} ${secondaryHsl.s}% ${secondaryHsl.l}%;
        }

        /* Universal Typography Override */
        html, body, button, input, select, textarea, [class*="font-"] {
          font-family: var(--font-family-custom) !important;
        }

        /* Primary Backgrounds */
        .bg-\\[\\#1B3A6B\\], .bg-\\[\\#1b3a6b\\],
        .bg-\\[\\#0F2444\\], .bg-\\[\\#0f2444\\],
        .bg-\\[\\#173059\\], .bg-\\[\\#1e3a5f\\],
        .bg-\\[\\#1e3a8a\\], .bg-\\[\\#0d1f3c\\],
        .bg-\\[\\#182e4e\\] {
          background-color: var(--primary-custom) !important;
        }

        .bg-\\[\\#2a4f8f\\] {
          background-color: var(--primary-hover) !important;
        }
        .hover\\:bg-\\[\\#2a4f8f\\]:hover {
          background-color: var(--primary-hover) !important;
        }
        .hover\\:bg-\\[\\#1B3A6B\\]:hover, .hover\\:bg-\\[\\#1b3a6b\\]:hover {
          background-color: var(--primary-dark) !important;
        }

        /* Primary Opacity Variations */
        .bg-\\[\\#1B3A6B\\]\\/5, .bg-\\[\\#1b3a6b\\]\\/5 { background-color: rgba(var(--primary-rgb), 0.05) !important; }
        .bg-\\[\\#1B3A6B\\]\\/10, .bg-\\[\\#1b3a6b\\]\\/10 { background-color: rgba(var(--primary-rgb), 0.10) !important; }
        .bg-\\[\\#1B3A6B\\]\\/15, .bg-\\[\\#1b3a6b\\]\\/15 { background-color: rgba(var(--primary-rgb), 0.15) !important; }
        .bg-\\[\\#1B3A6B\\]\\/20, .bg-\\[\\#1b3a6b\\]\\/20 { background-color: rgba(var(--primary-rgb), 0.20) !important; }
        .bg-\\[\\#1B3A6B\\]\\/30, .bg-\\[\\#1b3a6b\\]\\/30 { background-color: rgba(var(--primary-rgb), 0.30) !important; }
        .bg-\\[\\#1B3A6B\\]\\/40, .bg-\\[\\#1b3a6b\\]\\/40 { background-color: rgba(var(--primary-rgb), 0.40) !important; }
        .bg-\\[\\#1B3A6B\\]\\/50, .bg-\\[\\#1b3a6b\\]\\/50 { background-color: rgba(var(--primary-rgb), 0.50) !important; }
        .bg-\\[\\#1B3A6B\\]\\/80, .bg-\\[\\#1b3a6b\\]\\/80 { background-color: rgba(var(--primary-rgb), 0.80) !important; }

        /* Secondary (Gold/Accent) Backgrounds */
        .bg-\\[\\#C8960C\\], .bg-\\[\\#c8960c\\],
        .bg-\\[\\#b8860b\\], .bg-\\[\\#d4af37\\],
        .bg-\\[\\#e5a910\\] {
          background-color: var(--secondary-custom) !important;
        }

        .bg-\\[\\#b0830a\\], .bg-\\[\\#a67a0a\\],
        .hover\\:bg-\\[\\#b0830a\\]:hover, .hover\\:bg-\\[\\#a67a0a\\]:hover {
          background-color: var(--secondary-dark) !important;
        }
        .hover\\:bg-\\[\\#C8960C\\]:hover, .hover\\:bg-\\[\\#c8960c\\]:hover {
          background-color: var(--secondary-dark) !important;
        }

        .bg-\\[\\#C8960C\\]\\/10, .bg-\\[\\#c8960c\\]\\/10 { background-color: rgba(var(--secondary-rgb), 0.10) !important; }
        .bg-\\[\\#C8960C\\]\\/20, .bg-\\[\\#c8960c\\]\\/20 { background-color: rgba(var(--secondary-rgb), 0.20) !important; }
        .bg-\\[\\#C8960C\\]\\/30, .bg-\\[\\#c8960c\\]\\/30 { background-color: rgba(var(--secondary-rgb), 0.30) !important; }

        /* Text Colors */
        .text-\\[\\#1B3A6B\\], .text-\\[\\#1b3a6b\\],
        .text-\\[\\#0F2444\\], .text-\\[\\#0f2444\\],
        .text-\\[\\#1e3a8a\\], .text-\\[\\#173059\\],
        .text-\\[\\#1e3a5f\\] {
          color: var(--primary-custom) !important;
        }
        .text-\\[\\#2a4f8f\\] {
          color: var(--primary-hover) !important;
        }
        .hover\\:text-\\[\\#1B3A6B\\]:hover, .hover\\:text-\\[\\#1b3a6b\\]:hover {
          color: var(--primary-custom) !important;
        }

        .text-\\[\\#C8960C\\], .text-\\[\\#c8960c\\],
        .text-\\[\\#b0830a\\], .text-\\[\\#d4af37\\],
        .text-\\[\\#e5a910\\], .text-\\[\\#b8860b\\] {
          color: var(--secondary-custom) !important;
        }
        .hover\\:text-\\[\\#C8960C\\]:hover, .hover\\:text-\\[\\#c8960c\\]:hover {
          color: var(--secondary-custom) !important;
        }

        /* Borders */
        .border-\\[\\#1B3A6B\\], .border-\\[\\#1b3a6b\\],
        .border-\\[\\#0F2444\\], .border-\\[\\#1e3a5f\\],
        .border-\\[\\#173059\\] {
          border-color: var(--primary-custom) !important;
        }
        .border-\\[\\#2a4f8f\\] {
          border-color: var(--primary-hover) !important;
        }
        .border-\\[\\#1B3A6B\\]\\/10, .border-\\[\\#1b3a6b\\]\\/10 { border-color: rgba(var(--primary-rgb), 0.10) !important; }
        .border-\\[\\#1B3A6B\\]\\/20, .border-\\[\\#1b3a6b\\]\\/20 { border-color: rgba(var(--primary-rgb), 0.20) !important; }
        .border-\\[\\#1B3A6B\\]\\/30, .border-\\[\\#1b3a6b\\]\\/30 { border-color: rgba(var(--primary-rgb), 0.30) !important; }

        .border-\\[\\#C8960C\\], .border-\\[\\#c8960c\],
        .border-\\[\\#b0830a\\], .border-\\[\\#a67a0a\\] {
          border-color: var(--secondary-custom) !important;
        }
        .border-\\[\\#C8960C\\]\\/20, .border-\\[\\#c8960c\\]\\/20 { border-color: rgba(var(--secondary-rgb), 0.20) !important; }
        .border-\\[\\#C8960C\\]\\/30, .border-\\[\\#c8960c\\]\\/30 { border-color: rgba(var(--secondary-rgb), 0.30) !important; }

        /* Focus & Rings */
        .ring-\\[\\#1B3A6B\\], .ring-\\[\\#1b3a6b\\],
        .focus\\:ring-\\[\\#1B3A6B\\]:focus, .focus-visible\\:ring-\\[\\#1B3A6B\\]:focus-visible {
          --tw-ring-color: var(--primary-custom) !important;
        }
        .ring-\\[\\#C8960C\\], .ring-\\[\\#c8960c\],
        .focus\\:ring-\\[\\#C8960C\\]:focus, .focus-visible\\:ring-\\[\\#C8960C\\]:focus-visible {
          --tw-ring-color: var(--secondary-custom) !important;
        }
        .focus\\:border-\\[\\#1B3A6B\\]:focus {
          border-color: var(--primary-custom) !important;
        }

        /* Gradients */
        .from-\\[\\#1B3A6B\\], .from-\\[\\#1b3a6b\\] {
          --tw-gradient-from: var(--primary-custom) var(--tw-gradient-from-position) !important;
          --tw-gradient-to: rgba(var(--primary-rgb), 0) var(--tw-gradient-to-position) !important;
          --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important;
        }
        .to-\\[\\#0F2444\\], .to-\\[\\#0f2444\\], .to-\\[\\#0d1f3c\\], .to-\\[\\#173059\\] {
          --tw-gradient-to: var(--primary-dark) var(--tw-gradient-to-position) !important;
        }
        .to-\\[\\#2a4f8f\\] {
          --tw-gradient-to: var(--primary-hover) var(--tw-gradient-to-position) !important;
        }

        .from-\\[\\#C8960C\\], .from-\\[\\#c8960c\\] {
          --tw-gradient-from: var(--secondary-custom) var(--tw-gradient-from-position) !important;
          --tw-gradient-to: rgba(var(--secondary-rgb), 0) var(--tw-gradient-to-position) !important;
          --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important;
        }
        .to-\\[\\#b0830a\\], .to-\\[\\#a67a0a\\] {
          --tw-gradient-to: var(--secondary-dark) var(--tw-gradient-to-position) !important;
        }

        /* Settings Subcomponents & Button Overrides */
        .settings-content button.bg-indigo-600,
        .settings-content button.bg-blue-600,
        .settings-content .bg-indigo-600,
        button.bg-indigo-600,
        button.bg-blue-600 {
          background-color: var(--primary-custom) !important;
        }

        .settings-content button.hover\:bg-indigo-700:hover,
        .settings-content button.hover\:bg-indigo-500:hover,
        .settings-content button.hover\:bg-blue-700:hover,
        button.hover\:bg-indigo-700:hover,
        button.hover\:bg-indigo-500:hover,
        button.hover\:bg-blue-700:hover {
          background-color: var(--primary-dark) !important;
        }

        .settings-content .text-indigo-600,
        .settings-content .text-indigo-700,
        .settings-content .text-blue-600,
        .settings-content .text-blue-700 {
          color: var(--primary-custom) !important;
        }

        .settings-content .border-indigo-600,
        .settings-content .border-blue-600 {
          border-color: var(--primary-custom) !important;
        }

        .settings-content .bg-indigo-50,
        .settings-content .bg-blue-50 {
          background-color: rgba(var(--primary-rgb), 0.08) !important;
        }

        /* Scrollbars */
        ::-webkit-scrollbar-thumb {
          background: rgba(var(--primary-rgb), 0.25) !important;
          border-radius: 10px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(var(--primary-rgb), 0.55) !important;
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

