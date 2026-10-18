import type { Locale } from '$lib/i18n';
import type { SessionUser } from '$lib/server/auth/users';

declare global {
  namespace App {
    interface Locals {
      user: SessionUser | null;
      /** Hash of the current session token (its id), for rotation and "this device" markers. */
      sessionId: string | null;
      /** UI language for this request (cookie, else Accept-Language, else Korean). */
      locale: Locale;
    }
  }
}

export {};
