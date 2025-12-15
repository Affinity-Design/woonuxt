import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export default defineEventHandler(async () => {
  // Only allow this endpoint in local dev to avoid exposing internal build artifacts in production.
  if (process.env.NODE_ENV === 'production') {
    throw createError({statusCode: 404, statusMessage: 'Not Found'});
  }

  const filePath = resolve(process.cwd(), 'data', 'products-list.json');
  const raw = await readFile(filePath, 'utf-8');

  // Ensure the output matches the search engine expectations (array of products)
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed;
});
