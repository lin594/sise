# iMac Private Same-Origin Gateway Implementation Plan

> Status: completed and verified on the iMac HTTP/WS test environment. Production TLS remains a separate HTTPS/WSS deployment path.

**Goal:** Provide a memorable no-port private试玩入口 while keeping the game API and WebSocket behind the existing Web container.

### Task 1: Add proxy regression coverage

- Add a configuration test that renders the iMac Compose override and verifies ports, build-time URLs, trusted proxy depth and CORS origins.
- Add an Nginx syntax/container smoke that checks static content, `/health`, HTTP matchmaking and WebSocket upgrade routing.

### Task 2: Implement the gateway

- Update `client/nginx/default.conf` with explicit game backend locations and WebSocket headers.
- Add `docker-compose.imac.yml` using Compose `!override` to expose Web on 80/3000 and remove the server host port.
- Add root scripts for validated iMac config and deployment.
- Change the live recovery smoke defaults to the no-port same-origin backend.

### Task 3: Document and verify

- Update deployment and testing docs without describing the private HTTP endpoint as TLS-secure.
- Build both images, validate Compose output, and run local proxy/browser coverage.
- Push, deploy with the iMac override, verify port 80/page/API/WebSocket, confirm 2567 is not listening, then rerun live recovery.
- Archive this design and implementation plan after deployment verification.
