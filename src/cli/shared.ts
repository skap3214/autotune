export type CliErrorCode =
  | "INVALID_ARGS"
  | "UNSUPPORTED_COMPONENT"
  | "SESSION_UNRESOLVED"
  | "SETUP_REQUIRED"
  | "MERGE_FAILED"
  | "STORAGE_WRITE_FAILED"
  | "EXPORT_FAILED";

export class CliError extends Error {
  code: CliErrorCode;
  exitCode: number;
  details: Record<string, unknown> | undefined;
  retryable: boolean;

  constructor(
    code: CliErrorCode,
    message: string,
    exitCode: number,
    details?: Record<string, unknown>,
    retryable = false,
  ) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
    this.retryable = retryable;
  }
}

export function printJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

export function printErrorJson(error: unknown): never {
  if (error instanceof CliError) {
    process.stderr.write(
      `${JSON.stringify(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details ?? {},
            retryable: error.retryable,
          },
        },
        null,
        2,
      )}\n`,
    );
    process.exit(error.exitCode);
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(
    `${JSON.stringify(
      {
        ok: false,
        error: {
          code: "STORAGE_WRITE_FAILED",
          message,
          details: {},
          retryable: false,
        },
      },
      null,
      2,
    )}\n`,
  );
  process.exit(7);
}

export async function runCliAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    printErrorJson(error);
  }
}
