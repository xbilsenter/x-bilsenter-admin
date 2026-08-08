'use strict';

const MERKER = require('../merker.json');

function normalizeMerkerList(stored, defaults) {
  const defaultsList = Array.isArray(defaults) && defaults.length ? defaults : MERKER;
  const base = Array.isArray(stored)
    ? stored.map(function (m) { return String(m || '').trim(); }).filter(Boolean)
    : [];
  const seen = new Set(base.map(function (m) { return m.toLowerCase(); }));

  defaultsList.forEach(function (m) {
    const label = String(m || '').trim();
    if (!label) return;
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    base.push(label);
  });

  const annet = base.filter(function (m) { return m.toLowerCase() === 'annet'; });
  const rest = base.filter(function (m) { return m.toLowerCase() !== 'annet'; });
  rest.sort(function (a, b) { return a.localeCompare(b, 'nb'); });
  return annet.length ? rest.concat(['Annet']) : rest;
}

function buildMerkeOptions(merker, extras) {
  const merged = normalizeMerkerList(merker, []);
  const seen = new Set(merged.map(function (m) { return m.toLowerCase(); }));
  const toAdd = [];

  (Array.isArray(extras) ? extras : [extras]).forEach(function (item) {
    const s = String(item || '').trim();
    if (!s) return;
    const key = s.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    toAdd.push(s);
  });

  if (!toAdd.length) return merged;

  const withoutAnnet = merged.filter(function (m) { return m.toLowerCase() !== 'annet'; });
  const hasAnnet = merged.some(function (m) { return m.toLowerCase() === 'annet'; });
  withoutAnnet.push.apply(withoutAnnet, toAdd.sort(function (a, b) { return a.localeCompare(b, 'nb'); }));
  if (hasAnnet) withoutAnnet.push('Annet');
  return withoutAnnet;
}

function resolveMerkeFromLists(merke, merker) {
  const normalized = String(merke || '').trim();
  if (!normalized) return 'Annet';

  const exact = merker.find(function (m) {
    return m.toLowerCase() === normalized.toLowerCase();
  });
  if (exact) return exact;

  const partial = merker.find(function (m) {
    const a = m.toLowerCase();
    const b = normalized.toLowerCase();
    return a.includes(b) || b.includes(a);
  });
  if (partial) return partial;

  return normalized;
}

module.exports = {
  MERKER,
  normalizeMerkerList,
  buildMerkeOptions,
  resolveMerkeFromLists
};
