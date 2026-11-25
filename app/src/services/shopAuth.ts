const SHOP_PIN = '4115';
const SHOP_PIN_STORAGE_KEY = 'im_shop_pin_v2';
const USER_NAME_STORAGE_KEY = 'im_user_name_v1';

export function verifyAndStoreShopPin(pin: string): boolean {
  if (pin !== SHOP_PIN) return false;
  try {
    localStorage.setItem(SHOP_PIN_STORAGE_KEY, SHOP_PIN);
  } catch {
    // Ignore storage errors
  }
  return true;
}

export function isShopPinUnlocked(): boolean {
  try {
    return localStorage.getItem(SHOP_PIN_STORAGE_KEY) === SHOP_PIN;
  } catch {
    return false;
  }
}

export function lockShopPin(): void {
  try {
    localStorage.removeItem(SHOP_PIN_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function getSavedUserName(): string {
  try {
    return (localStorage.getItem(USER_NAME_STORAGE_KEY) ?? '').trim();
  } catch {
    return '';
  }
}

export function saveUserName(name: string): string {
  const cleaned = name.trim();
  try {
    if (cleaned) {
      localStorage.setItem(USER_NAME_STORAGE_KEY, cleaned);
    } else {
      localStorage.removeItem(USER_NAME_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
  return cleaned;
}
