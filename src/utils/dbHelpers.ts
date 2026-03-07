/**
 * Helpers para trabalhar com banco de dados
 */

/**
 * Parsear campo JSONB do PostgreSQL de forma segura
 * Compatível com a implementação do Backend
 */
export function parseJsonbField<T = any>(
  field: string | object | null | undefined,
  defaultValue: T
): T {
  if (!field) {
    return defaultValue;
  }

  if (typeof field === 'object') {
    return field as T;
  }

  if (typeof field === 'string') {
    try {
      return JSON.parse(field) as T;
    } catch {
      return defaultValue;
    }
  }

  return defaultValue;
}

/**
 * Normalizar string para uso em queries
 */
export function normalizeString(value: string | undefined | null): string {
  if (!value) return '';
  return value.trim();
}
