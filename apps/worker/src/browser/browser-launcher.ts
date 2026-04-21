export type BrowserLaunchInput = {
  chromePath?: string;
  headless?: boolean;
  extraArgs?: string[];
};

type LaunchOptions = {
  executablePath: string;
  headless: boolean;
  args: string[];
};

type BrowserLike = {
  newContext: (...args: unknown[]) => Promise<{
    newPage: () => Promise<unknown>;
    newCDPSession: (page: unknown) => Promise<unknown>;
    close: () => Promise<void>;
  }>;
  close: () => Promise<void>;
};

export function resolveChromePath(input: BrowserLaunchInput): string
{
  if (input.chromePath && input.chromePath.trim())
  {
    return input.chromePath;
  }

  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && fromEnv.trim())
  {
    return fromEnv;
  }

  if (process.platform === 'linux')
  {
    return '/usr/bin/google-chrome';
  }

  return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
}

function defaultArgs(): string[]
{
  if (process.platform === 'linux')
  {
    return ['--no-sandbox', '--disable-dev-shm-usage'];
  }
  return [];
}

export function createLaunchOptions(input: BrowserLaunchInput = {}): LaunchOptions
{
  return {
    executablePath: resolveChromePath(input),
    headless: input.headless ?? true,
    args: [...defaultArgs(), ...(input.extraArgs ?? [])],
  };
}

export async function launchBrowser(input: BrowserLaunchInput = {}): Promise<BrowserLike>
{
  const playwright = await import('playwright');

  return playwright.chromium.launch(createLaunchOptions(input));
}
