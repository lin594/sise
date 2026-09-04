import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

function pngInfo(bytes: Buffer): { width: number; height: number; colorType: number } {
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType: bytes[25],
  };
}

test("publishes a recognizable browser and home-screen identity", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/site.webmanifest");
  await expect(page.locator('link[rel="icon"][href="/favicon.ico"]')).toHaveCount(1);
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute("href", "/favicon.svg");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/icons/sise-180.png");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0b1220");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /四人|四色牌/u);

  const manifestResponse = await page.request.get("/site.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  expect(manifestResponse.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({
    id: "/",
    name: "四色牌",
    short_name: "四色牌",
    lang: "zh-CN",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#0b1220",
  });
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: "/icons/sise-192.png", sizes: "192x192", type: "image/png" }),
    expect.objectContaining({ src: "/icons/sise-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }),
  ]));

  for (const [src, size] of [
    ["/icons/sise-180.png", 180],
    ["/icons/sise-192.png", 192],
    ["/icons/sise-512.png", 512],
  ] as const) {
    const response = await page.request.get(src);
    expect(response.ok(), `${src} should be available`).toBe(true);
    expect(response.headers()["content-type"]).toBe("image/png");
    expect(pngInfo(await response.body())).toEqual({ width: size, height: size, colorType: 2 });
  }

  const legacyIconResponse = await page.request.get("/favicon.ico");
  expect(legacyIconResponse.ok()).toBe(true);
  expect(legacyIconResponse.headers()["content-type"]).toMatch(/image\/(?:x-icon|vnd\.microsoft\.icon)/u);
});

test("does not disguise missing icon files as the app shell", async () => {
  const nginxConfig = await readFile(path.join(process.cwd(), "client/nginx/default.conf"), "utf8");

  expect(nginxConfig).toMatch(/location\s+~\*\s+\\\.\(\?:css\|js\|ico\|svg\|png\)\$[\s\S]*?try_files\s+\$uri\s+=404;/u);
  expect(nginxConfig).toMatch(/location\s+=\s+\/site\.webmanifest[\s\S]*?default_type\s+application\/manifest\+json;[\s\S]*?try_files\s+\$uri\s+=404;/u);

  const sourceFiles = await Promise.all([
    "client/src/main.ts",
    "client/src/App.vue",
  ].map((relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8")));
  expect(sourceFiles.join("\n")).not.toContain("serviceWorker.register");
});
