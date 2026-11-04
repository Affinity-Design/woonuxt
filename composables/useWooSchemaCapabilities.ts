// Feature checks against the live WooGraphQL schema, so one .ca build works on WooGraphQL 0.21.1 (PROD-02) and on
// WPGraphQL for eCommerce 1.0+ (PROD-03): before and after the static-IP cutover, and after a backend rollback.

// One probe per page load, shared by every caller. Registration and checkout are client-only routes.
let authenticateInputProbe: Promise<boolean> | null = null;

export const useWooSchemaCapabilities = () => {
  // RegisterCustomerInput.authenticate and CreateAccountInput.authenticate arrived together in 1.0. 1.0+ only logs
  // a new customer in when it is sent; 0.21.1 rejects the mutation when it is sent. If the probe itself fails,
  // assume 1.0+ (the post-cutover backend) and probe again next time.
  const supportsAuthenticateInput = (): Promise<boolean> => {
    authenticateInputProbe ??= GqlRegisterCustomerInputFields()
      .then((result) => {
        const fields = result?.__type?.inputFields;
        if (!Array.isArray(fields)) throw new Error('RegisterCustomerInput probe returned no input fields');
        return fields.some((field) => field?.name === 'authenticate');
      })
      .catch(() => {
        authenticateInputProbe = null;
        return true;
      });
    return authenticateInputProbe;
  };

  // After a failed mutation: the backend may have changed since the probe (a tab open across the cutover or a rollback).
  const forgetAuthenticateInputProbe = () => {
    authenticateInputProbe = null;
  };

  return {supportsAuthenticateInput, forgetAuthenticateInputProbe};
};
