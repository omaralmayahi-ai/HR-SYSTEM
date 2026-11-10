// تحويل أسماء الحقول بين القاعدة (snake_case) والواجهة (camelCase). نُقل من server.ts (B3).
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function mapKeys(obj: any, transform: (s: string) => string): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((item) => mapKeys(item, transform));
  if (typeof obj === 'object') {
    if (obj instanceof Date) return obj;
    const newObj: any = {};
    for (const key of Object.keys(obj)) newObj[transform(key)] = mapKeys(obj[key], transform);
    return newObj;
  }
  return obj;
}
