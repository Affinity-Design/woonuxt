require('dotenv').config();
const fetch = require('node-fetch');

console.log('Starting...');
const base = process.env.BASE_URL;
const auth = Buffer.from(process.env.WP_ADMIN_USERNAME + ':' + process.env.WP_ADMIN_APP_PASSWORD).toString('base64');

fetch(base + '/wp-json/wp/v2/pages/166586?context=edit&_fields=id,title,meta', {headers: {Authorization: 'Basic ' + auth}})
  .then(function (r) {
    console.log('Status:', r.status);
    return r.json();
  })
  .then(function (p) {
    const el = (p.meta && p.meta['_elementor_data']) || '';

    console.log('Status:', r.status);
    console.log('Elementor data length:', el.length);

    if (!el) {
      console.log('NO ELEMENTOR DATA');
      process.exit();
    }

    // Find all occurrences of "99" with surrounding context
    const regex = /(.{30})99(.{30})/g;
    let m;
    let count = 0;
    while ((m = regex.exec(el)) !== null) {
      console.log('MATCH ' + ++count + ':');
      const ctx = m[0];
      console.log('  Context:', JSON.stringify(ctx));
    }
    if (count === 0) console.log('No "99" found in Elementor data');

    // Also try a direct patch to see if it works
    const fixed = el
      .replace(/\$99(?![0-9])/g, '$150')
      .replace(/99\+/g, '150+')
      .replace(/\\u002499(?![0-9])/g, '\\u0024150');
    if (fixed === el) {
      console.log('\nReplacement produced NO CHANGE - pattern did not match');
    } else {
      console.log('\nReplacement WOULD change', el.length, '->', fixed.length, 'chars');
    }
  })();
