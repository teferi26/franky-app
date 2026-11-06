import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAccountStorage } from './account-storage';
import { captureSessionIdentity, isCurrentSessionIdentity } from './session';

export type { SessionIdentity } from './session-cache';
export const studyStorage = createAccountStorage(AsyncStorage, { capture: captureSessionIdentity, current: isCurrentSessionIdentity });
