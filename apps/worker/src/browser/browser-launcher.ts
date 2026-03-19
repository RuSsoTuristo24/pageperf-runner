export type BrowserLaunchInput = {
  chromePath?: string;
  headless?: boolean;
};

type LaunchOptions = {
  executablePath: string;
  headless: boolean;
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

  return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
}

export function createLaunchOptions(input: BrowserLaunchInput = {}): LaunchOptions
{
  return {
    executablePath: resolveChromePath(input),
    headless: input.headless ?? true,
  };
}

export async function launchBrowser(input: BrowserLaunchInput = {}): Promise<BrowserLike>
{
  const playwright = await import('playwright');

  return playwright.chromium.launch(createLaunchOptions(input));
}
