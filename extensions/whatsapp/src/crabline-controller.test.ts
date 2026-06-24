// Whatsapp tests cover Crabline fake controller wiring.
import { afterEach, describe, expect, it, vi } from "vitest";
import { getActiveWebListener } from "./active-listener.js";
import { whatsappPlugin } from "./channel.js";
import {
  createCrablineWhatsAppConnectionController,
  resolveCrablineWhatsAppConfig,
} from "./crabline-controller.js";

const mocks = vi.hoisted(() => {
  const listener = {
    sendComposingTo: vi.fn(async () => undefined),
    sendMessage: vi.fn(async () => ({
      kind: "text" as const,
      keys: [],
      messageId: "wamid.CRABLINE00000001",
      providerAccepted: true,
      toJid: "15551234567@s.whatsapp.net",
    })),
    sendPoll: vi.fn(async () => {
      throw new Error("poll unsupported");
    }),
    sendReaction: vi.fn(async () => {
      throw new Error("reaction unsupported");
    }),
  };
  return {
    createController: vi.fn(() => ({
      getActiveListener: () => listener,
      getCurrentSock: () => null,
      getSelfIdentity: () => ({
        e164: "+15550000000",
        jid: "15550000000@s.whatsapp.net",
        lid: null,
      }),
    })),
    listener,
  };
});

vi.mock("@openclaw/crabline", () => ({
  createOpenClawWhatsAppBaileysConnectionController: mocks.createController,
}));

const originalEnv = { ...process.env };

function restoreEnvValue(
  key:
    | "CRABLINE_WHATSAPP_ACCESS_TOKEN"
    | "CRABLINE_WHATSAPP_API_ROOT"
    | "CRABLINE_WHATSAPP_SELF_JID",
) {
  if (originalEnv[key] === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = originalEnv[key];
  }
}

afterEach(() => {
  mocks.createController.mockClear();
  mocks.listener.sendComposingTo.mockClear();
  mocks.listener.sendMessage.mockClear();
  restoreEnvValue("CRABLINE_WHATSAPP_ACCESS_TOKEN");
  restoreEnvValue("CRABLINE_WHATSAPP_API_ROOT");
  restoreEnvValue("CRABLINE_WHATSAPP_SELF_JID");
});

describe("WhatsApp Crabline fake controller", () => {
  it("resolves Crabline WhatsApp env only when required values are present", () => {
    expect(resolveCrablineWhatsAppConfig({})).toBeNull();
    expect(
      resolveCrablineWhatsAppConfig({
        CRABLINE_WHATSAPP_ACCESS_TOKEN: "token",
        CRABLINE_WHATSAPP_API_ROOT: "http://127.0.0.1:49152/crabline/whatsapp",
        CRABLINE_WHATSAPP_SELF_JID: "15550000000@s.whatsapp.net",
      }),
    ).toEqual({
      accessToken: "token",
      apiRoot: "http://127.0.0.1:49152/crabline/whatsapp",
      selfJid: "15550000000@s.whatsapp.net",
    });
  });

  it("loads the Crabline-owned Baileys controller factory", async () => {
    await expect(
      createCrablineWhatsAppConnectionController({
        accessToken: "token",
        apiRoot: "http://127.0.0.1:49152/crabline/whatsapp",
        selfJid: "15550000000@s.whatsapp.net",
      }),
    ).resolves.toMatchObject({
      getActiveListener: expect.any(Function),
      getCurrentSock: expect.any(Function),
      getSelfIdentity: expect.any(Function),
    });
    expect(mocks.createController).toHaveBeenCalledWith({
      accessToken: "token",
      apiRoot: "http://127.0.0.1:49152/crabline/whatsapp",
      selfJid: "15550000000@s.whatsapp.net",
    });
  });

  it("registers the Crabline active listener while the WhatsApp gateway account is running", async () => {
    process.env.CRABLINE_WHATSAPP_ACCESS_TOKEN = "crabline-whatsapp-access-token";
    process.env.CRABLINE_WHATSAPP_API_ROOT = "http://127.0.0.1:49152/crabline/whatsapp";
    process.env.CRABLINE_WHATSAPP_SELF_JID = "15550000000@s.whatsapp.net";
    const abort = new AbortController();
    const setStatus = vi.fn();
    const task = whatsappPlugin.gateway?.startAccount?.({
      abortSignal: abort.signal,
      account: {
        accountId: "default",
      },
      accountId: "default",
      cfg: {
        channels: {
          whatsapp: {
            enabled: true,
          },
        },
      },
      getStatus: () => ({}),
      log: { info: vi.fn() },
      runtime: {},
      setStatus,
    } as never);

    await expect(
      new Promise<void>((resolve, reject) => {
        const startedAt = Date.now();
        const interval = setInterval(() => {
          if (getActiveWebListener("default")) {
            clearInterval(interval);
            resolve();
            return;
          }
          if (Date.now() - startedAt > 1_000) {
            clearInterval(interval);
            reject(new Error("Crabline listener was not registered"));
          }
        }, 10);
      }),
    ).resolves.toBeUndefined();
    expect(setStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        connected: true,
        healthState: "healthy",
        linked: true,
        running: true,
      }),
    );
    expect(getActiveWebListener("default")).toBe(mocks.listener);

    abort.abort();
    await task;
    expect(getActiveWebListener("default")).toBeNull();
  });
});
