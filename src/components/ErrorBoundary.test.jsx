import { describe, it, expect, vi } from 'vitest';

// The default vitest environment is `node` (no jsdom installed). ErrorBoundary
// imports ui/button -> lib/utils.js, which reads `window.self`/`window.top` at
// module load. Provide a minimal window stub before the import is evaluated.
vi.hoisted(() => {
  if (typeof globalThis.window === 'undefined') {
    const stub = { location: { reload: () => {}, href: '/' } };
    stub.self = stub;
    stub.top = stub;
    globalThis.window = stub;
  }
});

import ErrorBoundary from './ErrorBoundary';

describe('ErrorBoundary Isolated Component Safety Verification', () => {
  it('should capture error state in getDerivedStateFromError', () => {
    const testError = new Error('اختبار الخطأ الآمن');
    const newState = ErrorBoundary.getDerivedStateFromError(testError);
    
    expect(newState.hasError).toBe(true);
    expect(newState.error).toBe(testError);
  });

  it('should invoke onReset callback when handleReset is triggered', () => {
    const onResetMock = vi.fn();
    const boundary = new ErrorBoundary({ onReset: onResetMock });
    boundary.setState = vi.fn();

    boundary.handleReset();

    expect(onResetMock).toHaveBeenCalledTimes(1);
    expect(boundary.setState).toHaveBeenCalledWith({ hasError: false, error: null, errorInfo: null });
  });

  it('should render fallback or children depending on error state', () => {
    const boundary = new ErrorBoundary({ fallback: 'Custom Fallback' });
    boundary.state = { hasError: true, error: new Error('Simulated failure'), errorInfo: null };

    const renderedFallback = boundary.render();
    expect(renderedFallback).toBe('Custom Fallback');
  });
});
