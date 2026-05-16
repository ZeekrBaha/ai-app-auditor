import { describe, it, expect } from 'vitest';
import { version } from '../src/index.js';

describe('toolchain sanity', () => {
  it('imports from src and runs a test', () => {
    expect(version).toBe('0.0.1');
  });
});
