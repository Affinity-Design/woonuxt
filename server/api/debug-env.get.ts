// Debug endpoint to check environment variables in production
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  return {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    hasWpAdminUsername: !!config.wpAdminUsername,
    hasWpAdminAppPassword: !!config.wpAdminAppPassword,
    wpAdminUsernameLength: config.wpAdminUsername?.length || 0,
    wpAdminAppPasswordLength: config.wpAdminAppPassword?.length || 0,
    // Don't expose actual values for security
    wpAdminUsernamePreview: config.wpAdminUsername ? `${config.wpAdminUsername.substring(0, 5)}...` : 'NOT_SET',
    wpAdminAppPasswordPreview: config.wpAdminAppPassword ? `${config.wpAdminAppPassword.substring(0, 4)}...` : 'NOT_SET',
    allConfigKeys: Object.keys(config),
  };
});
