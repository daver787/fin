import { test, expect } from "@playwright/test";
import { gotoApp, waitForStream, getPortfolio } from "../support/helpers";

// SPEC §12 — AI chat (mocked, LLM_MOCK=true): send a message, receive a
// response, and see trade execution appear inline. The backend auto-executes
// any trades the (mocked, deterministic) assistant returns and echoes them in
// the /api/chat response, which the chat panel renders as inline chips.
test.describe("AI chat (mocked)", () => {
  // The chat sidebar is expanded by default and posts to /api/chat.
  const chat = (page: import("@playwright/test").Page) =>
    page.locator("aside").filter({ hasText: "FinAlly Assistant" });

  test("send a message and receive a response", async ({ page }) => {
    await gotoApp(page);

    const panel = chat(page);
    await panel.getByPlaceholder("Message FinAlly…").fill("How am I doing?");
    await panel.getByRole("button", { name: "Send", exact: true }).click();

    // The user's message echoes into the transcript...
    await expect(panel.getByText("How am I doing?")).toBeVisible();
    // ...the thinking indicator clears...
    await expect(panel.getByRole("status")).toHaveCount(0, { timeout: 20_000 });
    // ...and an assistant reply bubble (distinct from our echoed message) lands.
    await expect
      .poll(
        async () => panel.locator("div.rounded-lg").count(),
        { timeout: 20_000, message: "no assistant reply rendered" },
      )
      .toBeGreaterThan(1);
  });

  test("inline trade execution from a chat request", async ({
    page,
    request,
  }) => {
    await gotoApp(page);
    await waitForStream(page);

    const before = await getPortfolio(request);

    const panel = chat(page);
    await panel
      .getByPlaceholder("Message FinAlly…")
      .fill("Buy 5 shares of AAPL for me");
    await panel.getByRole("button", { name: "Send", exact: true }).click();

    await expect(panel.getByRole("status")).toHaveCount(0, { timeout: 20_000 });

    // The executed trade surfaces inline as a confirmation chip. Chips render
    // "✓ <side> <qty> <ticker>" (uppercased via CSS), so match the ticker text
    // inside the chat panel.
    await expect(
      panel.getByText(/AAPL/).first(),
    ).toBeVisible({ timeout: 20_000 });

    // And the auto-execution actually moved the portfolio: a new/updated AAPL
    // position exists and cash dropped (SPEC §9 auto-execute).
    await expect
      .poll(
        async () => {
          const p = await getPortfolio(request);
          const pos = p.positions.find((x) => x.ticker === "AAPL");
          return (pos?.quantity ?? 0) > 0 && p.cash_balance < before.cash_balance;
        },
        {
          timeout: 20_000,
          message: "chat-initiated trade was not auto-executed",
        },
      )
      .toBeTruthy();
  });
});
