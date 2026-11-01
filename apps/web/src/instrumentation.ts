export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { isSetupMode } = await import('./lib/setup-mode');
  if (!isSetupMode()) return;
  const { issueSetupCode } = await import('./lib/setup-code');
  issueSetupCode();
}
