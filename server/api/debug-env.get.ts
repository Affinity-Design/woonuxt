// Debug endpoint to check environment variables in production
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  
  return {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    hasWpAdminUsername: !!config.wpAdminUsername,
    hasWpAdminAppPassword: !!config.wpAdminAppPassword,
    hasWpBaseUrl: !!config.public.wpBaseUrl,
    wpAdminUsernameLength: config.wpAdminUsername?.length || 0,
    wpAdminAppPasswordLength: config.wpAdminAppPassword?.length || 0,
    wpBaseUrlValue: config.public.wpBaseUrl || 'NOT_SET',
    // Don't expose actual values for security
    wpAdminUsernamePreview: config.wpAdminUsername ? `${config.wpAdminUsername.substring(0, 5)}...` : 'NOT_SET',
    wpAdminAppPasswordPreview: config.wpAdminAppPassword ? `${config.wpAdminAppPassword.substring(0, 4)}...` : 'NOT_SET',
    allConfigKeys: Object.keys(config),
    publicConfigKeys: Object.keys(config.public || {}),
    // Check all required vars for admin order creation
    adminOrderRequirements: {
      wpAdminUsername: !!config.wpAdminUsername,
      wpAdminAppPassword: !!config.wpAdminAppPassword,
      wpBaseUrl: !!config.public.wpBaseUrl,
      allRequiredPresent: !!(config.wpAdminUsername && config.wpAdminAppPassword && config.public.wpBaseUrl)
    }
  };
});