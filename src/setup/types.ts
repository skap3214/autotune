export interface SetupInstallResult {
  harness?: string;
  component: string;
  target: string;
  package?: string;
  status: "installed" | "skipped";
  reason?: string;
}

export interface SetupComponent {
  harness?: string;
  component: string;
  description: string;
  install(cwd: string): Promise<SetupInstallResult>;
  verify?(cwd: string): Promise<boolean>;
}
