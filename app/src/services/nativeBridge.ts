// Bridges optional native capabilities when wrapped in the Android .APK or iOS .IPA WebView shells.

declare global {
  interface Window {
    AndroidBridge?: {
      haptic?: (style: string) => void;
      shareTextFile?: (filename: string, content: string, mimeType: string) => void;
      isNativeAndroid?: () => boolean;
    };
    webkit?: {
      messageHandlers?: {
        haptic?: { postMessage: (style: string) => void };
        shareTextFile?: {
          postMessage: (payload: { filename: string; content: string; mimeType: string }) => void;
        };
      };
    };
  }
}

export function isEmbeddedNativeShell(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.AndroidBridge?.isNativeAndroid?.()) return true;
  if (window.webkit?.messageHandlers?.haptic) return true;
  return false;
}

export function triggerHaptic(style: 'light' | 'medium' | 'success' = 'light'): void {
  try {
    if (window.webkit?.messageHandlers?.haptic) {
      window.webkit.messageHandlers.haptic.postMessage(style);
      return;
    }
    if (window.AndroidBridge?.haptic) {
      window.AndroidBridge.haptic(style);
      return;
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(style === 'medium' ? 18 : 10);
    }
  } catch {
    // Ignore unsupported haptic environments
  }
}

export function exportTextFile(filename: string, content: string, mimeType = 'text/csv'): void {
  try {
    if (window.webkit?.messageHandlers?.shareTextFile) {
      window.webkit.messageHandlers.shareTextFile.postMessage({ filename, content, mimeType });
      return;
    }
    if (window.AndroidBridge?.shareTextFile) {
      window.AndroidBridge.shareTextFile(filename, content, mimeType);
      return;
    }
  } catch {
    // Fall through to standard browser download
  }

  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
