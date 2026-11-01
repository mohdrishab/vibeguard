/**
 * Output formats for audit/repair reports.
 */
export type ReportFormat = 'html' | 'json' | 'markdown';

/**
 * Canonical file name used for each report format. The CLI's output path
 * defaults are derived from these so reports are always consistently
 * named and easy to find.
 */
const FORMAT_FILE_NAMES: Readonly<Record<ReportFormat, string>> = {
  html: 'vibeguard-report.html',
  json: 'vibeguard-report.json',
  markdown: 'vibeguard-report.md',
};

/**
 * MIME type for each report format.
 */
const FORMAT_MIME_TYPES: Readonly<Record<ReportFormat, string>> = {
  html: 'text/html',
  json: 'application/json',
  markdown: 'text/markdown',
};

/**
 * @throws {RangeError} If the format is not a valid {@link ReportFormat}.
 */
export function reportFileName(format: ReportFormat): string {
  const name = FORMAT_FILE_NAMES[format];
  if (name === undefined) {
    throw new RangeError(`Unknown report format: "${JSON.stringify(format)}"`);
  }
  return name;
}

/**
 * @throws {RangeError} If the format is not a valid {@link ReportFormat}.
 */
export function reportMimeType(format: ReportFormat): string {
  const mimeType = FORMAT_MIME_TYPES[format];
  if (mimeType === undefined) {
    throw new RangeError(`Unknown report format: "${JSON.stringify(format)}"`);
  }
  return mimeType;
}
