// Debug script to check headers being sent to GraphQL endpoint
// Run this in the browser console to see what headers are being sent

console.log('=== Current Headers Debug ===');

// Check current environment
console.log('Window location:', window.location.href);
console.log('Window origin:', window.location.origin);

// Check if cookies are set
const sessionCookie = document.cookie.split(';').find((cookie) => cookie.trim().startsWith('woocommerce-session='));
console.log('WooCommerce session cookie:', sessionCookie);

// Check localStorage
console.log('LocalStorage items:');
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  const value = localStorage.getItem(key);
  if (key.includes('woo') || key.includes('session') || key.includes('cart')) {
    console.log(`  ${key}: ${value}`);
  }
}

// Monitor fetch requests
const originalFetch = window.fetch;
window.fetch = function (...args) {
  const [url, options] = args;
  if (url.includes('graphql')) {
    console.log('GraphQL Request Headers:', options?.headers || 'No headers');
    console.log('GraphQL Request URL:', url);
  }
  return originalFetch.apply(this, args).then((response) => {
    if (url.includes('graphql')) {
      console.log('GraphQL Response Status:', response.status);
      console.log('GraphQL Response Headers:', [...response.headers.entries()]);
    }
    return response;
  });
};

console.log('Headers debug script loaded. Try adding a product to cart now.');
