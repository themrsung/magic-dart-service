let cached: { ip: string | null; at: number } | undefined;

/**
 * OpenDART only accepts API calls from IP addresses registered with the key, so the admin page shows
 * the address this server's requests leave from. Looking it up means one HTTPS request to a public
 * IP-echo service, made only when an admin opens that page. Set EGRESS_IP_LOOKUP=off to disable.
 */
export function egressLookupEnabled(): boolean {
  return !/^(0|off|false|no)$/i.test(process.env.EGRESS_IP_LOOKUP ?? '');
}

/** The public IP OpenDART sees for this server (register it at opendart.fss.or.kr). */
export async function egressIp(): Promise<string | null> {
  if (!egressLookupEnabled()) return null;
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.ip;
  let ip: string | null = null;
  for (const url of ['https://api.ipify.org', 'https://icanhazip.com']) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      const text = (await res.text()).trim();
      if (res.ok && /^[0-9a-f.:]+$/i.test(text)) {
        ip = text;
        break;
      }
    } catch {
      // try the next one
    }
  }
  cached = { ip, at: Date.now() };
  return ip;
}
