// plugins/turnstile.client.js
export default defineNuxtPlugin((nuxtApp) => {
  // Add Turnstile script to the document
  const turnstileScript = document.createElement("script");
  turnstileScript.src =
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  turnstileScript.async = true;
  turnstileScript.defer = true;
  document.head.appendChild(turnstileScript);

  // Clean up on app unmount
  nuxtApp.hook("app:unmount", () => {
    turnstileScript.remove();
  });
});
