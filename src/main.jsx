import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// Handle and suppress benign third-party browser extension noise (e.g. Chrome extension disconnects)
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const msg = event?.reason?.message || String(event?.reason || '');
    if (
      msg.includes('Could not establish connection. Receiving end does not exist') ||
      msg.includes('The message port closed before a response was received') ||
      msg.includes('ResizeObserver loop completed with undelivered notifications')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });

  window.addEventListener('error', (event) => {
    const msg = event?.message || '';
    if (
      msg.includes('Could not establish connection. Receiving end does not exist') ||
      msg.includes('ResizeObserver loop completed with undelivered notifications') ||
      msg.includes('ResizeObserver loop limit exceeded')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
