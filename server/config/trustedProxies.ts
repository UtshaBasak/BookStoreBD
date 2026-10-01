/**
 * The proxies between a visitor and this server, whose addresses in
 * X-Forwarded-For are skipped to find the visitor.
 *
 * On Render a request passes through Cloudflare, then Render's own proxies on
 * private addresses. Both are listed: trusting only the private ones would
 * make req.ip a Cloudflare edge, so everyone reaching the site through the
 * same edge would share a rate limit. Express reads the header from the right,
 * skipping every address listed
 * here, and takes the first one that is not: the visitor. Whatever a client
 * writes into the header itself sits further left and is never reached.
 *
 * Cloudflare's ranges are published at https://www.cloudflare.com/ips/ and
 * change rarely; these were taken from there on 29 September 2026. If
 * Cloudflare adds a range, visitors reaching the site through it are counted
 * by that edge's address until it is added here - a looser limit, not a
 * broken site.
 */
const CLOUDFLARE_V4 = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
];

const CLOUDFLARE_V6 = [
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

/** For `app.set('trust proxy', ...)`: private networks, then Cloudflare. */
export const TRUSTED_PROXIES = ['loopback', 'linklocal', 'uniquelocal', ...CLOUDFLARE_V4, ...CLOUDFLARE_V6];
