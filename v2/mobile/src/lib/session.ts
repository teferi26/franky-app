import { sessionCache } from './supabase';

export type { SessionIdentity } from './session-cache';
export const { captureSessionIdentity, isCurrentSessionIdentity, invalidateSession, getCachedSession, getCachedUser, withFreshSession, onSessionIdentityChange } = sessionCache;
