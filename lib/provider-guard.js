const rateBuckets = new Map();
const providerState = new Map();

const RATE_BUCKET_TTL_MS = 10 * 60 * 1000;
const CIRCUIT_STATE_TTL_MS = 30 * 60 * 1000;

function nowMs() {
  return Date.now();
}

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function shouldTrimRateBucket(entry, now = nowMs()) {
  if (!entry) return true;
  const resetAt = Number(entry.resetAt || 0);
  return !resetAt || now - resetAt > RATE_BUCKET_TTL_MS;
}

function shouldTrimProviderState(entry, now = nowMs()) {
  if (!entry) return true;
  const lastChangeAt = Number(entry.lastChangeAt || 0);
  return !lastChangeAt || now - lastChangeAt > CIRCUIT_STATE_TTL_MS;
}

function cleanupMaps() {
  const now = nowMs();
  for (const [key, value] of rateBuckets.entries()) {
    if (shouldTrimRateBucket(value, now)) {
      rateBuckets.delete(key);
    }
  }
  for (const [key, value] of providerState.entries()) {
    if (shouldTrimProviderState(value, now)) {
      providerState.delete(key);
    }
  }
}

export function buildRateIdentity(ctx = {}, fallback = "") {
  const candidates = [
    ctx?.senderPhone,
    ctx?.sender,
    ctx?.from,
    fallback,
  ]
    .map((value) => cleanText(value))
    .filter(Boolean);

  for (const raw of candidates) {
    if (raw.includes("@")) {
      const base = raw.split("@")[0].split(":")[0];
      if (base) return base;
    }
    if (raw) return raw;
  }

  return "anonymous";
}

export function checkRateLimit(options = {}) {
  cleanupMaps();

  const scope = cleanText(options.scope || "global");
  const limit = Math.max(1, Number(options.limit || 6));
  const windowMs = Math.max(1_000, Number(options.windowMs || 60_000));
  const now = nowMs();

  const current = rateBuckets.get(scope);
  if (!current || Number(current.resetAt || 0) <= now) {
    const entry = {
      count: 1,
      resetAt: now + windowMs,
      limit,
      windowMs,
    };
    rateBuckets.set(scope, entry);
    return {
      ok: true,
      remaining: Math.max(0, limit - entry.count),
      retryAfterMs: 0,
      limit,
      windowMs,
    };
  }

  current.count = Number(current.count || 0) + 1;
  current.limit = limit;
  current.windowMs = windowMs;

  const retryAfterMs = Math.max(0, Number(current.resetAt || 0) - now);
  const ok = current.count <= limit;
  return {
    ok,
    remaining: Math.max(0, limit - current.count),
    retryAfterMs: ok ? 0 : retryAfterMs,
    limit,
    windowMs,
  };
}

export function formatRetrySeconds(retryAfterMs = 0) {
  return Math.max(1, Math.ceil(Number(retryAfterMs || 0) / 1000));
}

function ensureProvider(name = "", options = {}) {
  const key = cleanText(name || "provider").toLowerCase();
  const failureThreshold = Math.max(1, Number(options.failureThreshold || 4));
  const cooldownMs = Math.max(5_000, Number(options.cooldownMs || 90_000));
  const now = nowMs();

  if (!providerState.has(key)) {
    providerState.set(key, {
      name: key,
      status: "closed",
      failures: 0,
      successes: 0,
      opens: 0,
      lastError: "",
      openedAt: 0,
      lastChangeAt: now,
      failureThreshold,
      cooldownMs,
    });
  }

  const state = providerState.get(key);
  state.failureThreshold = failureThreshold;
  state.cooldownMs = cooldownMs;
  return state;
}

export function getProviderGuardSnapshot() {
  cleanupMaps();
  const now = nowMs();
  return Array.from(providerState.values())
    .map((state) => {
      const openedAt = Number(state.openedAt || 0);
      const retryAfterMs =
        state.status === "open"
          ? Math.max(0, openedAt + Number(state.cooldownMs || 0) - now)
          : 0;
      return {
        name: state.name,
        status: state.status,
        failures: Number(state.failures || 0),
        successes: Number(state.successes || 0),
        opens: Number(state.opens || 0),
        retryAfterMs,
        failureThreshold: Number(state.failureThreshold || 0),
        cooldownMs: Number(state.cooldownMs || 0),
        lastError: String(state.lastError || ""),
        lastChangeAt: Number(state.lastChangeAt || 0),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function providerUnavailableError(providerName, retryAfterMs) {
  const error = new Error(
    `Servicio temporalmente no autorizado para ${providerName}. Reintenta en ${formatRetrySeconds(retryAfterMs)}s.`
  );
  error.code = "PROVIDER_CIRCUIT_OPEN";
  error.retryAfterMs = Number(retryAfterMs || 0);
  return error;
}

export function ensureProviderAvailable(name = "", options = {}) {
  cleanupMaps();

  const state = ensureProvider(name, options);
  const now = nowMs();
  if (state.status !== "open") {
    return { ok: true, state };
  }

  const retryAfterMs = Math.max(0, Number(state.openedAt || 0) + Number(state.cooldownMs || 0) - now);
  if (retryAfterMs > 0) {
    return { ok: false, state, retryAfterMs };
  }

  state.status = "half_open";
  state.lastChangeAt = now;
  return { ok: true, state };
}

export function recordProviderSuccess(name = "", options = {}) {
  const state = ensureProvider(name, options);
  state.status = "closed";
  state.failures = 0;
  state.successes = Number(state.successes || 0) + 1;
  state.lastError = "";
  state.openedAt = 0;
  state.lastChangeAt = nowMs();
}

export function recordProviderFailure(name = "", error, options = {}) {
  const state = ensureProvider(name, options);
  const now = nowMs();
  state.failures = Number(state.failures || 0) + 1;
  state.lastError = cleanText(error?.message || error || "provider_error").slice(0, 180);

  const thresholdReached =
    state.status === "half_open" ||
    Number(state.failures || 0) >= Number(state.failureThreshold || 1);

  if (thresholdReached) {
    state.status = "open";
    state.openedAt = now;
    state.opens = Number(state.opens || 0) + 1;
  }

  state.lastChangeAt = now;
}

export async function runWithProviderCircuit(name = "", task, options = {}) {
  const check = ensureProviderAvailable(name, options);
  if (!check.ok) {
    throw providerUnavailableError(name, check.retryAfterMs);
  }

  const shouldCountFailure =
    typeof options.shouldCountFailure === "function"
      ? options.shouldCountFailure
      : () => true;

  try {
    const value = await Promise.resolve().then(task);
    recordProviderSuccess(name, options);
    return value;
  } catch (error) {
    if (shouldCountFailure(error)) {
      recordProviderFailure(name, error, options);
    }
    throw error;
  }
}
