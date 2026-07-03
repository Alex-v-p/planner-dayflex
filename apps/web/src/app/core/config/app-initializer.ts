import { provideAppInitializer, inject } from "@angular/core";

import { AppConfigService } from "./app-config.service";

export function provideRuntimeAppConfig() {
  return provideAppInitializer(() => inject(AppConfigService).load());
}
