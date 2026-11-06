import { AppState, Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { captureOwnedSignOut, supabase } from './supabase';
import { captureSessionIdentity, isCurrentSessionIdentity } from './session';

/** Existing Apple accounts also respond to revoked consent (Apple TN3194). */
export function watchAppleSession() {
  if (Platform.OS !== 'ios') return () => {};
  let alive = true;
  let checking = false;
  let pendingRevocation = false;
  async function check(revokedEvent = false) {
    if (revokedEvent) pendingRevocation = true;
    const owner = captureSessionIdentity();
    if (!owner || checking) return;
    checking = true;
    const signOut = captureOwnedSignOut(owner);
    pendingRevocation = false;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const identity = session?.user.identities?.find(item => item.provider === 'apple');
      const subject = identity?.identity_data?.sub;
      if (!alive || !isCurrentSessionIdentity(owner) || session?.user.id !== owner.userId || typeof subject !== 'string') return;
      // Events trigger a fresh check of this subject. Never apply an A event
      // as a forced revocation to B after an account switch.
      const state = await AppleAuthentication.getCredentialStateAsync(subject);
      if (alive && isCurrentSessionIdentity(owner) && (state === AppleAuthentication.AppleAuthenticationCredentialState.REVOKED || state === AppleAuthentication.AppleAuthenticationCredentialState.NOT_FOUND)) {
        await signOut();
      }
    } catch { /* Network failures do not log out a valid offline session. */ }
    finally { checking = false; if (alive && pendingRevocation) void check(); }
  }
  const subscription = AppleAuthentication.addRevokeListener(() => { void check(true); });
  const foreground = AppState.addEventListener('change', state => { if (state === 'active') void check(); });
  void check();
  return () => { alive = false; subscription.remove(); foreground.remove(); };
}
