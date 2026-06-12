import { test, expect } from "../support/fixtures";
import { gotoApp, waitForStream } from "../support/helpers";

// SPEC §12 — SSE resilience: disconnect the stream and verify the client
// reconnects. Native EventSource auto-reconnects; the header connection dot
// reflects the transitions: "Live" (connected) -> "Reconnecting"/"Offline"
// (dropped) -> "Live" (recovered).
test.describe("SSE resilience", () => {
  test("reconnects after a network drop", async ({ page, context }) => {
    await gotoApp(page);
    await waitForStream(page);
    await expect(page.getByText("Live", { exact: true })).toBeVisible();

    // Sever the network: the EventSource errors and the dot leaves "Live".
    await context.setOffline(true);
    await expect
      .poll(
        async () => page.getByText("Live", { exact: true }).count(),
        { timeout: 20_000, message: "connection dot stayed Live while offline" },
      )
      .toBe(0);
    // It should advertise a non-connected state (retrying or offline).
    await expect(
      page.getByText(/Reconnecting|Offline/),
    ).toBeVisible();

    // Restore the network: EventSource auto-reconnects and the dot returns Live.
    await context.setOffline(false);
    await expect(page.getByText("Live", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
  });
});
