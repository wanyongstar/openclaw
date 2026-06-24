// Whatsapp plugin module wires the Crabline-owned WhatsApp fake controller.
import type { WhatsAppConnectionControllerHandle } from "./connection-controller-registry.js";

export type CrablineWhatsAppConfig = {
  accessToken: string;
  apiRoot: string;
  selfJid?: string | undefined;
};

type CrablineWhatsAppControllerFactory = (
  config: CrablineWhatsAppConfig,
) => WhatsAppConnectionControllerHandle;

type CrablineModuleWithWhatsApp = typeof import("@openclaw/crabline") & {
  createOpenClawWhatsAppBaileysConnectionController?: CrablineWhatsAppControllerFactory;
};

function readString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return undefined;
}

export function resolveCrablineWhatsAppConfig(
  env: NodeJS.ProcessEnv = process.env,
): CrablineWhatsAppConfig | null {
  const apiRoot = env.CRABLINE_WHATSAPP_API_ROOT?.trim();
  const accessToken = env.CRABLINE_WHATSAPP_ACCESS_TOKEN?.trim();
  const selfJid = readString(env.CRABLINE_WHATSAPP_SELF_JID);
  if (!apiRoot || !accessToken) {
    return null;
  }
  return {
    accessToken,
    apiRoot,
    ...(selfJid ? { selfJid } : {}),
  };
}

export async function createCrablineWhatsAppConnectionController(
  config: CrablineWhatsAppConfig,
): Promise<WhatsAppConnectionControllerHandle> {
  const crabline = (await import("@openclaw/crabline")) as CrablineModuleWithWhatsApp;
  const createController = crabline.createOpenClawWhatsAppBaileysConnectionController;
  if (!createController) {
    throw new Error(
      "@openclaw/crabline does not export createOpenClawWhatsAppBaileysConnectionController. Update @openclaw/crabline to a version with WhatsApp fake-provider support.",
    );
  }
  return createController(config);
}
