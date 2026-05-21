import {getHeader} from 'h3';

export default defineEventHandler((event) => {
  const countryCode = (getHeader(event, 'cf-ipcountry') || 'CA').trim().toUpperCase();

  return {
    countryCode: countryCode || 'CA',
  };
});
