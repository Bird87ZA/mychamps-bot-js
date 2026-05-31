const MYCHAMPS_TOKEN_SETTING = '`mychamps-api-token`';

export function formatUserError(error: unknown, action: string): string {
  const message = getErrorMessage(error);

  if (isTimezoneMissingMessage(message)) {
    return 'The timezone is not set for this server. Ask an admin to run `/settings` and fill in the Timezone field, for example `Europe/Berlin`.';
  }

  if (isMyChampsTokenMissingMessage(message)) {
    return `MyChamps API token is missing for this server. Ask an admin to run \`/settings\` and set ${MYCHAMPS_TOKEN_SETTING}.`;
  }

  const apiStatus = getMyChampsApiStatus(message);
  if (apiStatus) {
    return formatMyChampsApiError(apiStatus);
  }

  if (/api error/i.test(message)) {
    return `I could not ${action} because MyChamps returned an error. Check the MyChamps API token, your linked account, and the selected championship or league.`;
  }

  if (isNetworkError(message)) {
    return 'Could not reach the MyChamps API. This looks like a network or MyChamps server issue; please try again later.';
  }

  if (isDiscordMissingAccessError(error)) {
    return `I could not ${action} because Discord denied access. Check that the bot can view the channel and has the required channel/category permissions.`;
  }

  if (isDiscordMissingPermissionsError(error)) {
    return `I could not ${action} because Discord rejected a permission update. Grant the bot the required permissions and make sure the bot role is above the roles it needs to manage.`;
  }

  if (isPrismaError(error)) {
    return `I could not ${action} because the bot database rejected the request. This is a server-side issue; ask an admin to check the bot logs.`;
  }

  return `I could not ${action} because an unexpected bot error occurred. This is a server-side issue; please try again or ask an admin to check the bot logs.`;
}

export function formatMyChampsConfigError(error: unknown): string {
  return formatUserError(error, 'connect to MyChamps');
}

export function formatValidationError(error: unknown, fallbackAction: string): string {
  const message = getErrorMessage(error);

  if (message.startsWith('Invalid timezone:')) {
    return `${message}. Use an IANA timezone such as \`Europe/Berlin\`.`;
  }

  if (message.includes('must be a whole number greater than or equal to 0')) {
    return `${message} Use digits only, for example \`6\`.`;
  }

  return formatUserError(error, fallbackAction);
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : '';
}

function isTimezoneMissingMessage(message: string): boolean {
  return /timezone/i.test(message) && /set/i.test(message);
}

function isMyChampsTokenMissingMessage(message: string): boolean {
  return (
    (/mychamps-api-token/i.test(message) && /not configured|missing/i.test(message)) ||
    /api (is )?not configured/i.test(message)
  );
}

function getMyChampsApiStatus(message: string): number | null {
  const match = /MyChamps API error\s+(\d{3})/i.exec(message);

  return match ? Number(match[1]) : null;
}

function formatMyChampsApiError(status: number): string {
  if (status === 401 || status === 403) {
    return `MyChamps rejected the request. Check ${MYCHAMPS_TOKEN_SETTING} in \`/settings\` and make sure your MyChamps account has access.`;
  }

  if (status === 404) {
    return 'MyChamps could not find the requested data. Make sure your Discord account is linked and the selected championship or league still exists.';
  }

  if (status >= 500) {
    return 'MyChamps returned a server error. This is not fixable in Discord; please try again later or ask an admin to check MyChamps.';
  }

  return 'MyChamps rejected the request. Check the command inputs, your linked account, and the server MyChamps settings.';
}

function isNetworkError(message: string): boolean {
  return /fetch failed|network|ECONN|ETIMEDOUT|ENOTFOUND|timeout/i.test(message);
}

function isDiscordMissingAccessError(error: unknown): boolean {
  return getDiscordErrorCode(error) === 50001;
}

function isDiscordMissingPermissionsError(error: unknown): boolean {
  return getDiscordErrorCode(error) === 50013;
}

function getDiscordErrorCode(error: unknown): unknown {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const errorWithCode = error as { code?: unknown; rawError?: { code?: unknown } };

  return errorWithCode.code ?? errorWithCode.rawError?.code ?? null;
}

function isPrismaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybePrismaError = error as { name?: unknown; code?: unknown; clientVersion?: unknown };

  return (
    (typeof maybePrismaError.name === 'string' &&
      maybePrismaError.name.startsWith('PrismaClient')) ||
    Boolean(maybePrismaError.clientVersion)
  );
}
