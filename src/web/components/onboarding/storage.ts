// Persisted first-run flags. Storage can be blocked, so every access is wrapped.
import type { Role } from '../../../shared/types';

const STORAGE_KEY = 'fairshift.onboarded';

/** True when the first-run flow has been finished or skipped on this device. False when storage is blocked. */
export function hasOnboarded(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Records that the first-run flow is done. Never throws: with blocked storage the flow simply shows again. */
export function markOnboarded(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Storage blocked. Nothing else to do.
  }
}

const introKey = (role: Role) => `fairshift.intro.${role}`;

/** True when this role's intro slides were finished or skipped on this device. False when storage is blocked. */
export function hasSeenIntro(role: Role): boolean {
  try {
    return window.localStorage.getItem(introKey(role)) === '1';
  } catch {
    return false;
  }
}

/** Forgets that a role's intro was seen, so it shows on the next login (demo logins replay it). Never throws. */
export function forgetIntro(role: Role): void {
  try {
    window.localStorage.removeItem(introKey(role));
  } catch {
    // Storage blocked: hasSeenIntro is already false.
  }
}

/** Records that a role's intro is done. Never throws. */
export function markIntroSeen(role: Role): void {
  try {
    window.localStorage.setItem(introKey(role), '1');
  } catch {
    // Storage blocked. The intro may show again; nothing else to do.
  }
}
