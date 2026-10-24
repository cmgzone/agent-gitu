export interface MailConnectionCheck {
  state: 'ok' | 'timeout' | 'authentication-rejected' | 'tls-error' | 'dns-error' | 'refused' | 'unavailable';
  message: string;
}

export interface MailHealth {
  checkedAt: string;
  imap: MailConnectionCheck;
  smtp: MailConnectionCheck;
}

/** Fixed messages: server replies can contain credentials and message content. */
export function mailConnectionFailure(error: unknown, protocol: 'imap' | 'smtp'): MailConnectionCheck {
  const failure = error as { code?: unknown; authenticationFailed?: unknown; responseCode?: unknown } | undefined;
  const code = String(failure?.code ?? '').toUpperCase(), name = protocol === 'imap' ? 'Incoming IMAP' : 'Outgoing SMTP';
  if (/ENOTFOUND|EAI_AGAIN/.test(code)) return { state: 'dns-error', message: `${name} server name could not be resolved. Check the saved host and DNS.` };
  if (/CERT|TLS|SELF_SIGNED|UNABLE_TO_VERIFY|DEPTH_ZERO|ESECURITY/.test(code)) return { state: 'tls-error', message: `${name} certificate could not be verified. Check the server certificate and host name.` };
  if (/TIMEOUT|TIMEDOUT/.test(code)) return { state: 'timeout', message: `${name} connection timed out. Check the server, port and firewall; credentials were not verified.` };
  if (code === 'ECONNREFUSED') return { state: 'refused', message: `${name} server refused the connection. Check that the mail service is listening on the saved port.` };
  if (failure?.authenticationFailed === true || /AUTHENTICATIONFAILED|EAUTH/.test(code) || protocol === 'smtp' && Number(failure?.responseCode) === 535) return { state: 'authentication-rejected', message: `${name} server rejected sign-in. Check the saved username, password or app password.` };
  return { state: 'unavailable', message: `${name} could not be checked. Retry when the server is available; this does not establish that credentials expired.` };
}
