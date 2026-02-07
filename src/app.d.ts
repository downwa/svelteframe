// FILE: src/app.d.ts
import type { User } from '$routes/svelteframe/lib/server/auth';

declare global {
  const __BUILD_INFO__: {
    version: string;
    date: string;
    time: string;
  };

  namespace App {
    // interface Error {}
    interface Locals {
      user: User;
    }
    // interface PageData {}
    // interface Platform {}
  }
}

export { };
