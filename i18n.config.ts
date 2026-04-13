export default defineI18nConfig(() => ({
  legacy: false,
  locale: 'en-CA',
  fallbackLocale: {
    'en-CA': ['en'],
    'fr': ['en-CA', 'en'],
    default: ['en-CA', 'en'],
  },
  missingWarn: false,
  fallbackWarn: false,
}));
