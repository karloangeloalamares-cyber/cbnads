import { useCallback } from 'react';
import { signIn, signOut } from '@/lib/localAuth';

const sanitizeCallbackUrl = (value, fallback) => {
  const rawValue = String(value || '').trim();
  const fallbackValue = String(fallback || '').trim() || '/';
  if (!rawValue) {
    return fallbackValue;
  }

  try {
    const url = new URL(rawValue, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/')) {
      return fallbackValue;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallbackValue;
  }
};

function useAuth() {
  const signInWithCredentials = useCallback(async (options) => {
    const result = await signIn({
      email: options?.email,
      password: options?.password,
    });

    if (result.ok) {
      if (options?.redirect) {
        const callbackUrl = sanitizeCallbackUrl(
          options?.callbackUrl,
          '/ads?section=Dashboard',
        );
        window.location.href = callbackUrl;
      }
      return { error: null, ok: true };
    }

    return { error: result.error || 'Sign in failed', ok: false };
  }, []);

  const signUpWithCredentials = useCallback(async () => {
    return { error: 'Sign up is disabled', ok: false };
  }, []);

  const handleSignOut = useCallback(async (options = {}) => {
    await signOut();
    if (options.redirect !== false) {
      window.location.href = sanitizeCallbackUrl(
        options.callbackUrl,
        '/account/signin',
      );
    }
    return { ok: true };
  }, []);

  return {
    signInWithCredentials,
    signUpWithCredentials,
    signInWithGoogle: async () => ({ error: 'Not supported', ok: false }),
    signInWithFacebook: async () => ({ error: 'Not supported', ok: false }),
    signInWithTwitter: async () => ({ error: 'Not supported', ok: false }),
    signInWithApple: async () => ({ error: 'Not supported', ok: false }),
    signOut: handleSignOut,
  };
}

export default useAuth;
