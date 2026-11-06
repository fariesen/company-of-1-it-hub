import { describe, expect, it } from 'vitest';
import { aggregateSoftware, compareVersions } from '../../src/lib/content';
import { best, displayHardware, parseDeviceRecord, parseSnapshot, type Device } from '../../src/lib/inventory';
import { filterDevices, scoreFields } from '../../src/lib/search';
import { detectPlatform } from '../../src/lib/pwa';
import { device, snapshot } from './fakeGitHub';

const mk = (id: string, extra: Record<string, unknown> = {}, snap?: string): Device => ({
  ...parseDeviceRecord(JSON.parse(device(id, extra))),
  repository: 'it',
  folder: `inventory/x/${id}`,
  recordPath: `inventory/x/${id}/device.json`,
  snapshotCount: snap ? 1 : 0,
  snapshot: snap ? parseSnapshot(JSON.parse(snap)) : undefined
});

describe('inventory parsing', () => {
  it('keeps unknown values explicit instead of guessing', () => {
    const d = parseDeviceRecord(JSON.parse(device('AIC-001', { hardware: { manufacturer: 'ExampleCorp', ramGB: 'unknown' } })));
    expect(d.hardware).toMatchObject({ manufacturer: 'ExampleCorp', model: 'unknown', cpu: 'unknown', ramGB: 'unknown' });
    expect(d.hostname).toBe('unknown');
  });

  it('rejects invalid IDs', () => {
    expect(() => parseDeviceRecord(JSON.parse(device('PC1')))).toThrow(/id/);
  });

  it('prefers verified observations but keeps declared values visible', () => {
    const d = mk('AIC-001', { hardware: { gpu: 'Example GPU X1' } }, snapshot('AIC-001', '2026-11-05T00:00:00Z'));
    const hw = displayHardware(d);
    expect(hw.gpu).toEqual({ declared: 'Example GPU X1', observed: 'GPU One' });
    expect(best(hw.ram)).toBe('32 GB');
  });

  it('ignores virtual display adapters for the GPU summary', () => {
    const d = mk('AIC-001', {}, snapshot('AIC-001', '2026-11-05T00:00:00Z'));
    expect(displayHardware(d).gpu.observed).toBe('GPU One');
  });

  it('aggregates software across devices', () => {
    const a = mk('AIC-001', {}, snapshot('AIC-001', '2026-11-05T00:00:00Z', [{ name: 'Git', version: '1' }]));
    const b = mk('UC-001', {}, snapshot('UC-001', '2026-11-05T00:00:00Z', [{ name: 'git', version: '2' }]));
    const sw = aggregateSoftware([a, b]);
    expect(sw).toHaveLength(1);
    expect(sw[0]!.deviceIds).toEqual(['AIC-001', 'UC-001']);
  });

  it('compares versions numerically', () => {
    expect(compareVersions('0.1.10', '0.1.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
  });
});

describe('search', () => {
  const devices = [mk('AIC-001', { name: 'Example workstation', aliases: ['PC1'] }), mk('UC-001', { name: 'Laptop' })];
  it('finds by ID, alias and name, case-insensitively', () => {
    expect(filterDevices(devices, 'aic-001').map((d) => d.id)).toEqual(['AIC-001']);
    expect(filterDevices(devices, 'pc1').map((d) => d.id)).toEqual(['AIC-001']);
    expect(filterDevices(devices, 'laptop').map((d) => d.id)).toEqual(['UC-001']);
    expect(filterDevices(devices, '').length).toBe(2);
  });
  it('requires all terms', () => {
    expect(scoreFields(['Example workstation'], ['example', 'dell'])).toBe(0);
  });
});

describe('platform detection', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', 0, 'ios', 'safari'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 5, 'ios', 'safari'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 0, 'macos', 'safari'],
    ['Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36', 5, 'android', 'chrome'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 Edg/140.0', 0, 'windows', 'edge'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 0, 'linux', 'firefox']
  ])('%s', (ua, touch, platform, browser) => {
    expect(detectPlatform(ua, touch)).toEqual({ platform, browser });
  });
});
