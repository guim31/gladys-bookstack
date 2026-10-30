// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys (a real GladysIntegration on an
// in-memory transport), the integration wired on it by registerHandlers, and
// a fake BookStack.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { MemoryStore } from '../../src/store.js';
import {
  HOST,
  INSTANCE,
  NOW,
  TOKEN_ID,
  TOKEN_SECRET,
  createBookStack,
  settle,
} from './fakeBookStack.js';

export const FAST_TIMINGS = { widgetGap: 0, requestTimeout: 200 };
export const CONFIG = { url: HOST, token_id: TOKEN_ID, token_secret: TOKEN_SECRET };

export async function createWorld({
  server = createBookStack(),
  config = CONFIG,
  devices = [],
  connect = true,
  store = new MemoryStore(),
  clock = { now: NOW },
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    fetch: server.fetch,
    timings: FAST_TIMINGS,
    now: () => clock.now,
    store,
  });
  if (connect) {
    await gladys.connect();
    await settle(20);
  }
  return { gladys, app, hub: app.hub, server, store, clock, fake: gladys.fake };
}

export const mainDevice = `ext:test-integration:bookstack:${INSTANCE}`;
export const mainFeature = (key) => `${mainDevice}:${key}`;
export const bookDevice = (id) => `ext:test-integration:book:${INSTANCE}_${id}`;

/** Add every discovered device to Gladys, as the user would. */
export async function createAll(fake) {
  for (const device of fake.discoveredDevices) {
    await fake.deviceCreated(device);
  }
  await settle();
}
