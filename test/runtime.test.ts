import { describe, expect, it } from 'vitest';
import { nodeSecurityProblem } from '../src/lib/server/runtime';

describe('nodeSecurityProblem', () => {
  it.each(['v22.23.4', 'v22.24.0', 'v24.22.1', 'v24.23.0', 'v26.12.1', 'v26.13.0', 'v28.0.0'])('%s is patched', (v) =>
    expect(nodeSecurityProblem(v)).toBeNull()
  );
  it.each(['v22.18.0', 'v22.23.3', 'v24.22.0', 'v26.7.0', 'v26.12.0'])('%s is vulnerable', (v) =>
    expect(nodeSecurityProblem(v)).toMatch(/known security vulnerabilities/)
  );
  it.each(['v20.19.0', 'v23.11.0', 'v25.2.0', 'v27.0.0'])('%s is end-of-life', (v) =>
    expect(nodeSecurityProblem(v)).toMatch(/no longer receives security fixes/)
  );
});
