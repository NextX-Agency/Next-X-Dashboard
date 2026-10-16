import 'dotenv/config';
import {
  AGENT_SCOPES,
  createIntegrationCredential,
  disableIntegrationCredential,
  rotateIntegrationCredential,
  type AgentScope,
} from '../src/server/services/agent-integration';

function usage(): never {
  console.error(
    [
      'Usage:',
      '  pnpm integration:credential create --name <name> [--scopes catalog:read,inventory:read,...]',
      '  pnpm integration:credential rotate --key-id <key-id>',
      '  pnpm integration:credential disable --key-id <key-id>',
    ].join('\n'),
  );
  process.exit(1);
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function scopes(): AgentScope[] {
  const raw = option('--scopes');
  if (!raw) return [...AGENT_SCOPES];
  const requested = raw.split(',').map((scope) => scope.trim());
  if (requested.some((scope) => !(AGENT_SCOPES as readonly string[]).includes(scope))) {
    console.error(`Invalid scope. Allowed values: ${AGENT_SCOPES.join(', ')}`);
    process.exit(1);
  }
  return requested as AgentScope[];
}

const [, , command] = process.argv;
try {
  if (command === 'create') {
    const name = option('--name')?.trim();
    if (!name || name.length > 120) usage();
    const created = await createIntegrationCredential({ name, scopes: scopes() });
    console.log(JSON.stringify({ ...created, warning: 'Store this token now; it will not be shown again.' }));
  } else if (command === 'rotate') {
    const keyId = option('--key-id')?.trim();
    if (!keyId) usage();
    const rotated = await rotateIntegrationCredential(keyId);
    console.log(JSON.stringify({ ...rotated, warning: 'Store this token now; it will not be shown again.' }));
  } else if (command === 'disable') {
    const keyId = option('--key-id')?.trim();
    if (!keyId) usage();
    console.log(JSON.stringify(await disableIntegrationCredential(keyId)));
  } else {
    usage();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
