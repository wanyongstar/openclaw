// Scratch proof (not committed): drives the real chat detail panel in a real
// browser through a failed editor chunk load -> stable error state -> Retry ->
// editor mounts, capturing screenshots as public artifacts.
import { beforeAll, describe, expect, it } from "vitest";
import "../../../styles.css";
import "./chat-sidebar.ts";

const browserMode = "__vitest_browser__" in globalThis;
let page: (typeof import("vitest/browser"))["page"];

beforeAll(async () => {
  if (browserMode) {
    ({ page } = await import("vitest/browser"));
    const { i18n } = await import("../../../i18n/index.ts");
    await i18n.setLocale("en");
  }
});

type ProofPanel = HTMLElement & {
  content: unknown;
  updateComplete: Promise<unknown>;
  loadFileEditorModule: () => Promise<unknown>;
  fileEditorLoadFailed: boolean;
};

describe.runIf(browserMode)("editor chunk failure proof", () => {
  it("captures error state and retry recovery", async () => {
    const panel = document.createElement("openclaw-chat-detail-panel") as ProofPanel;
    let attempts = 0;
    panel.loadFileEditorModule = () => {
      attempts += 1;
      if (attempts === 1) {
        return Promise.reject(
          new TypeError("Failed to fetch dynamically imported module (stale chunk)"),
        );
      }
      return import("./file-editor-view.ts");
    };
    panel.content = {
      kind: "file",
      path: "src/notes.ts",
      name: "notes.ts",
      content: "const first = 1;\nconst second = 2;\n",
    };
    document.body.append(panel);

    // 1. Failure becomes terminal: error state rendered.
    await expect
      .poll(
        () => {
          const probe = panel as unknown as Record<string, unknown>;
          return {
            flag: panel.fileEditorLoadFailed,
            attempts,
            mount: Boolean(panel.querySelector(".file-view__mount")),
            kind: (probe.visibleContent as { kind?: string } | undefined)?.kind,
            loading: probe.fileEditorLoading,
          };
        },
        { timeout: 5_000 },
      )
      .toMatchObject({ flag: true });
    await panel.updateComplete;
    await page.screenshot({ path: "__proof__/01-chunk-failed-error-state.png" });

    // 2. No automatic retry across re-renders.
    for (let i = 0; i < 3; i++) {
      panel.requestUpdate();
      await panel.updateComplete;
    }
    expect(attempts).toBe(1);

    // 3. Deliberate Retry recovers once the chunk can load.
    const retryButton = panel.querySelector<HTMLButtonElement>(".file-view__loading .btn");
    expect(retryButton).not.toBeNull();
    retryButton!.click();
    await expect.poll(() => panel.querySelector(".cm-editor"), { timeout: 5_000 }).not.toBeNull();
    await panel.updateComplete;
    await page.screenshot({ path: "__proof__/02-retry-editor-mounted.png" });
    // Element-level shot: only succeeds if the CodeMirror editor DOM exists.
    await page.screenshot({
      path: "__proof__/03-codemirror-element.png",
      element: panel.querySelector(".cm-editor") as HTMLElement,
    });

    expect(attempts).toBe(2);
    panel.remove();
  });
});
