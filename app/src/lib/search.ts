/** Small in-memory search across devices, software and documents. No data leaves the device. */
import type { DocEntry, HubData, SoftwareRecord } from './content';
import { categoryLabels, type Device } from './inventory';
import { markdownToText } from './markdown';

export type SearchHit =
  | { kind: 'device'; id: string; title: string; subtitle: string; route: string; score: number }
  | { kind: 'software'; id: string; title: string; subtitle: string; route: string; score: number }
  | { kind: 'doc'; id: string; title: string; subtitle: string; route: string; score: number; excerpt?: string };

export function normalise(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

export function tokens(query: string): string[] {
  return normalise(query).split(/\s+/).filter((t) => t.length > 0).slice(0, 8);
}

/** Every token must occur; earlier and whole-field matches score higher. */
export function scoreFields(fields: (string | undefined)[], terms: string[]): number {
  if (terms.length === 0) return 0;
  const hay = fields.filter(Boolean).map((f) => normalise(f!));
  let score = 0;
  for (const t of terms) {
    let best = 0;
    hay.forEach((h, i) => {
      const at = h.indexOf(t);
      if (at === -1) return;
      const weight = 10 / (i + 1);
      best = Math.max(best, weight * (h === t ? 3 : at === 0 ? 2 : 1));
    });
    if (best === 0) return 0;
    score += best;
  }
  return score;
}

export function deviceFields(d: Device): string[] {
  return [
    d.id,
    d.name,
    ...d.aliases,
    d.hostname,
    categoryLabels[d.category],
    d.lifecycle,
    d.hardware.manufacturer,
    d.hardware.model,
    d.hardware.cpu,
    d.hardware.gpu,
    d.snapshot?.model ?? '',
    d.snapshot?.cpu.map((c) => c.name).join(' ') ?? '',
    d.snapshot?.gpu.map((g) => g.name).join(' ') ?? '',
    d.snapshot?.os.caption ?? '',
    d.assignedTo ?? '',
    d.role ?? ''
  ];
}

export function filterDevices(devices: Device[], query: string): Device[] {
  const terms = tokens(query);
  if (terms.length === 0) return devices;
  return devices
    .map((d) => ({ d, s: scoreFields(deviceFields(d), terms) }))
    .filter((x) => x.s > 0)
    .sort((a, z) => z.s - a.s)
    .map((x) => x.d);
}

export function filterSoftware(software: SoftwareRecord[], query: string): SoftwareRecord[] {
  const terms = tokens(query);
  if (terms.length === 0) return software;
  return software.filter((s) => scoreFields([s.name, s.publisher, ...s.versions.map((v) => v.version), ...s.deviceIds], terms) > 0);
}

function excerpt(text: string, term: string): string | undefined {
  const at = normalise(text).indexOf(term);
  if (at === -1) return undefined;
  const start = Math.max(0, at - 50);
  return (start > 0 ? '... ' : '') + text.slice(start, at + 90).trim() + ' ...';
}

export function docRoute(doc: Pick<DocEntry, 'repository' | 'path'>): string {
  return `#/hub/docs/${encodeURIComponent(doc.repository)}/${doc.path.split('/').map(encodeURIComponent).join('/')}`;
}

export function searchAll(data: HubData, query: string, limit = 30): SearchHit[] {
  const terms = tokens(query);
  if (terms.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const d of data.devices) {
    const score = scoreFields(deviceFields(d), terms);
    if (score > 0) hits.push({ kind: 'device', id: d.id, title: `${d.id} - ${d.name}`, subtitle: categoryLabels[d.category], route: `#/hub/devices/${encodeURIComponent(d.id)}`, score: score + 5 });
  }
  for (const s of data.software) {
    const score = scoreFields([s.name, s.publisher], terms);
    const route = s.standard?.id ? `#/hub/software/${encodeURIComponent(s.standard.id)}` : `#/hub/software?q=${encodeURIComponent(s.name)}`;
    if (score > 0) hits.push({ kind: 'software', id: s.name, title: s.name, subtitle: `${s.deviceIds.length} device(s)`, route, score });
  }
  for (const doc of data.docs) {
    const text = markdownToText(doc.content);
    const score = scoreFields([doc.title, doc.path, text], terms);
    if (score > 0) hits.push({ kind: 'doc', id: doc.key, title: doc.title, subtitle: doc.path, route: docRoute(doc), score, excerpt: excerpt(text, terms[0]!) });
  }
  return hits.sort((a, z) => z.score - a.score).slice(0, limit);
}
