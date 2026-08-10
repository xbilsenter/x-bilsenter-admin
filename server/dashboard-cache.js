'use strict';

const TTL_MS = Number(process.env.DASHBOARD_CACHE_TTL_MS || 45000);
let cache = null;

function getDashboardCache() {
  if (!cache) return null;
  if (Date.now() > cache.expiresAt) {
    cache = null;
    return null;
  }
  return cache.payload;
}

function setDashboardCache(payload) {
  cache = {
    payload: payload,
    expiresAt: Date.now() + TTL_MS
  };
}

function clearDashboardCache() {
  cache = null;
}

module.exports = {
  getDashboardCache,
  setDashboardCache,
  clearDashboardCache
};
