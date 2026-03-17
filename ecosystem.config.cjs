const path = require("path");

const settings = require("./settings/settings.json");

function clampSlots(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 15;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

const maxSlots = clampSlots(settings?.subbot?.maxSlots || settings?.subbots?.length || 15);
const cwd = __dirname;

const baseApp = {
  cwd,
  script: path.join(cwd, "index.js"),
  interpreter: "node",
  autorestart: true,
  watch: false,
  max_memory_restart: "700M",
  env: {
    NODE_ENV: process.env.NODE_ENV || "production",
  },
};

const apps = [
  {
    ...baseApp,
    name: "dvyer-main",
    env: {
      ...baseApp.env,
      BOT_INSTANCE: "main",
    },
  },
];

for (let slot = 1; slot <= maxSlots; slot += 1) {
  apps.push({
    ...baseApp,
    name: `dvyer-subbot-${slot}`,
    env: {
      ...baseApp.env,
      BOT_INSTANCE: `subbot${slot}`,
    },
  });
}

module.exports = {
  apps,
};
