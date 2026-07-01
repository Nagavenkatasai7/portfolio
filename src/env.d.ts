/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    /** Populated by middleware on authenticated /admin-dashboard requests. */
    user?: import('./lib/auth').SessionUser;
  }
}
