import { describe, it, expect } from "vitest";
import { inAppBrowserNameFromUA } from "@/lib/webview-ua";

const UA_INSTAGRAM_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 Instagram 334.0.4.32.98 (iPhone14,5; iOS 17_5; es_ES; es-ES; scale=3.00; 1170x2532; 591107242)";
const UA_TIKTOK_ANDROID =
  "Mozilla/5.0 (Linux; Android 13; SM-A536B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.54 Mobile Safari/537.36 trill_2022803010 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/28.3.1 ByteLocale/es ByteFullLocale/es Region/ES";
const UA_SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const UA_CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36";
const UA_CHROME_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const UA_ANDROID_GENERIC_WEBVIEW =
  "Mozilla/5.0 (Linux; Android 13; SM-A536B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.54 Mobile Safari/537.36";

describe("inAppBrowserNameFromUA", () => {
  it("detecta el webview de Instagram en iOS", () => {
    expect(inAppBrowserNameFromUA(UA_INSTAGRAM_IOS)).toBe("Instagram");
  });

  it("detecta el webview de TikTok en Android", () => {
    expect(inAppBrowserNameFromUA(UA_TIKTOK_ANDROID)).toBe("TikTok");
  });

  it("detecta el webview genérico de Android ('; wv)')", () => {
    expect(inAppBrowserNameFromUA(UA_ANDROID_GENERIC_WEBVIEW)).toBe("esta app");
  });

  it("NO marca navegadores normales como webview", () => {
    expect(inAppBrowserNameFromUA(UA_SAFARI_IOS)).toBeNull();
    expect(inAppBrowserNameFromUA(UA_CHROME_ANDROID)).toBeNull();
    expect(inAppBrowserNameFromUA(UA_CHROME_DESKTOP)).toBeNull();
    expect(inAppBrowserNameFromUA("")).toBeNull();
  });
});
