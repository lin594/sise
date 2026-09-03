import { expect, test } from "@playwright/test";
import { resolveBackendUrls } from "../../client/src/config/backend-urls";

test("secure pages default both backend channels to encrypted transport", () => {
  expect(resolveBackendUrls({ protocol: "https:", hostname: "cards.example.com" })).toEqual({
    httpUrl: "https://cards.example.com:2567",
    wsUrl: "wss://cards.example.com:2567",
  });
});

test("an explicit HTTPS API address derives its matching WSS endpoint", () => {
  expect(
    resolveBackendUrls({
      protocol: "https:",
      hostname: "cards.example.com",
      httpUrl: " https://api.example.com/game/ ",
    }),
  ).toEqual({
    httpUrl: "https://api.example.com/game",
    wsUrl: "wss://api.example.com/game",
  });
});

test("an explicit WSS endpoint derives its matching HTTPS API address", () => {
  expect(
    resolveBackendUrls({
      protocol: "https:",
      hostname: "cards.example.com",
      wsUrl: "wss://api.example.com/game/",
    }),
  ).toEqual({
    httpUrl: "https://api.example.com/game",
    wsUrl: "wss://api.example.com/game",
  });
});

test("the iMac-style HTTP deployment keeps HTTP and WS fallback transport", () => {
  expect(resolveBackendUrls({ protocol: "http:", hostname: "imac.tajuren.cn" })).toEqual({
    httpUrl: "http://imac.tajuren.cn:2567",
    wsUrl: "ws://imac.tajuren.cn:2567",
  });
});

test("IPv6 development hosts remain valid backend URLs", () => {
  expect(resolveBackendUrls({ protocol: "http:", hostname: "::1" })).toEqual({
    httpUrl: "http://[::1]:2567",
    wsUrl: "ws://[::1]:2567",
  });
});
