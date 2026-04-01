const DEFAULT_PROTECTED = [
  ".env",
  ".env.local",
  ".env.chamber",
  ".env.ngrok",
  "**/.env",
  "**/.env.local",
  "**/.env.chamber",
  "**/.env.ngrok",
];

const normalizePath = (filePath: string): string => filePath.replaceAll("\\", "/");

export const getProtectedPatterns = (patterns: string[] = []): string[] => [
  ...new Set([...DEFAULT_PROTECTED, ...patterns].map(normalizePath)),
];

export const isProtectedPath = (filePath: string, patterns: string[]): boolean => {
  const normalizedPath = normalizePath(filePath);

  for (const pattern of patterns) {
    if (pattern.startsWith("**/")) {
      const suffix = pattern.slice(3);
      if (normalizedPath === suffix || normalizedPath.endsWith(`/${suffix}`)) {
        return true;
      }
      continue;
    }

    if (normalizedPath === pattern || normalizedPath.endsWith(`/${pattern}`)) {
      return true;
    }
  }

  return false;
};

export const filterProtectedPaths = (paths: string[], patterns: string[]): string[] =>
  paths.filter((filePath) => isProtectedPath(filePath, patterns));
