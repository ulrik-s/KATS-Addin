/**
 * Friendly error formatting that pulls extra context from Office.js
 * `OfficeExtension.Error` instances. The plain `.message` on those
 * is usually just `"GeneralException"` — useless. The real data lives
 * on `.code` (a stable string code) and `.debugInfo` (the API call
 * that failed + Word's diagnostic message).
 */

interface OfficeExtensionErrorLike {
  readonly message: string;
  readonly code?: string;
  readonly debugInfo?: {
    readonly code?: string;
    readonly errorLocation?: string;
    readonly message?: string;
    readonly fullStatements?: string;
  };
}

export function formatError(cause: unknown): string {
  if (cause instanceof Error) {
    const officeErr = asOfficeError(cause);
    if (officeErr) return formatOfficeError(officeErr);

    // ProcessorError already formats as `[TAG/phase] message` and may
    // wrap an inner Office.js error in `.cause`.
    const inner = (cause as { cause?: unknown }).cause;
    if (inner !== undefined && inner !== cause) {
      return `${cause.message}\n  caused by: ${formatError(inner)}`;
    }
    return cause.message;
  }
  return String(cause);
}

function asOfficeError(e: Error): OfficeExtensionErrorLike | undefined {
  const candidate = e as unknown as OfficeExtensionErrorLike;
  if (
    typeof candidate.code === 'string' ||
    (candidate.debugInfo !== undefined && typeof candidate.debugInfo === 'object')
  ) {
    return candidate;
  }
  return undefined;
}

function formatOfficeError(e: OfficeExtensionErrorLike): string {
  const parts: string[] = [];
  const code = e.code ?? e.debugInfo?.code ?? '';
  const baseMessage = e.debugInfo?.message ?? e.message;
  parts.push(code.length > 0 ? `[${code}] ${baseMessage}` : baseMessage);
  if (e.debugInfo?.errorLocation !== undefined && e.debugInfo.errorLocation.length > 0) {
    parts.push(`  at ${e.debugInfo.errorLocation}`);
  }
  if (
    e.debugInfo?.fullStatements !== undefined &&
    e.debugInfo.fullStatements.length > 0 &&
    e.debugInfo.fullStatements !== e.debugInfo.errorLocation
  ) {
    parts.push(`  statements: ${e.debugInfo.fullStatements}`);
  }
  return parts.join('\n');
}
