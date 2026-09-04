# Readable Turn Signals Implementation Plan

> 已实施并归档；当前规范以 `docs/README.md` 所列权威文档为准。

**Goal:** Make every decision-critical turn marker legible to older players on the 568×320 effective canvas without adding table clutter.

### Task 1: Add measurable regression coverage

- Extend the existing compact and legacy mobile Playwright flows.
- Measure current-turn, pending-card, directional action, dealer, self and history-count labels.
- Require 13px for decision-critical labels and 10px for the deck unit.

### Task 2: Raise only essential typography floors

- Update `GameBoard.vue` compact typography for turn tags, response captions, directional action labels, dealer/self badges and the deck unit.
- Update `GameTools.vue` history-count typography.
- Preserve existing card geometry, center-axis placement and secondary color seals.

### Task 3: Verify and document

- Build the client and run focused 568×320, 320×568, 667×375 and desktop Playwright coverage.
- Run the full Playwright suite after focused checks.
- Update canonical UX/testing documents, archive this plan, push and deploy to iMac for a final visual measurement.
