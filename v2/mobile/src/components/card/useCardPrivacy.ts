import { useCallback } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';

let users = 0;
let queue: Promise<void> = Promise.resolve();
function reconcile() {
  queue = queue.catch(() => {}).then(async () => {
    if (users > 0) {
      await ScreenCapture.preventScreenCaptureAsync('franky-card-private');
      if (Platform.OS === 'ios') await ScreenCapture.enableAppSwitcherProtectionAsync(1);
    } else {
      await ScreenCapture.allowScreenCaptureAsync('franky-card-private');
      if (Platform.OS === 'ios') await ScreenCapture.disableAppSwitcherProtectionAsync();
    }
  }).catch(() => {});
}
/** Defence in depth only: the server still requires both actors and a live credential. */
export function useCardPrivacy() {
  useFocusEffect(useCallback(() => { users += 1; reconcile(); return () => { users = Math.max(0, users - 1); reconcile(); }; }, []));
}
