export interface OpenFileFailure {
  filePath: string;
  error: string;
}

/**
 * Reads each selected file independently so one unreadable file (permissions,
 * deleted, is a directory, ...) doesn't prevent the others from opening.
 */
export function readFilesForOpen<T>(
  filePaths: string[],
  read: (filePath: string) => T,
): { files: T[]; failures: OpenFileFailure[] } {
  const files: T[] = [];
  const failures: OpenFileFailure[] = [];
  for (const filePath of filePaths) {
    try {
      files.push(read(filePath));
    } catch (err) {
      failures.push({ filePath, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { files, failures };
}

function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

/** Builds the error dialog text listing the files that couldn't be opened. */
export function formatOpenFailures(failures: OpenFileFailure[]): { message: string; detail: string } {
  const message =
    failures.length === 1
      ? `"${fileName(failures[0].filePath)}" could not be opened.`
      : `${failures.length} files could not be opened.`;
  const detail = failures.map(f => `${f.filePath}\n  ${f.error}`).join('\n\n');
  return { message, detail };
}
