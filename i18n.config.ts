export default defineI18nConfig(() => ({
  legacy: false,
  locale: 'en-CA',
  fallbackLocale: {
    'en-CA': ['en'],
    'en-US': ['en'],
    'fr-CA': ['en'],
    default: ['en', 'en-CA'],
  },
  missingWarn: false,
  fallbackWarn: false,
}));
