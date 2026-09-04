<template>
  <main
    class="layout"
    :class="{
      playing: isPlaying,
      'compact-viewport': isCompactViewport,
      'ultra-compact-viewport': isUltraCompactViewport,
      'legacy-compact-viewport': isLegacyCompactViewport,
      'compact-landscape': isCompactViewport && isPlaying,
      'rotated-phone-portrait': isRotatedPhonePortrait,
      'game-tools-active': showGameTools,
      'reduce-motion': displayPreferences.reduceMotion,
    }"
    :data-effective-viewport="`${effectiveWidth}x${effectiveHeight}`"
    :data-rotated-phone-portrait="isRotatedPhonePortrait ? 'true' : 'false'"
    :data-reduce-motion="displayPreferences.reduceMotion ? 'true' : 'false'"
    :data-connection-state="connectionState"
    :style="{
      '--physical-viewport-width': `${viewportWidth}px`,
      '--physical-viewport-height': `${viewportHeight}px`,
    }"
  >
    <header
      class="top"
      :class="{ 'game-control-header': showGameTools }"
      :data-testid="showGameTools ? 'game-control-header' : undefined"
    >
      <div class="top-brand">
        <div class="brand-lockup">
          <span class="brand-suits" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <h1>四色牌</h1>
        </div>
        <p v-if="!showGameTools" class="top-slogan">象棋魂·麻将韵·纸牌趣——四色牌，一局见真章！</p>
      </div>
      <ConnectionStatus
        v-if="(hasLobbySession || isConnectingWithoutState) && !showSyncingScreen"
        :state="connectionState"
        :attempt="reconnectAttempt"
        :message="joinError"
        :show-connected="!showGameTools"
        @retry="retryConnection"
      />
      <GameTools
        ref="gameToolsRef"
        v-if="showGameTools"
        v-model="displayPreferences"
        :decision-active="settingsDecisionActive"
        :action-logs="actionLogs"
        :players="players"
        :my-seat-id="mySeatId"
        :auto-play="Boolean(mePlayer?.isAutoPlay)"
        :auto-play-pending="isEnded && !Boolean(mePlayer?.isAutoPlay)"
        :spoken-turn-guidance-supported="spokenTurnGuidanceSupported"
        :screen-wake-lock-supported="screenWakeLockSupported"
        @open-rules="openRules"
        @set-auto-play="setAutoPlay"
        @exit="handleLeaveRoom"
      />
      <div
        class="meta"
        :class="{ 'front-lobby-meta': showModeLobby }"
        v-if="!hasLobbySession && !isConnectingWithoutState"
      >
        <span v-if="showModeLobby" class="front-lobby-identity">昵称：<strong>{{ entryName }}</strong></span>
        <button
          v-if="showModeLobby"
          class="ghost reset-btn change-name"
          type="button"
          data-testid="change-entry-name"
          :disabled="enteringLobby"
          @click="returnToEntry"
        >修改昵称</button>
        <button class="ghost reset-btn" type="button" data-testid="open-rules" @click="openRules">查看规则</button>
      </div>
    </header>
    <p v-if="globalError && !showSyncingScreen" class="error global-error" role="alert">{{ globalError }}</p>
    <p
      v-else-if="globalNotice"
      class="global-notice"
      role="status"
      aria-live="polite"
      data-testid="global-notice"
    >{{ globalNotice }}</p>

    <LoginPage
      v-if="showEntry"
      :nickname="entryName"
      :entering="enteringLobby"
      :primary-label="entryPrimaryLabel"
      :friend-invite="hasFriendInvite"
      :history-names="nicknameHistory"
      :storage-persistent="browserStoragePersistent"
      @update:nickname="entryName = $event"
      @submit="enterLobby"
      @randomize="randomizeNickname"
      @select-history="entryName = $event"
    />

    <LobbyPage
      ref="lobbyPageRef"
      v-else-if="showModeLobby"
      :kicker="isWaiting ? '房间页' : '大厅页'"
      :title="lobbyTitle"
      :subtitle="lobbySubtitle"
      :modes="state ? [] : lobbyModes"
      :selected-mode="selectedLobbyMode"
      :can-start="canStartSelectedMode"
      :start-label="lobbyStartLabel"
      :start-hint="lobbyStartHint"
      :start-pending="enteringLobby && !hasLobbySession"
      :join-error="joinError"
      :host-player-id="state?.hostPlayerId || ''"
      :my-seat-id="mySeatId"
      :is-host="isHost"
      :room-id="activeRoomId"
      :room-mode="state?.roomMode || ''"
      :match-seconds-left="matchSecondsLeft"
      :scoring-mode="state?.scoringMode || 'single'"
      :completed-rounds="state?.completedRounds || 0"
      :guest-profile-summary="guestProfileSummary"
      :guest-profile-name="guestProfile?.nickname || entryName"
      :guest-profile-rounds="guestProfile?.roundsPlayed || 0"
      :guest-profile-wins="guestProfile?.huWins || 0"
      :guest-profile-score="guestProfile?.totalScore || 0"
      :players="players"
      :can-share-invite="canShareInvite"
      :invite-pending="inviteActionPending"
      @start="startSelectedMode"
      @select-mode="selectedLobbyMode = $event as LobbyModeId"
      @copy-invite="copyInviteLink"
      @show-invite-qr="showInviteQr"
      @claim-seat="claimSeat"
      @add-bot="addBot($event, 50)"
      @fill-bots="fillBots"
      @update-bot="updateBot"
      @remove-seat="removeSeat"
      @leave-room="handleLeaveRoom"
      @dissolve-room="dissolveRoom"
      @set-scoring-mode="setScoringMode"
      @set-lobby-ready="setLobbyReady"
    />

    <section v-else-if="showSyncingScreen" class="sync-shell">
      <div class="sync-card" data-testid="resume-session-screen">
        <div class="sync-message" role="status" aria-live="polite">
          <p class="entry-kicker">{{ syncScreenCopy.kicker }}</p>
          <h2>{{ syncScreenCopy.title }}</h2>
          <p class="entry-desc">{{ syncScreenCopy.description }}</p>
        </div>
        <button class="resume-cancel" type="button" data-testid="cancel-session-resume" @click="abandonSessionResume">
          {{ syncScreenCopy.cancelLabel }}
        </button>
      </div>
    </section>

    <template v-else>
      <GameBoard
        :state="state"
        :players="players"
        :private-hand="privateHand"
        :my-seat-id="mySeatId"
        :can-discard="canDiscard"
        :actions="availableActions"
        :can-act="canAct"
        :is-current-turn="isMyTurn"
        :response-phase="state?.responsePhase || ''"
        :current-player-name="currentPlayerName"
        :turn-hint="turnHint"
        :interaction-paused-message="interactionPausedMessage"
        :can-request-more-time="decisionTimer.canRequestMoreTime"
        :decision-untimed="decisionTimer.untimed"
        :more-time-seconds="decisionTimer.extensionSeconds"
        :decision-timer-total-ms="decisionTimer.totalMs"
        :decision-timer-ends-at="decisionTimer.endsAt"
        :decision-key="decisionTimer.decisionKey"
        :action-feedback="actionFeedback"
        :ultra-compact="isUltraCompactViewport"
        :own-card-mode="resolvedOwnCardMode"
        :table-card-mode="resolvedTableCardMode"
        :seat-direction="displayPreferences.seatDirection"
        :selection-mode="selectionMode"
        :selected-candidate-id="selectedCandidateId"
        :active-candidates="activeCandidates"
        @discard-card="sendDiscardCard"
        @submit-action="onPanelSubmit"
        @request-more-time="requestMoreTime"
        @selection-change="onPanelSelectionChange"
      />
    </template>

    <InviteLinkFallbackDialog
      v-if="inviteCopyFallbackUrl"
      :url="inviteCopyFallbackUrl"
      @close="closeInviteCopyFallback"
    />

    <FriendInviteQrDialog
      v-if="inviteQrUrl"
      :url="inviteQrUrl"
      :room-id="inviteQrRoomId"
      @close="closeInviteQr"
    />

    <div v-if="isPlaying && selectionMode" class="candidate-mask" @click.self="clearSelection(true)">
      <div
        ref="candidatePanelRef"
        class="candidate-panel"
        data-testid="candidate-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="candidate-panel-title"
        aria-describedby="candidate-panel-description"
        tabindex="-1"
        @keydown.esc.stop.prevent="clearSelection(true)"
        @keydown.tab="trapCandidateFocus"
      >
        <div class="candidate-head">
          <h3 id="candidate-panel-title">{{ actionText(selectionMode) }}候选牌组</h3>
          <button ref="candidateCancelButtonRef" class="ghost" data-testid="candidate-cancel" @click="clearSelection(true)">取消</button>
        </div>
        <p id="candidate-panel-description" class="candidate-desc">{{ candidatePromptText }}</p>
        <div v-if="activeCandidates.length" class="candidate-list">
          <button
            v-for="(candidate, index) in activeCandidates"
            :key="candidate.id"
            class="candidate-item"
            data-testid="candidate-option"
            :class="{ selected: selectedCandidateId === candidate.id }"
            @click="submitCandidate(candidate.id)"
          >
            <span class="candidate-title">{{ index + 1 }}. {{ candidate.title }}</span>
            <div class="candidate-cards-preview">
              <div class="preview-col target" v-if="candidateTargetCard">
                <small>目标牌</small>
                <CardComp :card="candidateTargetCard" size="sm" :mode="resolvedTableCardMode" />
              </div>
              <div class="preview-col group">
                <small>组合牌</small>
                <div v-if="candidateGroupCards(candidate).length" class="preview-cards">
                  <CardComp
                    v-for="card in candidateGroupCards(candidate)"
                    :key="`cand-${candidate.id}-${card.id}`"
                    :card="card"
                    size="sm"
                    :mode="resolvedOwnCardMode"
                  />
                </div>
                <small v-else class="candidate-raw">{{ candidate.cardIds.join("、") || "无需手牌" }}</small>
              </div>
            </div>
            <small>{{ candidateSourceText(candidate.source) }}</small>
          </button>
        </div>
        <p v-else class="candidate-empty">当前没有可选牌组</p>
      </div>
    </div>

    <DeclarationPanel
      v-if="shouldShowDeclarePanel"
      :hand="privateHand"
      :submitted="isDeclareSubmitted"
      :hand-ready="privateHandSynchronized"
      :seconds-left="declareSecondsLeft"
      :progress-percent="declareProgressPercent"
      :server-error="declareError"
      :connection-ready="connected"
      :compact="isCompactViewport"
      :ultra-compact="isUltraCompactViewport"
      :card-mode="resolvedOwnCardMode"
      :can-request-more-time="decisionTimer.canRequestMoreTime"
      :untimed="decisionTimer.untimed"
      :more-time-seconds="decisionTimer.extensionSeconds"
      :decision-key="decisionTimer.decisionKey"
      @submit="submitDeclaration"
      @request-more-time="requestMoreTime"
    />

    <div v-if="showEndPanel" class="hu-mask">
      <div
        ref="settlementPanelRef"
        class="hu-panel"
        data-testid="settlement-panel"
        role="dialog"
        aria-labelledby="settlement-panel-title"
        :aria-busy="!settlementReady"
        tabindex="-1"
      >
        <div class="settlement-fixed-head">
          <h2 id="settlement-panel-title">{{ endPanelTitle }}</h2>
          <div v-if="!settlementReady" class="settlement-loading" data-testid="settlement-loading" role="status" aria-live="polite">
            <strong>正在整理本局得分…</strong>
            <span>请稍候，结算完成后才能开始下一局。</span>
          </div>
          <div v-else class="round-overview" data-testid="round-overview" role="status" aria-live="polite">
            <small v-if="isCumulativeSettlement" class="round-number">本桌第 {{ settlementRoundNumber }} 局</small>
            <strong>{{ roundOutcomeText }}</strong>
            <span v-if="mySettlementPlayer">
              你本局 <b :class="scoreToneClass(mySettlementPlayer.totalScore)">{{ signedScore(mySettlementPlayer.totalScore) }}分</b>
            </span>
            <span v-if="isCumulativeSettlement && mySettlementPlayer" class="cumulative-overview">
              你本桌累计
              <b :class="scoreToneClass(mySettlementPlayer.cumulativeScore)">{{ signedScore(mySettlementPlayer.cumulativeScore) }}分</b>
            </span>
            <small>你的结果排在最前面，点击玩家可查看牌和得分明细。</small>
          </div>
        </div>

        <div
          v-if="settlementReady"
          class="settlement-scroll-region"
          data-testid="settlement-scroll-region"
          role="region"
          aria-label="各家结算与计分明细"
          tabindex="0"
        >
          <p v-if="!derivedWinnerId">{{ endSummary }}</p>
          <p v-if="roundDealerCard" class="end-global-info">本局定庄牌: {{ cardLabel(roundDealerCard) }}</p>

          <section v-if="settlementPlayers.length" class="settlement settlement-player-section">
            <h3>各家结算</h3>
            <div class="settlement-list">
              <details
                v-for="p in orderedSettlementPlayers"
                :key="`settle-${p.clientId}`"
                class="settlement-item"
                :class="{ winner: isSettlementWinner(p) }"
                :open="!isCompactViewport"
              >
                <summary class="settlement-head" data-testid="settlement-player-summary">
                  <span class="settlement-person">
                    <strong class="settlement-name">
                      {{ p.name }}<span v-if="p.isConfiguredBot" class="settlement-bot-badge" data-testid="settlement-bot-identity">机器人</span><span v-if="p.clientId === mySeatId">（你）</span><span v-if="isSettlementWinner(p)"> · 赢家</span>
                    </strong>
                    <small class="settlement-meta">
                      手牌 {{ p.hand.length }} 张 · 牌组 {{ settlementGroupBlocks(p).length }} 组 · 流水 {{ p.discardCount }} 张
                    </small>
                  </span>
                  <span class="settlement-result">
                    <small v-if="isCumulativeSettlement" class="score-caption">本局</small>
                    <strong class="score-total" :class="scoreToneClass(p.totalScore)">{{ signedScore(p.totalScore) }}分</strong>
                    <small v-if="isCumulativeSettlement" class="cumulative-total" :class="scoreToneClass(p.cumulativeScore)">
                      累计 {{ signedScore(p.cumulativeScore) }}分
                    </small>
                    <small class="settlement-toggle-label" aria-hidden="true">
                      <span class="settlement-toggle-closed">查看明细</span>
                      <span class="settlement-toggle-open">收起明细</span>
                    </small>
                  </span>
                </summary>

                <div class="settlement-item-body">
                  <div class="settlement-zone">
                    <p class="zone-title">牌组区</p>
                    <div class="settlement-group-list" v-if="settlementGroupBlocks(p).length">
                      <div
                        v-for="group in settlementGroupBlocks(p)"
                        :key="`settle-group-${p.clientId}-${group.id}`"
                        class="settlement-group"
                        :class="group.tone"
                      >
                        <span v-if="group.badge" class="settlement-group-badge">{{ group.badge }}</span>
                        <div class="settlement-cards compact">
                          <CardComp
                            v-for="card in group.cards"
                            :key="`settle-e-${p.clientId}-${group.id}-${card.id}`"
                            :card="card"
                            size="sm"
                            :mode="resolvedTableCardMode"
                          />
                        </div>
                      </div>
                    </div>
                    <p v-else class="settlement-empty">（无）</p>
                  </div>

                  <div class="settlement-zone">
                    <p class="zone-title">手牌区</p>
                    <div class="settlement-group-list" v-if="settlementHandBlocks(p).length">
                      <div
                        v-for="group in settlementHandBlocks(p)"
                        :key="`settle-hand-${p.clientId}-${group.id}`"
                        class="settlement-group"
                        :class="group.tone"
                      >
                        <span v-if="group.badge" class="settlement-group-badge">{{ group.badge }}</span>
                        <div class="settlement-cards compact">
                          <CardComp
                            v-for="card in group.cards"
                            :key="`settle-hg-${p.clientId}-${group.id}-${card.id}`"
                            :card="card"
                            size="sm"
                            :mode="settlementHandCardMode(p.clientId)"
                          />
                        </div>
                      </div>
                    </div>
                    <div class="settlement-cards" v-else-if="p.hand.length">
                      <CardComp
                        v-for="card in p.hand"
                        :key="`settle-${p.clientId}-${card.id}`"
                        :card="card"
                        size="sm"
                        :mode="settlementHandCardMode(p.clientId)"
                      />
                    </div>
                    <p v-else class="settlement-empty">（无手牌）</p>
                  </div>

                  <div class="score-breakdown">
                    <p class="zone-title">分数明细</p>
                    <p v-if="!settlementScoreLines(p).length" class="settlement-empty">（无）</p>
                    <ul v-else>
                      <li v-for="line in settlementScoreLines(p)" :key="`score-${p.clientId}-${line.key}`">
                        {{ line.label }}：{{ signedScore(line.total) }}分
                      </li>
                    </ul>
                  </div>
                </div>
              </details>
            </div>
          </section>

          <section v-if="winnerSettlementPlayer && huCalculationLines.length" class="settlement scoring-explain">
            <h3>胡牌计分</h3>
            <div class="score-formula">
              <p>{{ participantDisplayName(winnerSettlementPlayer) }} {{ winnerSettlementPlayer.huType === "big" ? "大胡" : "小胡" }}：赢一家 {{ signedScore(winnerPerOpponentScore) }}分</p>
              <ul>
                <li v-for="line in huCalculationLines" :key="`hu-calc-${line.key}`">
                  {{ line.label }}：{{ signedScore(line.unit) }}分
                </li>
              </ul>
            </div>
          </section>

          <section v-if="remainingDeckPreview.length" class="settlement remaining-deck">
            <h3>留底牌堆前{{ remainingDeckPreview.length }}张</h3>
            <div class="settlement-cards">
              <CardComp
                v-for="card in remainingDeckPreview"
                :key="`remain-${card.id}`"
                :card="card"
                size="sm"
                :mode="resolvedTableCardMode"
              />
            </div>
          </section>
        </div>

        <div class="end-actions">
          <template v-if="state?.roomMode === 'match'">
            <button
              class="primary"
              type="button"
              data-testid="quick-rematch"
              :disabled="!settlementReady || quickRematchPending"
              @click="rematchQuickTable"
            >
              {{ quickRematchPending ? "正在重新配桌…" : "再来一局（重新配桌）" }}
            </button>
            <p class="host-actions-hint">只为你寻找下一桌，不会让其他牌友离开当前结算。</p>
          </template>
          <template v-else-if="isHost">
            <button
              ref="nextRoundTriggerRef"
              class="primary"
              type="button"
              data-testid="next-round-trigger"
              :disabled="!settlementReady"
              @click="requestNextRound"
            >
              {{ settlementReady ? "下一局（房主）" : "正在结算…" }}
            </button>
            <button
              ref="returnLobbyTriggerRef"
              class="ghost"
              type="button"
              data-testid="return-lobby-trigger"
              :disabled="!settlementReady"
              @click="requestReturnLobby"
            >
              全桌返回大厅（房主）
            </button>
          </template>
          <p v-else class="host-actions-hint">下一局与全桌返回由房主操作；你可以使用右上角退出按钮个人离开。</p>
        </div>
      </div>
    </div>

    <div
      v-if="confirmingNextRound"
      class="table-return-mask"
      data-testid="next-round-mask"
      @click.self="cancelNextRound"
    >
      <section
        ref="nextRoundDialogRef"
        class="table-return-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="next-round-title"
        aria-describedby="next-round-description"
        tabindex="-1"
        @keydown.esc.stop.prevent="cancelNextRound"
        @keydown.tab="trapNextRoundFocus"
      >
        <div class="table-return-symbol next-round" aria-hidden="true">续</div>
        <h2 id="next-round-title">现在开始下一局？</h2>
        <p id="next-round-description">其他牌友会立即离开本局结算并进入下一局。请先确认大家都已经看完分数。</p>
        <div class="table-return-actions">
          <button ref="nextRoundCancelRef" type="button" data-testid="cancel-next-round" @click="cancelNextRound">继续看结算</button>
          <button class="primary" type="button" data-testid="confirm-next-round" @click="confirmNextRound">确认开始下一局</button>
        </div>
      </section>
    </div>

    <div
      v-if="confirmingReturnLobby"
      class="table-return-mask"
      data-testid="table-return-mask"
      @click.self="cancelReturnLobby"
    >
      <section
        ref="returnLobbyDialogRef"
        class="table-return-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="table-return-title"
        aria-describedby="table-return-description"
        tabindex="-1"
        @keydown.esc.stop.prevent="cancelReturnLobby"
        @keydown.tab="trapReturnLobbyFocus"
      >
        <div class="table-return-symbol" aria-hidden="true">↩</div>
        <h2 id="table-return-title">让全桌返回大厅？</h2>
        <p id="table-return-description">所有玩家都会离开本局结算，回到房间准备页。只有房主能执行这项操作。</p>
        <div class="table-return-actions">
          <button ref="returnLobbyCancelRef" type="button" data-testid="cancel-table-return" @click="cancelReturnLobby">继续看结算</button>
          <button class="danger" type="button" data-testid="confirm-table-return" @click="confirmReturnLobby">全桌返回大厅</button>
        </div>
      </section>
    </div>

    <div
      v-if="confirmingResumeAbandon"
      class="table-return-mask"
      data-testid="resume-abandon-mask"
      @click.self="cancelResumeAbandon"
    >
      <section
        ref="resumeAbandonDialogRef"
        class="table-return-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-abandon-title"
        aria-describedby="resume-abandon-description"
        tabindex="-1"
        @keydown.esc.stop.prevent="cancelResumeAbandon"
        @keydown.tab="trapResumeAbandonFocus"
      >
        <div class="table-return-symbol" aria-hidden="true">↩</div>
        <h2 id="resume-abandon-title">{{ syncCancelDialogCopy.title }}</h2>
        <p id="resume-abandon-description">{{ syncCancelDialogCopy.description }}</p>
        <div class="table-return-actions">
          <button ref="resumeAbandonCancelRef" type="button" data-testid="cancel-resume-abandon" @click="cancelResumeAbandon">{{ syncCancelDialogCopy.keepLabel }}</button>
          <button class="danger" type="button" data-testid="confirm-resume-abandon" @click="confirmResumeAbandon">{{ syncCancelDialogCopy.confirmLabel }}</button>
        </div>
      </section>
    </div>

    <div v-if="showRules" class="rules-mask" @click.self="closeRules()">
      <div
        ref="rulesPanelRef"
        class="rules-panel"
        data-testid="rules-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-panel-title"
        tabindex="-1"
        @keydown.esc.stop.prevent="closeRules()"
        @keydown.tab="trapRulesFocus"
      >
        <div class="rules-head">
          <div>
            <p class="rules-kicker">玩家速查</p>
            <h2 id="rules-panel-title">四色牌规则</h2>
            <p class="rules-slogan">象棋魂·麻将韵·纸牌趣——四色牌，一局见真章！</p>
          </div>
          <button ref="rulesCloseButtonRef" class="ghost" data-testid="close-rules" @click="closeRules()">关闭</button>
        </div>

        <section class="rules-section">
          <h3>快速上手</h3>
          <div class="rules-chip-list">
            <span class="rules-chip">4 人对局</span>
            <span class="rules-chip">庄家 21 张</span>
            <span class="rules-chip">闲家 20 张</span>
            <span class="rules-chip">将 / 金条不能主动打出</span>
          </div>
          <ul class="rules-list">
            <li>牌有黄、红、绿、白四色，将、士、象、车、马、炮、卒各 4 张，另有公侯伯子男 5 张金条牌。</li>
            <li>定庄牌会决定谁是庄家，而且这张牌本身也属于庄家的手牌，所以庄家比别人多 1 张。</li>
            <li>开局先模拟发牌，再声明暗坎和亮鱼，四家都确认后正式进入出牌循环。</li>
          </ul>
        </section>

        <section class="rules-section">
          <h3>轮到你时怎么做</h3>
          <ul class="rules-list">
            <li>全局先轮询胡、开、碰；如果没人响应，当前玩家再处理自己面前的牌。</li>
            <li>当前玩家的基本顺序是：能吃就吃，不能吃就抓；抓出来的新牌再重新轮询一次胡、开、碰。</li>
            <li>如果重新轮询后仍然没人响应，这张牌会继续作为你打给下家的牌，进入对应的流水。</li>
          </ul>
        </section>

        <section class="rules-section">
          <h3>常见牌组</h3>
          <ul class="rules-list">
            <li>吃牌可形成：车马炮架、将士象架、三异色卒、四异色卒、对子、单将组、单金条组。</li>
            <li>碰是 3 张同色同字的明示组；开是在已有暗坎基础上接第 4 张；鱼是亮出的 4 张同牌或 4/5 张金条。</li>
            <li>将和金条都不能主动弃牌，通常只会在抓到后被组成单张组、架子、开，或者直接拿来胡。</li>
          </ul>
        </section>

        <section class="rules-section">
          <h3>胡牌与结算</h3>
          <ul class="rules-list">
            <li>胡牌的本质是：响应当前那张牌后，你的手牌和牌组可以完全拆成有效牌组，没有零散牌。</li>
            <li>小胡：3 + 吃分 + 碰分 + 未开坎分 + 单张将 / 金条分。</li>
            <li>大胡：在上面基础上加上开分和鱼分后整体翻倍；只要含至少 1 个鱼或开，就算大胡。</li>
            <li>赢家会向另外三家分别收胡牌分；闲家之间再单独结算开和坎的互付分。</li>
          </ul>
        </section>

        <section class="rules-section">
          <h3>界面怎么看</h3>
          <ul class="rules-list">
            <li>流水表示牌从谁传给谁；被吃、碰、开、胡走的待响牌，会从原来的流水里移除。</li>
            <li>牌组区显示已经亮出的牌组，手牌区显示你还握在手里的牌。</li>
            <li>庄家名字旁会显示“庄”和定庄牌；中央左侧是固定牌堆，右侧只突出当前待响牌。</li>
          </ul>
        </section>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import CardComp from "@/components/Card.vue";
import ConnectionStatus from "@/components/ConnectionStatus.vue";
import DeclarationPanel from "@/components/DeclarationPanel.vue";
import GameBoard from "@/components/GameBoard.vue";
import GameTools from "@/components/GameTools.vue";
import InviteLinkFallbackDialog from "@/components/InviteLinkFallbackDialog.vue";
import LobbyPage from "@/components/LobbyPage.vue";
import LoginPage from "@/components/LoginPage.vue";
import { useResponsiveViewport } from "@/composables/useResponsiveViewport";
import { useRoom } from "@/composables/useRoom";
import { useGuestProfile } from "@/composables/useGuestProfile";
import { isScreenWakeLockSupported, useScreenWakeLock } from "@/composables/useScreenWakeLock";
import { useTurnAlert } from "@/composables/useTurnAlert";
import { BACKEND_HTTP_URL } from "@/config/backend";
import { apiErrorMessage } from "@/utils/http";
import { isPrivateHandSynchronized } from "@/utils/privateHandReadiness";
import { hasPersistentBrowserStorage, readStoredValue, writeStoredValue } from "@/utils/safeStorage";
import type {
  ActionCandidate,
  ActionRequest,
  AvailableAction,
  Card,
  CardDisplayMode,
  GameDisplayPreferences,
  RenderedCardMode,
  RoundResultPlayer,
  TurnAlertMode,
} from "@/types/game";
import { getCardLabelText } from "@/utils/cardText";

const FriendInviteQrDialog = defineAsyncComponent(
  () => import("@/components/FriendInviteQrDialog.vue"),
);

type SettlementGroupBlock = {
  id: string;
  cards: Card[];
  badge?: string;
  label?: string;
  tone: "meld" | "fish" | "public" | "strong";
};
type LobbyModeId = "practice_bots" | "quick_match" | "friends";
type LobbyMode = {
  id: LobbyModeId;
  name: string;
  description: string;
  badge: string;
  enabled: boolean;
};
const HTTP_URL = BACKEND_HTTP_URL;
const DISPLAY_PREFERENCES_KEY = "sise_game_display_preferences_v2";
const LEGACY_TABLE_CARD_MODE_KEY = "sise_table_card_mode";
const browserStoragePersistent = hasPersistentBrowserStorage();

function normalizeCardDisplayMode(value: unknown): CardDisplayMode | null {
  return value === "large" || value === "adaptive" || value === "long" ? value : null;
}

function normalizeTurnAlertMode(value: unknown): TurnAlertMode {
  return value === "sound" || value === "off" || value === "sound-vibration" ? value : "sound-vibration";
}

function readDisplayPreferences(): GameDisplayPreferences {
  try {
    const stored = readStoredValue(DISPLAY_PREFERENCES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<GameDisplayPreferences>;
      return {
        ownCards: normalizeCardDisplayMode(parsed.ownCards) ?? "adaptive",
        tableCards: normalizeCardDisplayMode(parsed.tableCards) ?? "adaptive",
        seatDirection: parsed.seatDirection === "clockwise" ? "clockwise" : "counterclockwise",
        turnAlert: normalizeTurnAlertMode(parsed.turnAlert),
        spokenTurnGuidance: parsed.spokenTurnGuidance === true,
        reduceMotion: parsed.reduceMotion === true,
        keepScreenAwake: parsed.keepScreenAwake !== false,
      };
    }
  } catch {
    // Invalid local preferences fall back to the compatible defaults below.
  }

  const legacyMode = readStoredValue(LEGACY_TABLE_CARD_MODE_KEY);
  return {
    ownCards: "adaptive",
    tableCards: legacyMode === "simple" ? "large" : legacyMode === "full" ? "long" : "adaptive",
    seatDirection: "counterclockwise",
    turnAlert: "sound-vibration",
    spokenTurnGuidance: false,
    reduceMotion: false,
    keepScreenAwake: true,
  };
}

function randomFrom(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)] ?? list[0] ?? "玩家";
}

function generateRandomNickname(): string {
  const prefix = ["青", "白", "赤", "黄", "东", "南", "西", "北", "云", "风", "星", "月"];
  const suffix = ["雀客", "牌友", "棋童", "将军", "行者", "小侠", "掌柜", "阿福", "阿宁", "子衿"];
  return `${randomFrom(prefix)}${randomFrom(suffix)}`;
}

function readNicknameHistory(): string[] {
  try {
    const raw = readStoredValue("sise_entry_name_history") || "[]";
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 8);
  } catch {
    return [];
  }
}

function writeNicknameHistory(names: string[]) {
  writeStoredValue("sise_entry_name_history", JSON.stringify(names.slice(0, 8)));
}

const {
  profile: guestProfile,
  refresh: refreshGuestProfile,
  refreshAfterSettlement: refreshGuestProfileAfterSettlement,
  updateNickname: updateGuestProfileNickname,
} = useGuestProfile();

void refreshGuestProfile();

const {
  connect,
  connected,
  connectionState,
  reconnectAttempt,
  retryConnection,
  mySeatId,
  activeRoomId,
  state,
  players,
  privateHand,
  availableActions,
  huResult,
  roundResult,
  debugApplied,
  joinError,
  declareError,
  actionLogs,
  actionFeedback,
  matchClockSync,
  decisionTimer,
  clearActionLogs,
  debugSetup,
  sendAction,
  sendDiscardCard,
  declareSetup,
  requestMoreTime,
  startGame,
  nextRound,
  returnLobby,
  dissolveRoom,
  setScoringMode,
  setLobbyReady,
  setAutoPlay,
  leaveRoom,
  claimSeat,
  addBot,
  fillBots,
  updateBot,
  removeSeat,
} = useRoom("玩家");

const guestProfileSummary = computed(() => {
  if (!browserStoragePersistent) return "";
  const current = guestProfile.value;
  if (!current) return "";
  return current.roundsPlayed > 0
    ? `已玩 ${current.roundsPlayed} 局 · 胡 ${current.huWins} 局`
    : "还没有完成牌局";
});

type LocalTestBridgeWindow = Window & {
  __siseLocalTest?: {
    setupScenario: (scenario: string) => void;
    getLastResult: () => {
      scenario: string;
      ok: boolean;
      ts: number;
      actions?: AvailableAction[];
    } | null;
    submitAction: (request: ActionRequest) => void;
    setPrivateHandReadyOverride: (ready: boolean | null) => void;
  };
};

const localTestPrivateHandReadyOverride = ref<boolean | null>(null);

function installLocalTestBridge(): void {
  const query = new URLSearchParams(window.location.search);
  const localHost = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
  if (!localHost || query.get("e2eDebug") !== "1") {
    return;
  }
  (window as LocalTestBridgeWindow).__siseLocalTest = {
    setupScenario: (scenario) => debugSetup(scenario),
    getLastResult: () => debugApplied.value,
    submitAction: (request) => sendAction(request),
    setPrivateHandReadyOverride: (ready) => {
      localTestPrivateHandReadyOverride.value = ready;
    },
  };
}

function removeLocalTestBridge(): void {
  localTestPrivateHandReadyOverride.value = null;
  delete (window as LocalTestBridgeWindow).__siseLocalTest;
}

const ENTRY_NAME_KEY = "sise_entry_name";
const ENTRY_HISTORY_KEY = "sise_entry_name_history";
const entryName = ref(readStoredValue(ENTRY_NAME_KEY).trim());
const nicknameHistory = ref<string[]>(readNicknameHistory());
const entryInviteRoomId = ref(new URLSearchParams(window.location.search).get("roomId")?.trim() || "");
const enteringLobby = ref(false);
const enteredFrontLobby = ref(false);
const restoringStoredSession = ref(false);
const joiningFriendInvite = ref(false);
type StartingRoomMode = "practice" | "friends" | "quick_match" | null;
const startingRoomMode = ref<StartingRoomMode>(null);
const pendingPracticeAutoStart = ref(false);
const selectedLobbyMode = ref<LobbyModeId>("practice_bots");
watch(state, (nextState) => {
  if (nextState && startingRoomMode.value !== null) {
    startingRoomMode.value = null;
  }
});
const lobbyModes: LobbyMode[] = [
  {
    id: "practice_bots" as const,
    name: "单人练习",
    description: "系统补 3 位电脑，马上开一局。适合第一次玩和熟悉规则。",
    badge: "推荐新手",
    enabled: true,
  },
  {
    id: "quick_match" as const,
    name: "快速配桌",
    description: "先等真人牌友；人数不足时电脑自动补位，不会一直空等。",
    badge: "一键开桌",
    enabled: true,
  },
  {
    id: "friends" as const,
    name: "好友同桌",
    description: "创建房间，把链接发给朋友；空位也可以添加电脑。",
    badge: "邀请朋友",
    enabled: true,
  },
];

type StoredRoomSession = {
  roomId: string;
  playerToken: string;
  name: string;
};

function readBrowserStorage(key: string): string {
  return readStoredValue(key).trim();
}

function readStoredRoomSession(): StoredRoomSession | null {
  const query = new URLSearchParams(window.location.search);
  if (query.get("new") === "1") {
    return null;
  }
  const queryRoomId = query.get("roomId")?.trim() || "";
  const cachedRoomId = readBrowserStorage("four_room_id");
  const roomId = queryRoomId || cachedRoomId;
  if (!roomId) {
    return null;
  }
  const playerToken =
    readBrowserStorage(`four_player_token:${roomId}`) ||
    (roomId === cachedRoomId ? readBrowserStorage("four_player_token") : "");
  const name = entryName.value.trim() || readBrowserStorage("four_player_name");
  if (!playerToken || !name) {
    return null;
  }
  return { roomId, playerToken, name };
}

async function resumeStoredRoomSession(): Promise<void> {
  if (enteredFrontLobby.value || connected.value) {
    return;
  }
  const storedSession = readStoredRoomSession();
  if (!storedSession) {
    return;
  }
  entryName.value = storedSession.name;
  enteredFrontLobby.value = true;
  enteringLobby.value = true;
  restoringStoredSession.value = true;
  globalError.value = "";
  try {
    const ok = await connect({
      nameOverride: storedSession.name,
      roomId: storedSession.roomId,
      playerToken: storedSession.playerToken,
      reconnecting: true,
      preserveState: true,
    });
    if (!ok) {
      retryConnection();
    }
  } finally {
    enteringLobby.value = false;
    restoringStoredSession.value = false;
  }
}

async function abandonSessionResume(): Promise<void> {
  const returnToModeLobby = startingRoomMode.value !== null;
  restoringStoredSession.value = false;
  joiningFriendInvite.value = false;
  startingRoomMode.value = null;
  entryInviteRoomId.value = "";
  enteringLobby.value = false;
  globalError.value = "";
  await leaveRoom();
  enteredFrontLobby.value = returnToModeLobby;
}

const isWaiting = computed(() => state.value?.phase === "waiting");
const isDeclaring = computed(() => state.value?.phase === "declaring");
const isPlaying = computed(() => state.value?.phase === "playing");
const isEnded = computed(() => state.value?.phase === "ended");
const isHost = computed(() => Boolean(mySeatId.value) && state.value?.hostPlayerId === mySeatId.value);
const mePlayer = computed(() => players.value.find((player) => player.clientId === mySeatId.value) ?? null);
const hasLobbySession = computed(() => Boolean(connected.value || state.value || mySeatId.value));
const isConnectingWithoutState = computed(
  () =>
    !state.value &&
    enteredFrontLobby.value &&
    (restoringStoredSession.value ||
      connectionState.value === "connecting" ||
      connectionState.value === "reconnecting" ||
      connectionState.value === "retry_wait" ||
      connectionState.value === "offline" ||
      connectionState.value === "closed"),
);
const showEntry = computed(() => !enteredFrontLobby.value && !hasLobbySession.value);
const showSyncingScreen = computed(
  () => !state.value && (hasLobbySession.value || isConnectingWithoutState.value),
);
const syncScreenCopy = computed(() => {
  if (joiningFriendInvite.value) {
    return {
      kicker: "加入好友房",
      title: "正在进入朋友的牌桌",
      description: "正在连接房间，请稍候。请不要重复点击。",
      cancelLabel: "取消加入，返回首页",
    };
  }
  if (startingRoomMode.value === "quick_match") {
    return {
      kicker: "快速配桌",
      title: "正在寻找牌友",
      description: "正在连接配桌服务，请稍候。",
      cancelLabel: "取消，返回玩法选择",
    };
  }
  if (startingRoomMode.value === "practice") {
    return {
      kicker: "单人练习",
      title: "正在准备练习牌桌",
      description: "正在连接牌桌，请稍候。",
      cancelLabel: "取消，返回玩法选择",
    };
  }
  if (startingRoomMode.value === "friends") {
    return {
      kicker: "好友同桌",
      title: "正在创建好友房",
      description: "正在连接牌桌，请稍候。",
      cancelLabel: "取消，返回玩法选择",
    };
  }
  if (connectionState.value === "closed") {
    return {
      kicker: "原牌局已关闭",
      title: "无法回到原来的牌桌",
      description: joinError.value || "原牌局已经结束，系统不会继续重试。",
      cancelLabel: "返回首页",
    };
  }
  if (connectionState.value === "offline") {
    return {
      kicker: "等待网络",
      title: "联网后会自动继续",
      description: "你的座位和身份凭证仍保存在这台设备上，无需重新输入昵称。",
      cancelLabel: "放弃恢复，返回首页",
    };
  }
  return {
    kicker: "恢复牌局",
    title: "正在回到原来的牌桌",
    description: "正在使用这台设备保存的房间身份恢复座位和手牌，请稍候。",
    cancelLabel: "放弃恢复，返回首页",
  };
});
const syncCancelDialogCopy = computed(() => {
  if (startingRoomMode.value !== null) {
    return {
      title: "取消正在开始的玩法？",
      description: "牌桌仍在连接中。确认取消后会返回玩法选择。",
      keepLabel: "继续等待",
      confirmLabel: "取消并返回玩法选择",
    };
  }
  if (joiningFriendInvite.value) {
    return {
      title: "取消加入好友房？",
      description: "房间仍在连接中。确认取消后会停止本次加入并返回首页。",
      keepLabel: "继续加入",
      confirmLabel: "取消并返回首页",
    };
  }
  return {
    title: "放弃恢复原牌局？",
    description: "系统正在为你找回原来的座位和手牌。确认放弃后会清除这台设备保存的房间身份并返回首页。",
    keepLabel: "继续恢复",
    confirmLabel: "放弃并返回首页",
  };
});
const showModeLobby = computed(() => {
  if (showSyncingScreen.value) {
    return false;
  }
  return isWaiting.value || (enteredFrontLobby.value && !state.value);
});
const showGameTools = computed(() => isDeclaring.value || isPlaying.value || isEnded.value);
const roomNavigationProtected = computed(() => hasLobbySession.value || isConnectingWithoutState.value);
const canPressStartGame = computed(
  () =>
    Boolean(connected.value) &&
    Boolean(state.value) &&
    Boolean(mySeatId.value) &&
    isWaiting.value &&
    isHost.value &&
    (state.value?.roomMode === "match"
      ? players.value.every((player) => player.isConfiguredBot || player.connected)
      : state.value?.roomMode !== "friends" ||
        (players.value.length === 4 &&
          players.value.every(
            (player) =>
              player.isConfiguredBot ||
              (player.connected &&
                (player.clientId === state.value?.hostPlayerId || player.lobbyReady)),
          ))),
);
const canStartSelectedMode = computed(
  () =>
    !enteringLobby.value &&
    ((!hasLobbySession.value &&
        (selectedLobbyMode.value === "practice_bots" ||
          selectedLobbyMode.value === "quick_match" ||
          selectedLobbyMode.value === "friends")) ||
      canPressStartGame.value),
);
const remainingFriendSeats = computed(() => Math.max(0, 4 - players.value.length));
const hasOfflineFriend = computed(() =>
  players.value.some((player) => !player.isConfiguredBot && !player.connected),
);
const unreadyFriendCount = computed(
  () =>
    players.value.filter(
      (player) =>
        !player.isConfiguredBot &&
        player.clientId !== state.value?.hostPlayerId &&
        !player.lobbyReady,
    ).length,
);
const lobbyTitle = computed(() => {
  if (!isWaiting.value) {
    return "游戏模式选择";
  }
  if (state.value?.roomMode === "match") {
    return "正在快速配桌";
  }
  if (state.value?.roomMode !== "friends") {
    return "房间准备中";
  }
  if (!mySeatId.value) {
    return "请先选择座位";
  }
  if (hasOfflineFriend.value) {
    return "等待牌友重新上线";
  }
  if (remainingFriendSeats.value > 0) {
    return isHost.value ? `还差 ${remainingFriendSeats.value} 位即可开局` : "等待房主安排座位";
  }
  if (unreadyFriendCount.value > 0) {
    if (isHost.value) {
      return `还有 ${unreadyFriendCount.value} 位牌友未准备`;
    }
    return mePlayer.value?.lobbyReady
      ? `等待 ${unreadyFriendCount.value} 位牌友准备`
      : "请确认准备";
  }
  return isHost.value ? "四席已就绪" : "等待房主开始";
});
const lobbySubtitle = computed(() => {
  if (!isWaiting.value) {
    return "选择一种玩法。第一次玩，建议选单人练习。";
  }
  if (state.value?.roomMode === "match") {
    const humanCount = players.value.filter((player) => !player.isConfiguredBot).length;
    if (hasOfflineFriend.value) {
      return "有牌友正在恢复连接，座位会为对方暂时保留。";
    }
    return matchSecondsLeft.value > 0
      ? `已找到 ${humanCount} 位真人，${matchSecondsLeft.value} 秒后电脑补位自动开始。`
      : "正在准备开局，请稍候。";
  }
  if (state.value?.roomMode !== "friends") {
    return "正在补齐机器人并准备开始单人练习。";
  }
  if (!mySeatId.value) {
    return "请选择一个写着“等待入座”的空座位；入座后等待房主开始。";
  }
  if (isHost.value) {
    if (hasOfflineFriend.value) {
      return "有真人暂时离线；请等对方重新上线，或移出该座位后再安排电脑。";
    }
    if (remainingFriendSeats.value > 0) {
      return `把邀请链接发给朋友，或点击“补齐 ${remainingFriendSeats.value} 位电脑”后开始。`;
    }
    if (unreadyFriendCount.value > 0) {
      return `请等 ${unreadyFriendCount.value} 位真人牌友点击“我准备好了”。`;
    }
    return "四个座位都准备好了，请确认后开始好友对局。";
  }
  if (!mePlayer.value?.lobbyReady) {
    return "确认座位和设置后，请点击“我准备好了”。";
  }
  return "你已准备；等待房主开始，如需调整可取消准备。";
});
const lobbyStartLabel = computed(() => {
  if (!hasLobbySession.value) {
    if (enteringLobby.value) {
      if (selectedLobbyMode.value === "friends") return "正在创建好友房…";
      return selectedLobbyMode.value === "quick_match" ? "正在寻找牌友…" : "正在创建练习房…";
    }
    if (selectedLobbyMode.value === "friends") return "创建好友房";
    return selectedLobbyMode.value === "quick_match" ? "开始快速配桌" : "开始单人练习";
  }
  if (pendingPracticeAutoStart.value) {
    return "正在自动开始...";
  }
  if (state.value?.roomMode === "friends" && !mySeatId.value) {
    return "请先选择座位";
  }
  if (state.value?.roomMode === "match") {
    return "电脑补位，立即开始";
  }
  return isHost.value ? (state.value?.roomMode === "friends" ? "开始好友对局" : "开始单人练习") : "等待房主开始";
});
const lobbyStartHint = computed(() => {
  if (!hasLobbySession.value) return enteringLobby.value ? "请稍候，不用重复点击" : "";
  if (!isWaiting.value) return "";
  if (!mySeatId.value) return "请先选择一个空座位";
  if (state.value?.roomMode === "match") {
    if (hasOfflineFriend.value) {
      return "有牌友正在恢复连接，暂不能开始";
    }
    if (isHost.value) return "不想等待时，可立即补齐电脑";
    return matchSecondsLeft.value > 0
      ? `约 ${matchSecondsLeft.value} 秒后自动开始`
      : "正在准备自动开始";
  }
  if (!isHost.value) return mePlayer.value?.lobbyReady ? "已准备，等待房主开始" : "请先确认准备";
  if (state.value?.roomMode !== "friends") return "";
  if (players.value.length < 4) return `还差 ${4 - players.value.length} 个座位，可一键补电脑`;
  if (players.value.some((player) => !player.isConfiguredBot && !player.connected)) return "仍有真人玩家离线";
  if (unreadyFriendCount.value > 0) return `还有 ${unreadyFriendCount.value} 位牌友未准备`;
  return "四席已就绪，请点开始好友对局";
});
const hasFriendInvite = computed(() => Boolean(entryInviteRoomId.value));
const entryPrimaryLabel = computed(() => (hasFriendInvite.value ? "加入好友房" : "下一步：选择玩法"));
const nowMs = ref(Date.now());
const matchSecondsLeft = computed(() => {
  const startsAt = Number(state.value?.matchStartsAt ?? 0);
  if (startsAt <= 0 || matchClockSync.value.deadline !== startsAt) {
    return 0;
  }
  const estimatedServerNow = nowMs.value + matchClockSync.value.offsetMs;
  return Math.max(0, Math.ceil((startsAt - estimatedServerNow) / 1000));
});
watch(
  () => state.value?.matchStartsAt,
  () => {
    // Keep the first rendered second aligned with the server deadline instead of
    // reusing a timer sample that may already be almost half a second old.
    nowMs.value = Date.now();
  },
  { flush: "sync" },
);
const displayTurnPlayerId = computed(() => {
  if (state.value?.responsePhase === "collective") {
    return (
      state.value?.currentTurnPlayerId ||
      state.value?.currentPlayerId ||
      state.value?.pollOriginPlayerId ||
      ""
    );
  }
  return state.value?.currentTurnPlayerId || state.value?.currentPlayerId || "";
});
const isMyTurn = computed(() => {
  if (!mySeatId.value || displayTurnPlayerId.value !== mySeatId.value) {
    return false;
  }
  const me = players.value.find((x) => x.clientId === mySeatId.value);
  return !Boolean(me?.isBot || me?.isAutoPlay);
});

const openingDealActive = computed(
  () =>
    isPlaying.value &&
    /^DEALER\s+\S+/.test(String(state.value?.lastAction ?? "")) &&
    Number(state.value?.responseEndsAt ?? 0) > nowMs.value,
);
const openingDealSecondsLeft = computed(() => {
  if (!openingDealActive.value) {
    return 0;
  }
  return Math.max(0, Math.ceil((Number(state.value?.responseEndsAt ?? 0) - nowMs.value) / 1000));
});
const pendingActionDecision = computed(
  () =>
    connected.value &&
    !mePlayer.value?.isAutoPlay &&
    !openingDealActive.value &&
    isPlaying.value &&
    availableActions.value.some((x) => x.enabled || x.deferred),
);
const pendingDiscardDecision = computed(
  () =>
    connected.value &&
    !openingDealActive.value &&
    isPlaying.value &&
    isMyTurn.value &&
    state.value?.responsePhase === "local_draw" &&
    availableActions.value.length === 0,
);
const privateHandSynchronized = computed(() => {
  if (localTestPrivateHandReadyOverride.value !== null) {
    return localTestPrivateHandReadyOverride.value;
  }
  return isPrivateHandSynchronized(state.value, mySeatId.value, privateHand.value.length);
});
const canAct = computed(() => pendingActionDecision.value && privateHandSynchronized.value);
const canDiscard = computed(() => pendingDiscardDecision.value && privateHandSynchronized.value);
const interactionPausedMessage = computed(() => {
  if (connected.value) {
    if (mePlayer.value?.isAutoPlay && (isDeclaring.value || isPlaying.value)) {
      return "机器人正在替你操作，可在顶部取消托管";
    }
    if (
      isPlaying.value &&
      (pendingActionDecision.value || pendingDiscardDecision.value) &&
      !privateHandSynchronized.value
    ) {
      return "正在同步手牌，请稍候";
    }
    return "";
  }
  if (!isPlaying.value) {
    return "";
  }
  if (connectionState.value === "offline") {
    return "网络已断开，联网后自动恢复";
  }
  if (connectionState.value === "failed") {
    return "连接失败，请点上方立即重试";
  }
  if (connectionState.value === "closed") {
    return joinError.value || "原牌局已经关闭，请退出后重新开始";
  }
  if (connectionState.value === "retry_wait") {
    return "暂时未连上，系统会继续重试";
  }
  return "正在恢复牌局，请稍候";
});
const selectionMode = ref<"kai" | "peng" | "chi" | null>(null);
const selectedCandidateId = ref<string | null>(null);
const pendingDeferredChiCandidateId = ref<string | null>(null);
const pendingDeferredGrab = ref(false);
const activeCandidates = computed<ActionCandidate[]>(() => {
  if (!selectionMode.value) {
    return [];
  }
  const item = availableActions.value.find(
    (action) => action.action === selectionMode.value && (action.enabled || action.deferred),
  );
  return item?.candidates ?? [];
});
const candidateTargetCard = computed<Card | null>(() => {
  return (state.value?.responseCard ?? state.value?.targetCard ?? state.value?.publicDiscardPile?.[0] ?? null) as Card | null;
});
const isPendingSpecialCard = computed(() => {
  const card = candidateTargetCard.value;
  return Boolean(card && (card.color === "gold" || card.type === "jiang"));
});
const candidatePromptText = computed(() => {
  if (selectionMode.value === "chi" && isPendingSpecialCard.value) {
    return state.value?.responsePhase === "collective"
      ? "请选择一种吃法；系统会先等待其他玩家响应"
      : "请选择一种吃法";
  }
  if (state.value?.responsePhase === "collective" && selectionMode.value === "chi") {
    return "请先选吃的牌组；系统会先过待响，待无人胡/开/碰后自动吃";
  }
  return selectionMode.value ? `请点击一个牌组确认${actionText(selectionMode.value)}` : "请点击一个牌组确认";
});
const {
  effectiveHeight,
  effectiveWidth,
  isCompactViewport,
  isLegacyCompactViewport,
  isRotatedPhonePortrait,
  isUltraCompactViewport,
  viewportHeight,
  viewportWidth,
} = useResponsiveViewport();
const displayPreferences = ref<GameDisplayPreferences>(readDisplayPreferences());
function resolveCardDisplayMode(mode: CardDisplayMode): RenderedCardMode {
  if (mode !== "adaptive") {
    return mode;
  }
  return isCompactViewport.value ? "large" : "long";
}
const resolvedOwnCardMode = computed<RenderedCardMode>(() =>
  resolveCardDisplayMode(displayPreferences.value.ownCards),
);
const resolvedTableCardMode = computed<RenderedCardMode>(() =>
  resolveCardDisplayMode(displayPreferences.value.tableCards),
);
const globalError = ref("");
const globalNotice = ref("");
const gameToolsRef = ref<{
  handleNavigationBack: () => boolean;
  requestExit: () => Promise<void>;
} | null>(null);
const lobbyPageRef = ref<{
  handleNavigationBack: () => boolean;
  requestLeaveRoom: () => Promise<void>;
} | null>(null);
const inviteCopyFallbackUrl = ref("");
const inviteQrUrl = ref("");
const inviteQrRoomId = ref("");
const canShareInvite = typeof navigator.share === "function";
const inviteActionPending = ref(false);
let globalNoticeTimer: number | null = null;
let inviteCopyReturnFocus: HTMLElement | null = null;
let inviteQrReturnFocus: HTMLElement | null = null;
const showRules = ref(false);
const rulesPanelRef = ref<HTMLElement | null>(null);
const rulesCloseButtonRef = ref<HTMLButtonElement | null>(null);
const candidatePanelRef = ref<HTMLElement | null>(null);
const candidateCancelButtonRef = ref<HTMLButtonElement | null>(null);
const settlementPanelRef = ref<HTMLElement | null>(null);
const confirmingNextRound = ref(false);
const nextRoundTriggerRef = ref<HTMLButtonElement | null>(null);
const nextRoundDialogRef = ref<HTMLElement | null>(null);
const nextRoundCancelRef = ref<HTMLButtonElement | null>(null);
const confirmingReturnLobby = ref(false);
const returnLobbyTriggerRef = ref<HTMLButtonElement | null>(null);
const returnLobbyDialogRef = ref<HTMLElement | null>(null);
const returnLobbyCancelRef = ref<HTMLButtonElement | null>(null);
const quickRematchPending = ref(false);
const confirmingResumeAbandon = ref(false);
const resumeAbandonDialogRef = ref<HTMLElement | null>(null);
const resumeAbandonCancelRef = ref<HTMLButtonElement | null>(null);
const ROOM_HISTORY_GUARD_KEY = "__siseRoomGuard";
let roomNavigationGuardMounted = false;
let roomNavigationGuardArmed = false;
let roomNavigationGuardReleasing = false;
let roomNavigationReleaseTimer: number | null = null;
let rulesReturnFocus: HTMLElement | null = null;
let candidateReturnFocus: HTMLElement | null = null;
const showEndPanel = computed(() => Boolean(huResult.value) || Boolean(roundResult.value) || isEnded.value);
watch(
  showEndPanel,
  (visible) => {
    if (visible) {
      void nextTick(() => settlementPanelRef.value?.focus());
      return;
    }
    confirmingNextRound.value = false;
    confirmingReturnLobby.value = false;
  },
  { immediate: true },
);
const isDeclareSubmitted = computed(() => Boolean(mePlayer.value?.declaredReady));
const shouldShowDeclarePanel = computed(
  () =>
    isDeclaring.value &&
    !declareDealIntroActive.value &&
    Boolean(mySeatId.value) &&
    !Boolean(mePlayer.value?.isBot || mePlayer.value?.isAutoPlay),
);
const settingsDecisionActive = computed(
  () => pendingActionDecision.value || pendingDiscardDecision.value,
);

function openRules(): void {
  if (settingsDecisionActive.value) {
    return;
  }
  rulesReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  showRules.value = true;
  void nextTick(() => rulesCloseButtonRef.value?.focus());
}

function closeRules(restoreFocus = true): void {
  const returnTarget = rulesReturnFocus;
  const returnToGameSettings = Boolean(returnTarget?.closest("[data-testid='settings-panel']"));
  rulesReturnFocus = null;
  showRules.value = false;
  if (!restoreFocus) {
    return;
  }
  void nextTick(() => {
    const fallback = document.querySelector<HTMLElement>(
      "[data-testid='game-settings'], [data-testid='login-submit'], .reset-btn",
    );
    (returnTarget?.isConnected && !returnToGameSettings ? returnTarget : fallback)?.focus();
  });
}

function trapRulesFocus(event: KeyboardEvent): void {
  const panel = rulesPanelRef.value;
  if (!panel) {
    return;
  }
  const focusable = Array.from(
    panel.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ),
  ).filter((element) => !element.hasAttribute("hidden"));
  if (!focusable.length) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

const hasOtherHumanAtSettlement = computed(() =>
  players.value.some((player) => player.clientId !== mySeatId.value && !player.isConfiguredBot),
);

async function requestNextRound(): Promise<void> {
  if (!settlementReady.value || !isHost.value) {
    return;
  }
  if (state.value?.roomMode !== "friends" || !hasOtherHumanAtSettlement.value) {
    nextRound();
    return;
  }
  confirmingNextRound.value = true;
  await nextTick();
  nextRoundCancelRef.value?.focus();
}

async function rematchQuickTable(): Promise<void> {
  if (!settlementReady.value || state.value?.roomMode !== "match" || quickRematchPending.value) {
    return;
  }
  quickRematchPending.value = true;
  globalError.value = "";
  const nickname = entryName.value.trim() || generateRandomNickname();
  try {
    await leaveRoom();
    const ok = await connect({
      nameOverride: nickname,
      forceNew: true,
      matchmaking: true,
    });
    if (!ok) {
      throw new Error(joinError.value || "暂时无法重新配桌，请稍后再试。");
    }
  } catch (error) {
    globalError.value = error instanceof Error ? error.message : "暂时无法重新配桌，请稍后再试。";
  } finally {
    quickRematchPending.value = false;
  }
}

function cancelNextRound(): void {
  if (!confirmingNextRound.value) {
    return;
  }
  confirmingNextRound.value = false;
  void nextTick(() => nextRoundTriggerRef.value?.focus());
}

function confirmNextRound(): void {
  confirmingNextRound.value = false;
  nextRound();
}

function trapNextRoundFocus(event: KeyboardEvent): void {
  const panel = nextRoundDialogRef.value;
  if (!panel) {
    return;
  }
  const focusable = Array.from(panel.querySelectorAll<HTMLElement>("button:not([disabled])"));
  if (!focusable.length) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) {
    event.preventDefault();
    first.focus();
  }
}

async function requestReturnLobby(): Promise<void> {
  if (!settlementReady.value || !isHost.value) {
    return;
  }
  confirmingReturnLobby.value = true;
  await nextTick();
  returnLobbyCancelRef.value?.focus();
}

function cancelReturnLobby(): void {
  if (!confirmingReturnLobby.value) {
    return;
  }
  confirmingReturnLobby.value = false;
  void nextTick(() => returnLobbyTriggerRef.value?.focus());
}

function confirmReturnLobby(): void {
  confirmingReturnLobby.value = false;
  returnLobby();
}

function trapReturnLobbyFocus(event: KeyboardEvent): void {
  const panel = returnLobbyDialogRef.value;
  if (!panel) {
    return;
  }
  const focusable = Array.from(panel.querySelectorAll<HTMLElement>("button:not([disabled])"));
  if (!focusable.length) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) {
    event.preventDefault();
    first.focus();
  }
}

async function requestResumeAbandon(): Promise<void> {
  confirmingResumeAbandon.value = true;
  await nextTick();
  resumeAbandonCancelRef.value?.focus();
}

function cancelResumeAbandon(): void {
  if (!confirmingResumeAbandon.value) {
    return;
  }
  confirmingResumeAbandon.value = false;
  void nextTick(() => document.querySelector<HTMLElement>("[data-testid='cancel-session-resume']")?.focus());
}

async function confirmResumeAbandon(): Promise<void> {
  confirmingResumeAbandon.value = false;
  await abandonSessionResume();
}

function trapResumeAbandonFocus(event: KeyboardEvent): void {
  const panel = resumeAbandonDialogRef.value;
  if (!panel) {
    return;
  }
  const focusable = Array.from(panel.querySelectorAll<HTMLElement>("button:not([disabled])"));
  if (!focusable.length) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) {
    event.preventDefault();
    first.focus();
  }
}

function historyStateWithoutRoomGuard(): unknown {
  const current = window.history.state;
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    return current;
  }
  const clean = { ...(current as Record<string, unknown>) };
  delete clean[ROOM_HISTORY_GUARD_KEY];
  return Object.keys(clean).length ? clean : null;
}

function isCurrentRoomHistoryGuard(): boolean {
  const current = window.history.state;
  return Boolean(
    current &&
      typeof current === "object" &&
      !Array.isArray(current) &&
      (current as Record<string, unknown>)[ROOM_HISTORY_GUARD_KEY] === true,
  );
}

function cleanRoomUrl(preserveInviteRoomId = false): string {
  const url = new URL(window.location.href);
  if (!preserveInviteRoomId) {
    url.searchParams.delete("roomId");
  }
  url.searchParams.delete("playerToken");
  url.searchParams.delete("new");
  return url.toString();
}

function sanitizeCurrentHistoryEntry(): void {
  const preserveInviteRoomId = showEntry.value && hasFriendInvite.value && !hasLobbySession.value;
  window.history.replaceState(historyStateWithoutRoomGuard(), "", cleanRoomUrl(preserveInviteRoomId));
}

function armRoomNavigationGuard(): void {
  if (!roomNavigationGuardMounted || !roomNavigationProtected.value) {
    return;
  }
  if (isCurrentRoomHistoryGuard()) {
    roomNavigationGuardArmed = true;
    return;
  }
  const current = window.history.state;
  const base = current && typeof current === "object" && !Array.isArray(current)
    ? current as Record<string, unknown>
    : {};
  window.history.pushState({ ...base, [ROOM_HISTORY_GUARD_KEY]: true }, "", window.location.href);
  roomNavigationGuardArmed = true;
}

function finishRoomNavigationGuardRelease(): void {
  roomNavigationGuardReleasing = false;
  if (roomNavigationReleaseTimer !== null) {
    window.clearTimeout(roomNavigationReleaseTimer);
    roomNavigationReleaseTimer = null;
  }
  sanitizeCurrentHistoryEntry();
}

function releaseRoomNavigationGuard(): void {
  const shouldStepBack = roomNavigationGuardArmed && isCurrentRoomHistoryGuard();
  roomNavigationGuardArmed = false;
  confirmingResumeAbandon.value = false;
  if (!shouldStepBack) {
    sanitizeCurrentHistoryEntry();
    return;
  }
  sanitizeCurrentHistoryEntry();
  roomNavigationGuardReleasing = true;
  window.history.back();
  if (roomNavigationReleaseTimer !== null) {
    window.clearTimeout(roomNavigationReleaseTimer);
  }
  roomNavigationReleaseTimer = window.setTimeout(finishRoomNavigationGuardRelease, 500);
}

function closeTopmostRoomLayerForBack(): boolean {
  if (confirmingResumeAbandon.value) {
    cancelResumeAbandon();
    return true;
  }
  if (inviteQrUrl.value) {
    closeInviteQr();
    return true;
  }
  if (inviteCopyFallbackUrl.value) {
    closeInviteCopyFallback();
    return true;
  }
  if (showRules.value) {
    closeRules();
    return true;
  }
  if (selectionMode.value) {
    clearSelection(true);
    return true;
  }
  if (confirmingNextRound.value) {
    cancelNextRound();
    return true;
  }
  if (confirmingReturnLobby.value) {
    cancelReturnLobby();
    return true;
  }
  if (gameToolsRef.value?.handleNavigationBack()) {
    return true;
  }
  if (lobbyPageRef.value?.handleNavigationBack()) {
    return true;
  }
  return false;
}

async function requestRoomExitFromBrowserBack(): Promise<void> {
  await nextTick();
  if (closeTopmostRoomLayerForBack()) {
    return;
  }
  if (showGameTools.value && gameToolsRef.value) {
    await gameToolsRef.value.requestExit();
    return;
  }
  if (showModeLobby.value && lobbyPageRef.value) {
    await lobbyPageRef.value.requestLeaveRoom();
    return;
  }
  if (showSyncingScreen.value || roomNavigationProtected.value) {
    await requestResumeAbandon();
  }
}

function handleRoomNavigationPopState(): void {
  if (roomNavigationGuardReleasing) {
    finishRoomNavigationGuardRelease();
    return;
  }
  if (!roomNavigationGuardMounted || !roomNavigationProtected.value) {
    roomNavigationGuardArmed = false;
    return;
  }
  const current = window.history.state;
  const base = current && typeof current === "object" && !Array.isArray(current)
    ? current as Record<string, unknown>
    : {};
  window.history.pushState({ ...base, [ROOM_HISTORY_GUARD_KEY]: true }, "", window.location.href);
  roomNavigationGuardArmed = true;
  void requestRoomExitFromBrowserBack();
}

function closeRulesForDecision(): void {
  if (showRules.value) {
    closeRules(false);
  }
}

let decisionControlFocusPending = false;

function focusReadyGameControl(): boolean {
  if (document.querySelector<HTMLElement>("[aria-modal='true']")) {
    return false;
  }
  const control = document.querySelector<HTMLElement>(
    ".hand-card.playable:not(:disabled), .action-dock .btn:not(:disabled)",
  );
  if (!control) {
    return false;
  }
  control.focus();
  decisionControlFocusPending = false;
  return true;
}

watch(settingsDecisionActive, (active) => {
  if (!active) {
    decisionControlFocusPending = false;
    return;
  }
  decisionControlFocusPending = true;
  closeRulesForDecision();
  // A decision can arrive before the private hand or action buttons finish
  // their adjacent state patch. Keep the focus request pending until a real
  // control exists instead of leaving keyboard users on removed settings.
  void nextTick(focusReadyGameControl);
});

watch(
  () => [
    privateHandSynchronized.value,
    canDiscard.value,
    availableActions.value
      .filter((action) => action.enabled || action.deferred)
      .map((action) => action.action)
      .join("|"),
  ] as const,
  () => {
    if (decisionControlFocusPending && settingsDecisionActive.value) {
      void nextTick(focusReadyGameControl);
    }
  },
);

const decisionAlertKey = computed(() => {
  const authoritativeDecisionKey = decisionTimer.value.decisionKey.trim();
  if (!settingsDecisionActive.value || !authoritativeDecisionKey) {
    return "";
  }
  return [
    activeRoomId.value,
    state.value?.responsePhase ?? "",
    authoritativeDecisionKey,
    canDiscard.value ? "discard" : "action",
  ].join("|");
});
const turnAlertMode = computed(() => displayPreferences.value.turnAlert);
const spokenTurnGuidanceSupported =
  typeof window.speechSynthesis !== "undefined" && typeof window.SpeechSynthesisUtterance !== "undefined";
const screenWakeLockSupported = isScreenWakeLockSupported();
const spokenTurnGuidance = computed(() => displayPreferences.value.spokenTurnGuidance);
const spokenDecisionMessage = computed(() => {
  if (!settingsDecisionActive.value) {
    return "";
  }
  if (canDiscard.value) {
    return "轮到你出牌。先选一张手牌，再点出牌。";
  }
  const order: AvailableAction["action"][] = ["hu", "kai", "peng", "chi", "pass"];
  const labels = order.flatMap((action) => {
    const available = availableActions.value.some(
      (item) => item.action === action && (item.enabled || item.deferred),
    );
    if (!available) {
      return [];
    }
    const matchingAction = availableActions.value.find(
      (item) => item.action === action && (item.enabled || item.deferred),
    );
    if (action === "pass" && (matchingAction?.deferred || state.value?.responsePhase === "local_upper")) {
      return ["抓"];
    }
    return [{ hu: "胡", kai: "开", peng: "碰", chi: "吃", pass: "过" }[action]];
  });
  const canPass = availableActions.value.some(
    (item) => item.action === "pass" && (item.enabled || item.deferred),
  );
  if (isPendingSpecialCard.value && !canPass) {
    return "轮到你了。这张特殊牌不能过，请选择吃法。";
  }
  if (!labels.length) {
    return "轮到你了，请选择下一步。";
  }
  const choices = labels.length === 1
    ? labels[0]
    : `${labels.slice(0, -1).join("、")}或${labels.at(-1)}`;
  return `轮到你了。可选择${choices}。`;
});
useTurnAlert({
  active: settingsDecisionActive,
  decisionKey: decisionAlertKey,
  mode: turnAlertMode,
  spokenEnabled: spokenTurnGuidance,
  spokenMessage: spokenDecisionMessage,
});
const wakeLockActive = computed(() => connected.value && (isDeclaring.value || isPlaying.value));
const keepScreenAwake = computed(() => displayPreferences.value.keepScreenAwake);
useScreenWakeLock(wakeLockActive, keepScreenAwake);
const declareDealIntroActive = computed(
  // The server advances lastAction to DECLARING when the intro ends. Do not
  // compare clocks: an inaccurate phone clock could expose the declaration
  // dialog over the ceremony.
  () =>
    isDeclaring.value &&
    /^DEALER(?:_PICK|_CARD)?\s+\S+/.test(String(state.value?.lastAction ?? "")),
);

let declareTick: number | null = null;
const declareSecondsLeft = computed(() => {
  if (declareDealIntroActive.value) {
    return 0;
  }
  const endsAt = declareDecisionEndsAt.value;
  if (!endsAt) {
    return 0;
  }
  const configuredSeconds = Math.ceil(declareTotalMs.value / 1000);
  return Math.max(0, Math.min(configuredSeconds, Math.ceil((endsAt - nowMs.value) / 1000)));
});
const declareDecisionEndsAt = computed(() => {
  if (decisionTimer.value.decisionKey.startsWith("declare:") && decisionTimer.value.endsAt > 0) {
    return decisionTimer.value.endsAt;
  }
  return Number(state.value?.declareEndsAt ?? 0);
});
const declareTotalMs = computed(() => {
  if (decisionTimer.value.totalMs > 0) {
    return decisionTimer.value.totalMs;
  }
  const action = String(state.value?.lastAction ?? "");
  const match = action.match(/DECLARING\s+(\d+)ms/);
  if (match) {
    return Math.max(1000, Number(match[1]) || 45000);
  }
  return 45000;
});
const declareProgressPercent = computed(() => {
  const endsAt = declareDecisionEndsAt.value;
  if (!endsAt) {
    return 0;
  }
  const remain = Math.max(0, endsAt - nowMs.value);
  const percent = (remain / declareTotalMs.value) * 100;
  return Math.max(0, Math.min(100, Number(percent.toFixed(1))));
});
function clearSelection(restoreFocus = false) {
  const returnTarget = candidateReturnFocus;
  candidateReturnFocus = null;
  selectionMode.value = null;
  selectedCandidateId.value = null;
  if (!restoreFocus) {
    return;
  }
  void nextTick(() => {
    if (
      returnTarget?.isConnected &&
      !(returnTarget instanceof HTMLButtonElement && returnTarget.disabled)
    ) {
      returnTarget.focus();
    }
  });
}

async function handleLeaveRoom(): Promise<void> {
  globalError.value = "";
  pendingPracticeAutoStart.value = false;
  clearSelection();
  await leaveRoom();
  entryInviteRoomId.value = "";
}

function onPanelSelectionChange(payload: { mode: "kai" | "peng" | "chi" | null; selectedCandidateId: string | null }) {
  if (!payload.mode) {
    clearSelection(Boolean(selectionMode.value));
    return;
  }
  if (!selectionMode.value) {
    candidateReturnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  }
  selectionMode.value = payload.mode;
  selectedCandidateId.value = payload.selectedCandidateId;
  void nextTick(() => {
    const firstCandidate = candidatePanelRef.value?.querySelector<HTMLElement>(".candidate-item");
    (firstCandidate ?? candidateCancelButtonRef.value ?? candidatePanelRef.value)?.focus();
  });
}

function trapCandidateFocus(event: KeyboardEvent): void {
  const panel = candidatePanelRef.value;
  if (!panel) {
    return;
  }
  const focusable = Array.from(
    panel.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ),
  ).filter((element) => !element.hasAttribute("hidden"));
  if (!focusable.length) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) {
    event.preventDefault();
    first.focus();
  }
}

function actionFromRequest(request: ActionRequest): string {
  return typeof request === "string" ? request : request.action;
}

function candidateIdFromRequest(request: ActionRequest): string {
  return typeof request === "string" ? "" : String(request.candidateId ?? "").trim();
}

function onPanelSubmit(request: ActionRequest) {
  const action = actionFromRequest(request);
  const isDeferred = typeof request !== "string" && Boolean(request.deferred);
  if (state.value?.responsePhase === "collective" && action === "pass" && isDeferred) {
    pendingDeferredGrab.value = true;
    sendAction("pass");
    clearSelection();
    return;
  }
  if (state.value?.responsePhase === "collective" && action === "chi") {
    const candidateId = candidateIdFromRequest(request);
    if (candidateId) {
      pendingDeferredChiCandidateId.value = candidateId;
      sendAction("pass");
    }
    clearSelection();
    return;
  }
  pendingDeferredChiCandidateId.value = null;
  pendingDeferredGrab.value = false;
  sendAction(request);
  clearSelection();
}

function submitCandidate(candidateId: string) {
  if (!selectionMode.value) {
    return;
  }
  selectedCandidateId.value = candidateId;
  onPanelSubmit({ action: selectionMode.value, candidateId });
}

function actionText(action: "kai" | "peng" | "chi"): string {
  if (action === "kai") {
    return "开";
  }
  if (action === "peng") {
    return "碰";
  }
  return "吃";
}

function candidateSourceText(source: ActionCandidate["source"]): string {
  if (source === "hand+pool") {
    return "手牌与已有明示牌";
  }
  return "手牌";
}

function cardLabel(card: Card): string {
  return getCardLabelText(card);
}

function parseCardIdToCard(cardId: string): Card | null {
  const match = String(cardId ?? "").trim().match(/^([a-z]+)_([a-z]+)_\d+$/i);
  if (!match) {
    return null;
  }
  return {
    id: cardId,
    color: match[1].toLowerCase(),
    type: match[2].toLowerCase(),
  };
}

function candidateGroupCards(candidate: ActionCandidate): Card[] {
  return candidate.cardIds.map((id) => parseCardIdToCard(id)).filter((card): card is Card => Boolean(card));
}

function submitDeferredChiIfReady() {
  const candidateId = pendingDeferredChiCandidateId.value;
  if (!candidateId) {
    return;
  }
  const phase = String(state.value?.responsePhase ?? "");
  if (phase === "collective") {
    return;
  }
  const isLocalChiPhase =
    (phase === "local_upper" || phase === "local_draw") && String(state.value?.currentPlayerId ?? "") === mySeatId.value;
  if (!isLocalChiPhase) {
    pendingDeferredChiCandidateId.value = null;
    return;
  }
  const chiEntry = availableActions.value.find((item) => item.action === "chi" && item.enabled);
  if (!chiEntry) {
    return;
  }
  if (!chiEntry.candidates?.some((candidate) => candidate.id === candidateId)) {
    pendingDeferredChiCandidateId.value = null;
    return;
  }
  pendingDeferredChiCandidateId.value = null;
  sendAction({ action: "chi", candidateId });
}

function submitDeferredGrabIfReady() {
  if (!pendingDeferredGrab.value) {
    return;
  }
  const isLocalUpper =
    String(state.value?.responsePhase ?? "") === "local_upper" && String(state.value?.currentPlayerId ?? "") === mySeatId.value;
  if (String(state.value?.responsePhase ?? "") === "collective") {
    return;
  }
  if (!isLocalUpper) {
    pendingDeferredGrab.value = false;
    return;
  }
  const passEntry = availableActions.value.find((item) => item.action === "pass" && item.enabled);
  if (!passEntry) {
    return;
  }
  pendingDeferredGrab.value = false;
  sendAction("pass");
}

function submitDeclaration(payload: { declaredKongs: number; fishCardIds: string[] }) {
  if (isDeclareSubmitted.value) {
    return;
  }
  declareSetup(payload);
}

watch(
  () => `${state.value?.phase ?? ""}|${state.value?.responsePhase ?? ""}|${state.value?.currentPlayerId ?? ""}`,
  () => {
    clearSelection();
    submitDeferredGrabIfReady();
    submitDeferredChiIfReady();
  },
);

watch(
  () => availableActions.value,
  () => {
    submitDeferredGrabIfReady();
    submitDeferredChiIfReady();
    if (!selectionMode.value) {
      return;
    }
    const current = availableActions.value.find(
      (item) => item.action === selectionMode.value && (item.enabled || item.deferred),
    );
    if (!current) {
      clearSelection();
      return;
    }
    if (
      selectedCandidateId.value &&
      !Boolean(current.candidates?.some((candidate) => candidate.id === selectedCandidateId.value))
    ) {
      selectedCandidateId.value = null;
    }
  },
  { deep: true },
);

watch(
  () => [
    roomNavigationProtected.value,
    activeRoomId.value,
    state.value?.phase ?? "",
    connectionState.value,
  ] as const,
  ([protectedNow]) => {
    if (!roomNavigationGuardMounted) {
      return;
    }
    if (protectedNow) {
      armRoomNavigationGuard();
    } else {
      releaseRoomNavigationGuard();
    }
  },
  { flush: "post" },
);

onMounted(() => {
  roomNavigationGuardMounted = true;
  window.addEventListener("popstate", handleRoomNavigationPopState);
  armRoomNavigationGuard();
  installLocalTestBridge();
  if (!entryName.value) {
    entryName.value = nicknameHistory.value[0] || generateRandomNickname();
  }
  declareTick = window.setInterval(() => {
    nowMs.value = Date.now();
  }, 500);
  writeStoredValue(DISPLAY_PREFERENCES_KEY, JSON.stringify(displayPreferences.value));
  void resumeStoredRoomSession();
});

onUnmounted(() => {
  roomNavigationGuardMounted = false;
  window.removeEventListener("popstate", handleRoomNavigationPopState);
  if (roomNavigationReleaseTimer !== null) {
    window.clearTimeout(roomNavigationReleaseTimer);
    roomNavigationReleaseTimer = null;
  }
  removeLocalTestBridge();
  if (declareTick !== null) {
    window.clearInterval(declareTick);
    declareTick = null;
  }
  if (globalNoticeTimer !== null) {
    window.clearTimeout(globalNoticeTimer);
    globalNoticeTimer = null;
  }
});

watch(globalError, (message) => {
  if (message) {
    clearGlobalNotice();
  }
});

watch(
  displayPreferences,
  (preferences) => {
    writeStoredValue(DISPLAY_PREFERENCES_KEY, JSON.stringify(preferences));
  },
  { deep: true },
);

function maybeAutoStartPractice() {
  if (!pendingPracticeAutoStart.value || !canPressStartGame.value) {
    return;
  }
  // 单人练习应该在房间准备就绪后立刻发 start_game，
  // 不能只依赖“ready 从 false 变 true”的 watcher，
  // 否则当 ready 先成立、pending 后置为 true 时会永远卡住。
  startGame();
  pendingPracticeAutoStart.value = false;
}

watch(
  () => [canPressStartGame.value, pendingPracticeAutoStart.value] as const,
  () => {
    maybeAutoStartPractice();
  },
  { immediate: true },
);

// 一旦房间离开 waiting 阶段（即已成功开局），清除自动开局标记以阻止后续重试。
watch(
  () => state.value?.phase,
  (phase) => {
    if (phase && phase !== "waiting" && pendingPracticeAutoStart.value) {
      pendingPracticeAutoStart.value = false;
    }
  },
);

// 更直接的兜底：一旦收到手牌，说明游戏已实际开始，立即清除 pending。
watch(
  () => privateHand.value.length,
  (length) => {
    if (length > 0 && pendingPracticeAutoStart.value) {
      pendingPracticeAutoStart.value = false;
    }
  },
);

const endPanelTitle = computed(() => {
  if (derivedWinnerId.value) {
    return "胡牌结算";
  }
  return "流局结算";
});
const derivedWinnerId = computed(() => {
  const explicit = huResult.value?.winnerId ?? roundResult.value?.winnerId;
  if (explicit) {
    return explicit;
  }
  const match = String(state.value?.lastAction ?? "").match(/^(\S+)\s+HU$/);
  return match?.[1] ?? "";
});

function participantDisplayName(player: { name: string; isConfiguredBot?: boolean }): string {
  return player.isConfiguredBot ? `${player.name}（机器人）` : player.name;
}

const winnerName = computed(() => {
  const winnerId = derivedWinnerId.value;
  if (!winnerId) {
    return "-";
  }
  const player = players.value.find((x) => x.clientId === winnerId);
  return player ? participantDisplayName(player) : winnerId;
});
const roundOutcomeText = computed(() => {
  if (!derivedWinnerId.value) {
    return "本局流局";
  }
  return derivedWinnerId.value === mySeatId.value ? "你胡牌了" : `${winnerName.value} 胡牌`;
});

const settlementPlayers = computed<RoundResultPlayer[]>(() => roundResult.value?.players ?? []);
const settlementReady = computed(() => Boolean(roundResult.value) && settlementPlayers.value.length === 4);
const isCumulativeSettlement = computed(() => roundResult.value?.scoringMode === "cumulative");
const settlementRoundNumber = computed(() => Math.max(1, Number(roundResult.value?.roundNumber ?? 1)));
const mySettlementPlayer = computed<RoundResultPlayer | null>(() =>
  settlementPlayers.value.find((player) => player.clientId === mySeatId.value) ?? null,
);
const orderedSettlementPlayers = computed<RoundResultPlayer[]>(() => {
  const winnerId = derivedWinnerId.value;
  return settlementPlayers.value
    .map((player, index) => ({ player, index }))
    .sort((a, b) => {
      const rank = (player: RoundResultPlayer): number => {
        if (player.clientId === mySeatId.value) return 0;
        if (winnerId && player.clientId === winnerId) return 1;
        return 2;
      };
      return rank(a.player) - rank(b.player) || a.index - b.index;
    })
    .map(({ player }) => player);
});
const remainingDeckPreview = computed<Card[]>(() => roundResult.value?.remainingDeck ?? []);

function splitCardGroups(cards: Card[], sizes: number[]): Card[][] {
  const groups: Card[][] = [];
  let offset = 0;
  for (const size of sizes) {
    if (!Number.isFinite(size) || size <= 0) {
      continue;
    }
    const chunk = cards.slice(offset, offset + size);
    offset += size;
    if (chunk.length === size) {
      groups.push(chunk);
    }
  }
  if (!groups.length && cards.length) {
    groups.push([...cards]);
  }
  return groups;
}

function splitExposedGroupsWithKinds(cards: Card[], sizes: number[], kinds: string[]): Array<{ cards: Card[]; kind: string }> {
  const groups = splitCardGroups(cards, sizes);
  return groups.map((group, index) => ({
    cards: group,
    kind: kinds[index] ?? "",
  }));
}

function splitFishGroups(cards: Card[]): Card[][] {
  if (!cards.length) {
    return [];
  }
  if (cards.every((card) => card.color === "gold")) {
    return [[...cards]];
  }
  const grouped = new Map<string, Card[]>();
  for (const card of cards) {
    const key = `${card.color}:${card.type}`;
    const list = grouped.get(key) ?? [];
    list.push(card);
    grouped.set(key, list);
  }
  return [...grouped.values()];
}

function isSameSettlementFace(cards: Card[]): boolean {
  if (!cards.length) {
    return false;
  }
  const head = cards[0];
  return cards.every((card) => card.color === head.color && card.type === head.type);
}

function settlementBadge(cards: Card[], kind = ""): string | undefined {
  if (!cards.length) {
    return undefined;
  }
  const head = cards[0];
  if (kind === "peng") {
    return "碰";
  }
  if (kind === "kai") {
    return "开";
  }
  if (head.color === "gold" && cards.length >= 3) {
    return cards.length >= 4 ? "开" : "坎";
  }
  if (cards.length === 2 && isSameSettlementFace(cards)) {
    return "对";
  }
  if (isSameSettlementFace(cards)) {
    if (cards.length >= 4) {
      return "开";
    }
    if (cards.length === 3) {
      return "坎";
    }
    return undefined;
  }
  if (cards.length === 4) {
    return "鱼";
  }
  return undefined;
}

function settlementGroupLabel(cards: Card[], kind = ""): string | undefined {
  if (!cards.length) {
    return undefined;
  }
  const head = cards[0];
  if (head.color === "gold") {
    if (cards.length >= 4 || kind === "kai") {
      return "金条开";
    }
    if (cards.length === 3) {
      return "金条坎";
    }
    if (cards.length === 1) {
      return "金条单张";
    }
  }
  if (kind === "peng") {
    return `${cardLabel(head)}碰`;
  }
  if (kind === "kai") {
    return `${cardLabel(head)}开`;
  }
  if (isSameSettlementFace(cards)) {
    if (cards.length >= 4) {
      return `${cardLabel(head)}开`;
    }
    if (cards.length === 3) {
      return `${cardLabel(head)}坎`;
    }
    if (cards.length === 2) {
      return `${cardLabel(head)}对子`;
    }
    if (cards.length === 1 && head.type === "jiang") {
      return `${cardLabel(head)}单张`;
    }
  }
  const sameColor = cards.every((card) => card.color === head.color);
  const types = new Set(cards.map((card) => card.type));
  const colorPrefix = cardLabel(head).slice(0, 1);
  if (sameColor && cards.length === 3 && types.has("ju") && types.has("ma") && types.has("pao")) {
    return `${colorPrefix}车马炮架`;
  }
  if (sameColor && cards.length === 3 && types.has("jiang") && types.has("shi") && types.has("xiang")) {
    const faces = ["jiang", "shi", "xiang"]
      .map((type) => getCardLabelText({ color: head.color, type }).slice(1))
      .join("");
    return `${colorPrefix}${faces}架`;
  }
  if (cards.length === 4) {
    return `${cardLabel(head)}鱼`;
  }
  return settlementBadge(cards, kind);
}

function settlementTone(cards: Card[]): SettlementGroupBlock["tone"] {
  const head = cards[0];
  if (!head) {
    return "meld";
  }
  if (head.color === "gold" || (isSameSettlementFace(cards) && cards.length >= 3)) {
    return "strong";
  }
  if (cards.length === 1 && (head.type === "jiang" || head.color === "gold")) {
    return "public";
  }
  if (cards.length === 4) {
    return "fish";
  }
  return "meld";
}

function settlementGroupBlocks(player: RoundResultPlayer): SettlementGroupBlock[] {
  const blocks: SettlementGroupBlock[] = [];
  (player.winningGroups ?? []).forEach((group, index) => {
    blocks.push({
      id: `winning-${index}-${group.cards.map((card) => card.id).join("-")}`,
      cards: group.cards,
      badge: settlementBadge(group.cards),
      label: settlementGroupLabel(group.cards),
      tone: settlementTone(group.cards),
    });
  });
  splitExposedGroupsWithKinds(player.exposedArea ?? [], player.exposedGroupSizes ?? [], player.exposedGroupKinds ?? []).forEach(({ cards, kind }, index) => {
    blocks.push({
      id: `meld-${index}-${cards.map((card) => card.id).join("-")}`,
      cards,
      badge: settlementBadge(cards, kind),
      label: settlementGroupLabel(cards, kind),
      tone: settlementTone(cards),
    });
  });
  (player.generalArea ?? []).forEach((card, index) => {
    blocks.push({
      id: `public-${index}-${card.id}`,
      cards: [card],
      badge: settlementBadge([card]),
      label: settlementGroupLabel([card]),
      tone: settlementTone([card]),
    });
  });
  splitFishGroups(player.fishArea ?? []).forEach((cards, index) => {
    blocks.push({
      id: `fish-${index}-${cards.map((card) => card.id).join("-")}`,
      cards,
      badge: settlementBadge(cards),
      label: settlementGroupLabel(cards),
      tone: settlementTone(cards),
    });
  });
  return blocks;
}

function settlementHandBlocks(player: RoundResultPlayer): SettlementGroupBlock[] {
  if (isSettlementWinner(player)) {
    return (player.resolvedHandGroups ?? []).map((group, index) => ({
      id: `hand-${index}-${group.cards.map((card) => card.id).join("-")}`,
      cards: group.cards,
      badge: settlementBadge(group.cards),
      label: settlementGroupLabel(group.cards),
      tone: settlementTone(group.cards),
    }));
  }

  return groupHandWithHiddenKans(player.hand ?? [], Number(player.declaredKongs ?? 0));
}

function groupHandWithHiddenKans(cards: Card[], declaredKongs: number): SettlementGroupBlock[] {
  const used = new Set<string>();
  const byFace = new Map<string, Card[]>();
  for (const card of cards) {
    const key = card.color === "gold" ? "gold" : `${card.color}:${card.type}`;
    const list = byFace.get(key) ?? [];
    list.push(card);
    byFace.set(key, list);
  }

  const blocks: SettlementGroupBlock[] = [];
  let remainingDeclaredKongs = Math.max(0, Math.floor(Number(declaredKongs) || 0));
  for (const [key, sameFaceCards] of byFace.entries()) {
    const kanCount = Math.floor(sameFaceCards.length / 3);
    for (let index = 0; index < kanCount; index += 1) {
      const chunk = sameFaceCards.slice(index * 3, index * 3 + 3);
      if (chunk.length !== 3) {
        continue;
      }
      chunk.forEach((card) => used.add(card.id));
      const isDeclaredKan = remainingDeclaredKongs > 0;
      if (isDeclaredKan) {
        remainingDeclaredKongs -= 1;
      }
      blocks.push({
        id: `${isDeclaredKan ? "hidden-kan" : "peng"}-${key}-${index}-${chunk.map((card) => card.id).join("-")}`,
        cards: chunk,
        badge: isDeclaredKan ? "坎" : "碰",
        label: settlementGroupLabel(chunk),
        tone: settlementTone(chunk),
      });
    }
  }

  const looseCards = cards.filter((card) => !used.has(card.id));
  if (looseCards.length) {
    blocks.push({
      id: `loose-${looseCards.map((card) => card.id).join("-")}`,
      cards: looseCards,
      tone: "meld",
    });
  }
  return blocks;
}

function signedScore(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  return `${value}`;
}

function scoreToneClass(value: number): string {
  if (value > 0) {
    return "positive";
  }
  if (value < 0) {
    return "negative";
  }
  return "neutral";
}

function isSettlementWinner(player: RoundResultPlayer): boolean {
  return Boolean(roundResult.value?.winnerId) && roundResult.value?.winnerId === player.clientId;
}

function settlementHandCardMode(playerId: string): RenderedCardMode {
  return playerId === mySeatId.value ? resolvedOwnCardMode.value : resolvedTableCardMode.value;
}

function huFormulaLineOrder(key: string): number {
  if (key === "HuBase") {
    return 0;
  }
  if (String(key).startsWith("HuBigMultiplier")) {
    return 2;
  }
  return 1;
}

const winnerSettlementPlayer = computed<RoundResultPlayer | null>(() => {
  const winnerId = roundResult.value?.winnerId;
  if (!winnerId) {
    return null;
  }
  return settlementPlayers.value.find((player) => player.clientId === winnerId) ?? null;
});

const huCalculationLines = computed(() =>
  (winnerSettlementPlayer.value?.scoreBreakdown ?? [])
    .filter((line) => /^Hu(Base|Win|BigMultiplier)/.test(String(line.key ?? "")))
    .map((line) => ({
      ...line,
      label: String(line.key ?? "").startsWith("HuBigMultiplier") ? "大胡整体 ×2" : line.label,
    }))
    .sort((a, b) => huFormulaLineOrder(a.key) - huFormulaLineOrder(b.key)),
);

const winnerPerOpponentScore = computed(() => {
  const winner = winnerSettlementPlayer.value;
  if (!winner) {
    return 0;
  }
  const payerCount = Math.max(1, settlementPlayers.value.filter((player) => player.clientId !== winner.clientId).length);
  return Math.round(winner.totalScore / payerCount);
});

function settlementScoreLines(player: RoundResultPlayer): Array<{ key: string; label: string; total: number }> {
  const winnerId = roundResult.value?.winnerId;
  if (!winnerId) {
    return (player.scoreBreakdown ?? []).map((line) => ({
      key: line.key,
      label: line.label,
      total: line.total,
    }));
  }
  const winner = settlementPlayers.value.find((item) => item.clientId === winnerId);
  const payers = settlementPlayers.value.filter((item) => item.clientId !== winnerId);
  const payerCount = payers.length || 1;
  const winnerPerOpponent = winner ? Math.round(winner.totalScore / payerCount) : 0;

  if (winnerId !== player.clientId) {
    const nonHuLines = (player.scoreBreakdown ?? [])
      .filter((line) => !/^Hu(Base|Lose|Win|BigMultiplier)/.test(String(line.key ?? "")))
      .map((line) => ({
        key: line.key,
        label: line.label,
        total: line.total,
      }));
    const huLine =
      winner && winnerPerOpponent
        ? [
            {
              key: `hu-pay-${winner.clientId}-${player.clientId}`,
              label: `${participantDisplayName(winner)} 收胡牌分`,
              total: -winnerPerOpponent,
            },
          ]
        : [];
    return [...huLine, ...nonHuLines];
  }
  return payers.map((payer) => ({
    key: `hu-pay-${payer.clientId}`,
    label: `${participantDisplayName(payer)} 付胡牌分`,
    total: winnerPerOpponent,
  }));
}

const endSummary = computed(() => {
  const action = String(state.value?.lastAction ?? "");
  if (action === "DECK_EMPTY" || action === "DRAW_GAME") {
    return "牌堆耗尽，流局。";
  }
  const noDiscardMatch = action.match(/^(\S+)\s+NO_DISCARD$/);
  if (noDiscardMatch) {
    const seatId = noDiscardMatch[1];
    const player = players.value.find((x) => x.clientId === seatId);
    return `${player ? participantDisplayName(player) : seatId} 无可弃牌，流局。`;
  }
  return "对局结束。";
});

const turnHint = computed(() => {
  if (openingDealActive.value) {
    return `发牌中，${openingDealSecondsLeft.value}s 后开局`;
  }
  if (canDiscard.value) {
    return "请点击手牌弃一张";
  }
  if (state.value?.responsePhase === "local_upper" && canAct.value) {
    return isMyTurn.value ? "可选择吃或抓" : "等待对方操作";
  }
  if (state.value?.responsePhase === "local_draw" && canAct.value) {
    if (isMyTurn.value && isPendingSpecialCard.value) {
      return "请选择一种吃法";
    }
    return isMyTurn.value ? "可选择吃或过" : "等待对方操作";
  }
  if (state.value?.responsePhase === "collective") {
    if (canAct.value) {
      return "全局待响阶段：你可以选择胡/开/碰/过";
    }
    return "等待三家响应";
  }
  return isMyTurn.value ? "轮到你操作" : "等待对方操作";
});

const currentPlayerName = computed(() => {
  const playerId = displayTurnPlayerId.value;
  if (!playerId) {
    return "-";
  }
  const player = players.value.find((x) => x.clientId === playerId);
  return player ? participantDisplayName(player) : playerId;
});

const roundDealerCard = computed<Card | null>(() => {
  const card = state.value?.dealerCard ?? null;
  return card?.id ? card : null;
});

async function enterLobby() {
  if (enteringLobby.value || enteredFrontLobby.value) {
    return;
  }
  const nickname = entryName.value.trim() || generateRandomNickname();
  entryName.value = nickname;
  globalError.value = "";
  writeStoredValue(ENTRY_NAME_KEY, nickname);
  const mergedHistory = [nickname, ...nicknameHistory.value.filter((item) => item !== nickname)].slice(0, 8);
  nicknameHistory.value = mergedHistory;
  writeNicknameHistory(mergedHistory);
  void updateGuestProfileNickname(nickname);
  enteredFrontLobby.value = true;
  const invitedRoomId = entryInviteRoomId.value;
  if (!invitedRoomId) {
    await nextTick();
    document.querySelector<HTMLButtonElement>("[data-testid='mode-practice_bots']")?.focus();
    return;
  }
  joiningFriendInvite.value = true;
  enteringLobby.value = true;
  try {
    const ok = await connect({
      nameOverride: nickname,
      roomId: invitedRoomId,
      exposeRoomIdInUrl: true,
    });
    if (!ok) {
      if (connectionState.value === "closed") {
        return;
      }
      throw new Error(joinError.value || "加入好友房失败");
    }
  } catch (error) {
    globalError.value = error instanceof Error ? error.message : "加入好友房失败";
    enteredFrontLobby.value = false;
  } finally {
    joiningFriendInvite.value = false;
    enteringLobby.value = false;
  }
}

function randomizeNickname() {
  entryName.value = generateRandomNickname();
}

async function returnToEntry() {
  if (hasLobbySession.value || enteringLobby.value) {
    return;
  }
  globalError.value = "";
  enteredFrontLobby.value = false;
  await nextTick();
  document.querySelector<HTMLInputElement>("[data-testid='nickname-input']")?.focus();
}

function startSelectedMode() {
  globalError.value = "";
  if (!hasLobbySession.value) {
    if (selectedLobbyMode.value === "friends") {
      void startFriendLobby();
    } else if (selectedLobbyMode.value === "quick_match") {
      void startQuickMatchLobby();
    } else {
      void startPracticeLobby();
    }
    return;
  }
  if (state.value?.roomMode === "friends" || state.value?.roomMode === "match") {
    startGame();
  } else {
    requestPracticeAutoStart();
  }
}

async function startQuickMatchLobby() {
  if (enteringLobby.value) {
    return;
  }
  const nickname = entryName.value.trim() || generateRandomNickname();
  entryName.value = nickname;
  startingRoomMode.value = "quick_match";
  enteringLobby.value = true;
  try {
    const ok = await connect({
      nameOverride: nickname,
      forceNew: true,
      matchmaking: true,
    });
    if (!ok) {
      throw new Error(joinError.value || "暂时无法快速配桌，请稍后重试。");
    }
  } catch (error) {
    globalError.value = error instanceof Error ? error.message : "暂时无法快速配桌，请稍后重试。";
  } finally {
    enteringLobby.value = false;
    if (!connected.value) {
      startingRoomMode.value = null;
    }
  }
}

function requestPracticeAutoStart() {
  pendingPracticeAutoStart.value = true;
  maybeAutoStartPractice();
}

async function startPracticeLobby() {
  if (enteringLobby.value) {
    return;
  }
  const nickname = entryName.value.trim() || generateRandomNickname();
  entryName.value = nickname;
  startingRoomMode.value = "practice";
  enteringLobby.value = true;
  try {
    const response = await fetch(`${HTTP_URL}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "practice" }),
    });
    if (!response.ok) {
      throw new Error(await apiErrorMessage(response, "创建单人练习房间失败，请稍后重试。"));
    }
    const payload = (await response.json()) as { ok?: boolean; roomId?: string; hostKey?: string; message?: string };
    if (!payload?.ok || !payload.roomId) {
      throw new Error(payload?.message || "创建单人练习房间失败");
    }
    const ok = await connect({
      nameOverride: nickname,
      roomId: payload.roomId,
      hostKey: payload.hostKey,
      forceNew: true,
    });
    if (!ok) {
      throw new Error(joinError.value || "进入大厅失败");
    }
    requestPracticeAutoStart();
  } catch (error) {
    globalError.value = error instanceof Error ? error.message : "进入大厅失败";
  } finally {
    enteringLobby.value = false;
    if (!connected.value) {
      startingRoomMode.value = null;
    }
  }
}

async function startFriendLobby() {
  if (enteringLobby.value) {
    return;
  }
  const nickname = entryName.value.trim() || generateRandomNickname();
  startingRoomMode.value = "friends";
  enteringLobby.value = true;
  try {
    const response = await fetch(`${HTTP_URL}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "friends" }),
    });
    if (!response.ok) {
      throw new Error(await apiErrorMessage(response, "创建好友房失败，请稍后重试。"));
    }
    const payload = (await response.json()) as { ok?: boolean; roomId?: string; hostKey?: string; message?: string };
    if (!payload.ok || !payload.roomId || !payload.hostKey) {
      throw new Error(payload.message || "创建好友房失败");
    }
    const ok = await connect({
      nameOverride: nickname,
      roomId: payload.roomId,
      hostKey: payload.hostKey,
      forceNew: true,
      exposeRoomIdInUrl: true,
    });
    if (!ok) {
      throw new Error(joinError.value || "进入好友房失败");
    }
  } catch (error) {
    globalError.value = error instanceof Error ? error.message : "创建好友房失败";
  } finally {
    enteringLobby.value = false;
    if (!connected.value) {
      startingRoomMode.value = null;
    }
  }
}

function buildInviteUrl(): string {
  if (!activeRoomId.value) {
    return "";
  }
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set("roomId", activeRoomId.value);
  return url.toString();
}

async function copyInviteLink() {
  if (!activeRoomId.value || inviteActionPending.value) {
    return;
  }
  inviteCopyReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  inviteActionPending.value = true;
  const inviteUrl = buildInviteUrl();
  let restoreFocus = true;
  try {
    if (canShareInvite && navigator.share) {
      try {
        await navigator.share({
          title: "四色牌好友房",
          text: `加入好友房 ${activeRoomId.value}，一起玩四色牌`,
          url: inviteUrl,
        });
        globalError.value = "";
        showGlobalNotice("邀请已分享，等待牌友加入");
        return;
      } catch (error) {
        if (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError") {
          return;
        }
      }
    }

    let copied = false;
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(inviteUrl);
        copied = true;
      } catch {
        copied = false;
      }
    }
    if (!copied) {
      const textarea = document.createElement("textarea");
      textarea.value = inviteUrl;
      textarea.readOnly = true;
      textarea.style.position = "fixed";
      textarea.style.inset = "0 auto auto -9999px";
      textarea.style.fontSize = "16px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, inviteUrl.length);
      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      } finally {
        textarea.remove();
      }
    }
    if (copied) {
      globalError.value = "";
      showGlobalNotice("邀请链接已复制，可以发给朋友了");
    } else {
      globalError.value = "";
      inviteCopyFallbackUrl.value = inviteUrl;
      restoreFocus = false;
    }
  } finally {
    inviteActionPending.value = false;
    if (restoreFocus) {
      const returnTarget = inviteCopyReturnFocus;
      inviteCopyReturnFocus = null;
      await nextTick();
      returnTarget?.isConnected && returnTarget.focus();
    }
  }
}

function showInviteQr(): void {
  const inviteUrl = buildInviteUrl();
  if (!inviteUrl || !activeRoomId.value) {
    return;
  }
  inviteQrReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  inviteQrRoomId.value = activeRoomId.value;
  inviteQrUrl.value = inviteUrl;
}

function closeInviteQr(restoreFocus = true): void {
  if (!inviteQrUrl.value) {
    return;
  }
  const returnTarget = inviteQrReturnFocus;
  inviteQrUrl.value = "";
  inviteQrRoomId.value = "";
  inviteQrReturnFocus = null;
  if (restoreFocus) {
    void nextTick(() => returnTarget?.isConnected && returnTarget.focus());
  }
}

function closeInviteCopyFallback(restoreFocus = true): void {
  if (!inviteCopyFallbackUrl.value) {
    return;
  }
  const returnTarget = inviteCopyReturnFocus;
  inviteCopyFallbackUrl.value = "";
  inviteCopyReturnFocus = null;
  if (restoreFocus) {
    void nextTick(() => returnTarget?.isConnected && returnTarget.focus());
  }
}

function clearGlobalNotice(): void {
  if (globalNoticeTimer !== null) {
    window.clearTimeout(globalNoticeTimer);
    globalNoticeTimer = null;
  }
  globalNotice.value = "";
}

function showGlobalNotice(message: string): void {
  clearGlobalNotice();
  globalNotice.value = message;
  globalNoticeTimer = window.setTimeout(() => {
    globalNotice.value = "";
    globalNoticeTimer = null;
  }, 3_000);
}

watch(
  () => state.value?.phase,
  (phase) => {
    if (phase && phase !== "waiting") {
      pendingPracticeAutoStart.value = false;
    }
    if (phase !== "waiting") {
      closeInviteCopyFallback(false);
      closeInviteQr(false);
    }
  },
);

watch(activeRoomId, (roomId, previousRoomId) => {
  if (roomId !== previousRoomId) {
    closeInviteQr(false);
  }
  if (previousRoomId && !roomId) {
    entryInviteRoomId.value = "";
  }
});

let lastGuestProfileRoundKey = "";
watch(
  () => `${activeRoomId.value}:${roundResult.value?.roundNumber ?? 0}`,
  (roundKey) => {
    if (!roundResult.value || roundKey === lastGuestProfileRoundKey) return;
    lastGuestProfileRoundKey = roundKey;
    refreshGuestProfileAfterSettlement();
  },
);

</script>

<style scoped>
.layout {
  --effective-viewport-width: var(--physical-viewport-width, 100vw);
  --effective-viewport-height: var(--physical-viewport-height, 100vh);
  --compact-board-self-row-height: clamp(
    6.75rem,
    calc(var(--physical-viewport-height, 100vh) * 0.31),
    7.5rem
  );
  --game-header-height: 3rem;
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  width: 100%;
  height: var(--physical-viewport-height, 100vh);
  max-width: none;
  margin: 0 auto;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: clamp(0.35rem, 1vh, 0.55rem);
  padding: clamp(0.25rem, 0.8vh, 0.5rem);
  background: radial-gradient(circle at 20% 20%, #0f172a 0%, #020617 60%);
  overflow: hidden;
}

.layout.rotated-phone-portrait {
  --effective-viewport-width: var(--physical-viewport-height, 100vh);
  --effective-viewport-height: var(--physical-viewport-width, 100vw);
  --compact-board-self-row-height: clamp(
    6.75rem,
    calc(var(--physical-viewport-width, 100vw) * 0.31),
    7.5rem
  );
  --safe-top: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-right, 0px);
  --safe-left: env(safe-area-inset-bottom, 0px);
  position: fixed;
  top: 0;
  left: var(--physical-viewport-width, 100vw);
  width: var(--physical-viewport-height, 100vh);
  height: var(--physical-viewport-width, 100vw);
  transform: rotate(90deg);
  transform-origin: top left;
}

.global-error {
  margin: 0;
}

.global-notice {
  margin: 0;
  padding: 0.55rem 0.75rem;
  border: 1px solid rgba(74, 222, 128, 0.6);
  border-radius: 0.65rem;
  background: rgba(20, 83, 45, 0.96);
  color: #dcfce7;
  font-weight: 750;
}

.reset-btn {
  margin-left: 0.25rem;
  font-family: inherit;
  font-size: max(0.875rem, 14px);
  font-weight: 750;
}

.layout.playing {
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.layout.compact-landscape.playing {
  grid-template-rows: var(--game-header-height) minmax(0, 1fr);
  gap: 0.2rem;
  padding: max(0.2rem, var(--safe-top)) max(0.2rem, var(--safe-right))
    max(0.2rem, var(--safe-bottom)) max(0.2rem, var(--safe-left));
}

.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: 0.65rem;
  padding: clamp(0.2rem, 0.8vh, 0.45rem) clamp(0.45rem, 1.2vw, 0.75rem);
  color: #e2e8f0;
  min-height: 0;
}

.top.game-control-header {
  position: relative;
  z-index: 110;
  height: var(--game-header-height);
  min-height: var(--game-header-height);
  flex: 0 0 auto;
  padding-block: 0.18rem;
  background:
    linear-gradient(90deg, rgba(120, 53, 15, 0.2), transparent 35%),
    rgba(7, 15, 28, 0.98);
  border-color: rgba(148, 163, 184, 0.32);
  box-shadow: 0 5px 18px rgba(2, 6, 23, 0.3);
}

.top-brand {
  display: grid;
  gap: 0.18rem;
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.brand-suits {
  display: flex;
  align-items: center;
  gap: 2px;
}

.brand-suits i {
  display: block;
  width: 0.34rem;
  height: 1.12rem;
  border-radius: 999px;
  background: #facc15;
  box-shadow: 0 0 7px rgba(250, 204, 21, 0.28);
}

.brand-suits i:nth-child(2) {
  background: #ef4444;
}

.brand-suits i:nth-child(3) {
  background: #22c55e;
}

.brand-suits i:nth-child(4) {
  background: #f8fafc;
}

.top h1 {
  margin: 0;
  font-size: clamp(0.95rem, 2.2vh, 1.25rem);
  line-height: 1;
}

.top-slogan {
  margin: 0;
  color: #fde68a;
  font-size: clamp(0.6rem, 1.3vh, 0.8rem);
}

.meta {
  display: flex;
  gap: clamp(0.35rem, 1vw, 0.65rem);
  color: #93c5fd;
  font-size: clamp(0.6rem, 1.4vh, 0.78rem);
  align-items: center;
}

.meta span {
  white-space: nowrap;
}

.meta.front-lobby-meta {
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 0.45rem;
  overflow: visible;
  color: #cbd5e1;
  font-size: 0.88rem;
}

.front-lobby-identity strong {
  color: #f8fafc;
  font-size: 1rem;
}

.front-lobby-meta .change-name {
  border-color: #0ea5e9;
  color: #e0f2fe;
}

.layout.game-tools-active .hu-mask,
.layout.game-tools-active .rules-mask,
.layout.game-tools-active .candidate-mask,
.layout.game-tools-active :deep(.declare-mask) {
  top: calc(var(--game-header-height) + 0.45rem);
}

.lobby {
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 12px;
  color: #e2e8f0;
  display: grid;
  gap: 0.9rem;
}

.entry-shell {
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: 18px;
  padding: clamp(0.9rem, 2vh, 1.3rem);
  color: #e2e8f0;
  display: grid;
  gap: 1rem;
}

.sync-shell {
  display: grid;
}

.sync-card {
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: 18px;
  padding: clamp(1rem, 2vh, 1.4rem);
  color: #e2e8f0;
  display: grid;
  gap: 0.45rem;
}

.sync-message {
  display: grid;
  gap: 0.45rem;
}

.resume-cancel {
  width: fit-content;
  min-height: 2.65rem;
  margin-top: 0.35rem;
  padding: 0.55rem 0.85rem;
  border: 1px solid #475569;
  border-radius: 0.7rem;
  background: #1e293b;
  color: #f8fafc;
  font-size: 1rem;
  font-weight: 750;
}

.resume-cancel:focus-visible {
  outline: 3px solid rgba(56, 189, 248, 0.42);
  outline-offset: 2px;
}

.entry-hero {
  display: grid;
  gap: 0.45rem;
}

.entry-kicker,
.lobby-kicker {
  margin: 0;
  color: #fbbf24;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.entry-hero h2,
.lobby-head h2 {
  margin: 0;
  font-size: clamp(1.2rem, 2.8vh, 1.6rem);
}

.entry-desc {
  margin: 0;
  color: #cbd5e1;
  max-width: 70ch;
  line-height: 1.65;
}

.entry-card {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
  border-radius: 16px;
  border: 1px solid #334155;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.92));
}

.entry-field {
  display: grid;
  gap: 0.45rem;
}

.entry-field span {
  color: #bfdbfe;
  font-size: 0.85rem;
  font-weight: 600;
}

.entry-input {
  width: min(26rem, 100%);
  min-height: 2.8rem;
  border-radius: 12px;
  border: 1px solid #475569;
  background: #020617;
  color: #f8fafc;
  padding: 0.7rem 0.85rem;
  font-size: 1rem;
}

.entry-input:focus {
  outline: none;
  border-color: #38bdf8;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.18);
}

.lobby-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
}

.mode-card {
  border: 1px solid #334155;
  border-radius: 14px;
  background: linear-gradient(180deg, #172033 0%, #0f172a 100%);
  color: #e2e8f0;
  padding: 0.9rem;
  display: grid;
  gap: 0.45rem;
  text-align: left;
  cursor: pointer;
}

.mode-card.active {
  border-color: #38bdf8;
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.3);
}

.mode-card.disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.mode-head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: baseline;
}

.mode-head strong {
  font-size: 0.98rem;
}

.mode-head span {
  font-size: 0.72rem;
  color: #93c5fd;
  white-space: nowrap;
}

.mode-card p {
  margin: 0;
  color: #cbd5e1;
  line-height: 1.55;
  font-size: 0.84rem;
}

.lobby-slogan {
  margin: 0 0 0.65rem;
  color: #fef3c7;
  font-size: clamp(0.82rem, 1.8vh, 1rem);
  font-weight: 700;
  letter-spacing: 0.04em;
}

.lobby-rule-tip {
  margin: 0;
  color: #93c5fd;
  font-size: clamp(0.72rem, 1.5vh, 0.88rem);
}

.lobby-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0;
}

.primary,
.ghost {
  border: none;
  border-radius: 8px;
  padding: 10px 14px;
  cursor: pointer;
  min-height: 48px;
}

.primary {
  background: #2563eb;
  color: #fff;
}

.primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ghost {
  background: #1f2937;
  color: #e2e8f0;
  border: 1px solid #334155;
}

.player-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.player-item {
  background: #111827;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lobby-mode-grid {
  margin-top: -0.1rem;
}

.error {
  color: #fca5a5;
}

.hu-mask {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.55);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 80;
  padding: max(0.35rem, var(--safe-top)) max(0.35rem, var(--safe-right))
    max(0.35rem, var(--safe-bottom)) max(0.35rem, var(--safe-left));
}

.rules-mask {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.72);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 92;
  padding: max(0.35rem, var(--safe-top)) max(0.35rem, var(--safe-right))
    max(0.35rem, var(--safe-bottom)) max(0.35rem, var(--safe-left));
}

.candidate-mask {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.68);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 95;
  padding: max(0.35rem, var(--safe-top)) max(0.35rem, var(--safe-right))
    max(0.35rem, var(--safe-bottom)) max(0.35rem, var(--safe-left));
}

.candidate-panel {
  width: min(760px, 96vw);
  max-height: 82vh;
  overflow: auto;
  background: #0b1220;
  border: 1px solid #1e3a5f;
  border-radius: 12px;
  color: #e2e8f0;
  padding: 12px;
  display: grid;
  gap: 10px;
}

.candidate-panel:focus-visible {
  outline: 3px solid #7dd3fc;
  outline-offset: 2px;
}

.candidate-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  position: sticky;
  top: -12px;
  z-index: 3;
  padding: 12px 0 8px;
  background: linear-gradient(180deg, #0b1220 78%, rgba(11, 18, 32, 0));
}

.candidate-head h3 {
  margin: 0;
  font-size: 18px;
}

.candidate-desc {
  margin: 0;
  color: #bfdbfe;
  font-size: 14px;
}

.candidate-list {
  display: grid;
  gap: 8px;
}

.candidate-item {
  border: 1px solid #334155;
  background: #1e293b;
  color: #e2e8f0;
  border-radius: 10px;
  padding: 10px;
  text-align: left;
  display: grid;
  gap: 4px;
  cursor: pointer;
  min-height: 48px;
}

.candidate-item.selected {
  border-color: #f59e0b;
  background: #3f2d0f;
}

.candidate-item:focus-visible {
  outline: 3px solid #bae6fd;
  outline-offset: 2px;
  border-color: #38bdf8;
}

.candidate-cards-preview {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}

.preview-col {
  display: grid;
  gap: 4px;
}

.preview-col small {
  color: #93c5fd;
}

.preview-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.candidate-raw {
  color: #cbd5e1;
}

.candidate-title {
  font-size: 14px;
  font-weight: 700;
}

.candidate-empty {
  margin: 0;
  color: #fca5a5;
}

.rules-panel {
  width: min(920px, 96vw);
  max-height: 88vh;
  overflow: auto;
  border-radius: 20px;
  background:
    radial-gradient(circle at top left, rgba(250, 204, 21, 0.14), transparent 30%),
    linear-gradient(180deg, #fffdf7 0%, #f8fafc 100%);
  color: #0f172a;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.42);
  padding: clamp(1rem, 2.4vh, 1.35rem);
  display: grid;
  gap: 0.9rem;
}

.rules-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.8rem;
  position: sticky;
  top: calc(-1 * clamp(1rem, 2.4vh, 1.35rem));
  z-index: 3;
  padding: clamp(1rem, 2.4vh, 1.35rem) 0 0.7rem;
  background: linear-gradient(180deg, #fffdf7 82%, rgba(255, 253, 247, 0));
}

.rules-kicker {
  margin: 0 0 0.2rem;
  color: #b45309;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.rules-head h2 {
  margin: 0;
  font-size: clamp(1.2rem, 2.5vh, 1.55rem);
}

.rules-slogan {
  margin: 0.35rem 0 0;
  color: #7c2d12;
  font-weight: 700;
  font-size: clamp(0.84rem, 1.75vh, 0.98rem);
}

.rules-section {
  display: grid;
  gap: 0.55rem;
  padding: 0.9rem 1rem;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  background: rgba(255, 255, 255, 0.82);
}

.rules-section h3 {
  margin: 0;
  font-size: clamp(0.96rem, 1.9vh, 1.1rem);
}

.rules-list {
  margin: 0;
  padding-left: 1.15rem;
  display: grid;
  gap: 0.38rem;
  color: #334155;
  font-size: clamp(0.78rem, 1.6vh, 0.92rem);
  line-height: 1.55;
}

.rules-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.rules-chip {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0.2rem 0.68rem;
  border-radius: 999px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1d4ed8;
  font-size: 0.82rem;
  font-weight: 600;
}

.hu-panel {
  background: #f8fafc;
  color: #0f172a;
  padding: clamp(0.9rem, 2vh, 1.2rem) clamp(1rem, 2.4vw, 1.4rem);
  border-radius: 12px;
  min-width: 300px;
  max-width: min(92vw, 1100px);
  max-height: 86vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  font-size: clamp(0.84rem, 1.45vh, 1rem);
}

.hu-panel:focus-visible {
  outline: 3px solid #38bdf8;
  outline-offset: -3px;
}

.settlement-fixed-head {
  flex: 0 0 auto;
}

.settlement-fixed-head h2 {
  margin: 0;
}

.settlement-scroll-region {
  flex: 1 1 auto;
  min-height: 0;
  margin-top: 0.65rem;
  padding-right: 0.2rem;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  -webkit-overflow-scrolling: touch;
}

.settlement-scroll-region:focus-visible {
  outline: 3px solid #2563eb;
  outline-offset: -3px;
  border-radius: 0.55rem;
}

.settlement-loading,
.round-overview {
  margin-top: 0.65rem;
  padding: 0.75rem 0.9rem;
  border-radius: 12px;
  display: grid;
  gap: 0.28rem;
}

.settlement-loading {
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1e3a8a;
}

.settlement-loading span {
  color: #334155;
}

.round-overview {
  border: 2px solid #f59e0b;
  background: #fffbeb;
  color: #451a03;
}

.round-overview strong {
  font-size: clamp(1.1rem, 2.8vh, 1.45rem);
}

.round-overview > span {
  font-size: clamp(0.96rem, 2.2vh, 1.15rem);
}

.round-overview .round-number {
  color: #92400e;
  font-weight: 800;
  letter-spacing: 0.03em;
}

.round-overview .cumulative-overview {
  width: fit-content;
  padding: 0.22rem 0.55rem;
  border-radius: 999px;
  background: #fef3c7;
  font-weight: 750;
}

.round-overview small {
  color: #57534e;
  font-size: clamp(0.78rem, 1.6vh, 0.9rem);
}

.round-overview b.positive {
  color: #166534;
}

.round-overview b.negative {
  color: #b91c1c;
}

.round-overview b.neutral {
  color: #0f172a;
}

.settlement {
  margin-top: 12px;
  border-top: 1px dashed #cbd5e1;
  padding-top: 10px;
}

.settlement h3 {
  margin: 0 0 8px;
  font-size: 15px;
}

@media (max-width: 720px) and (pointer: fine) {
  .rules-head {
    flex-direction: column;
  }

  .rules-panel {
    width: min(100vw, 100%);
    max-height: 100vh;
    border-radius: 16px;
  }
}

.end-global-info {
  margin: 6px 0 0;
  color: #f59e0b;
  font-weight: 600;
}

.settlement-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.settlement-item {
  position: relative;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #ffffff;
  padding: clamp(0.5rem, 1.1vh, 0.75rem);
}

.settlement-item.winner {
  box-shadow: 0 10px 24px rgba(59, 130, 246, 0.12);
}

.settlement-item.winner::after {
  content: "";
  position: absolute;
  inset: -2px;
  border-radius: 12px;
  padding: 2px;
  background: linear-gradient(135deg, #f43f5e, #f59e0b, #22c55e, #38bdf8, #a855f7);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
  animation: settlement-winner-glow 2.4s linear infinite;
}

.settlement-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  min-height: 2.75rem;
  cursor: pointer;
  list-style: none;
  border-radius: 0.45rem;
}

.settlement-head::-webkit-details-marker {
  display: none;
}

.settlement-head:focus-visible {
  outline: 3px solid #2563eb;
  outline-offset: 2px;
}

.settlement-person,
.settlement-result {
  min-width: 0;
  display: grid;
  align-content: center;
}

.settlement-result {
  flex: 0 0 auto;
  justify-items: end;
  gap: 0.12rem;
}

.score-caption,
.cumulative-total {
  font-size: clamp(0.72rem, 1.35vh, 0.82rem);
  font-weight: 700;
  line-height: 1.2;
}

.score-caption {
  color: #64748b;
}

.cumulative-total {
  padding: 0.12rem 0.42rem;
  border-radius: 999px;
  background: #f1f5f9;
  font-weight: 750;
}

.cumulative-total.positive {
  color: #166534;
}

.cumulative-total.negative {
  color: #b91c1c;
}

.cumulative-total.neutral {
  color: #334155;
}

.settlement-name {
  display: block;
  margin: 0 0 4px;
  font-weight: 600;
  font-size: clamp(0.92rem, 1.7vh, 1.08rem);
}

.settlement-bot-badge {
  display: inline-flex;
  align-items: center;
  min-height: 1.35rem;
  margin-left: 0.35rem;
  padding: 0.05rem 0.38rem;
  border: 1px solid #7dd3fc;
  border-radius: 999px;
  background: #e0f2fe;
  color: #075985;
  font-size: 0.72em;
  font-weight: 800;
  line-height: 1;
  vertical-align: middle;
}

.settlement-meta {
  display: block;
  margin: 0;
  font-size: clamp(0.72rem, 1.25vh, 0.84rem);
  color: #334155;
}

.settlement-toggle-label {
  color: #1d4ed8;
  font-size: clamp(0.7rem, 1.2vh, 0.8rem);
  font-weight: 700;
  white-space: nowrap;
}

.settlement-toggle-open {
  display: none;
}

.settlement-item[open] .settlement-toggle-closed {
  display: none;
}

.settlement-item[open] .settlement-toggle-open {
  display: inline;
}

.settlement-item-body {
  margin-top: 0.4rem;
  padding-top: 0.15rem;
  border-top: 1px solid #e2e8f0;
}

.settlement-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.settlement-cards.compact {
  gap: 4px;
}

.settlement-empty {
  margin: 0;
  color: #64748b;
}

.settlement-zone {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dashed #e2e8f0;
}

.zone-title {
  margin: 0 0 6px;
  font-size: clamp(0.72rem, 1.25vh, 0.84rem);
  color: #334155;
  font-weight: 600;
}

.settlement-group-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.settlement-group {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 2rem;
  max-width: 100%;
  padding: 0.24rem 0.32rem;
  border-radius: 0.72rem;
  border: 1px solid rgba(148, 163, 184, 0.8);
  background: rgba(241, 245, 249, 0.9);
}

.settlement-group.meld {
  border-color: rgba(148, 163, 184, 0.9);
  background: rgba(241, 245, 249, 0.92);
}

.settlement-group.fish {
  border-color: rgba(14, 165, 233, 0.6);
  background: rgba(224, 242, 254, 0.9);
}

.settlement-group.public {
  border-color: rgba(245, 158, 11, 0.6);
  background: rgba(254, 243, 199, 0.92);
}

.settlement-group.strong {
  border-color: rgba(185, 28, 28, 0.92);
  border-width: 2px;
  background:
    linear-gradient(180deg, rgba(255, 251, 235, 0.98), rgba(254, 242, 242, 0.96));
  box-shadow: 0 0 0 1px rgba(185, 28, 28, 0.12) inset;
}

.settlement-group-badge {
  flex: 0 0 auto;
  min-width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  border: 1px solid rgba(100, 116, 139, 0.55);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.88);
  color: #e2e8f0;
  font-size: clamp(0.68rem, 1.15vh, 0.78rem);
  font-weight: 700;
}

.score-breakdown {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dashed #e2e8f0;
}

.score-formula {
  display: grid;
  gap: 0.4rem;
}

.score-formula p {
  margin: 0;
  color: #0f172a;
  font-weight: 700;
}

.score-formula ul {
  margin: 0;
  padding-left: 18px;
}

.score-formula li {
  color: #0f172a;
  font-size: clamp(0.72rem, 1.25vh, 0.84rem);
}

.score-breakdown ul {
  margin: 0;
  padding-left: 18px;
}

.score-breakdown li {
  font-size: clamp(0.72rem, 1.25vh, 0.84rem);
  color: #0f172a;
}

.score-total {
  display: block;
  margin: 0;
  font-weight: 700;
  font-size: clamp(0.92rem, 1.75vh, 1.12rem);
}

.score-total.positive {
  color: #166534;
}

.score-total.negative {
  color: #b91c1c;
}

.score-total.neutral {
  color: #0f172a;
}

.end-actions {
  flex: 0 0 auto;
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.host-actions-hint {
  margin: 0;
  color: #475569;
  font-size: 0.82rem;
  line-height: 1.45;
}

.hu-panel > .end-actions {
  z-index: 5;
  padding-top: 0.65rem;
  border-top: 1px solid #cbd5e1;
  background: #f8fafc;
}

.table-return-mask {
  position: fixed;
  inset: 0;
  z-index: 130;
  display: grid;
  place-items: center;
  padding: max(0.7rem, env(safe-area-inset-top)) max(0.7rem, env(safe-area-inset-right))
    max(0.7rem, env(safe-area-inset-bottom)) max(0.7rem, env(safe-area-inset-left));
  background: rgba(2, 6, 23, 0.78);
}

.table-return-dialog {
  width: min(23rem, calc(var(--effective-viewport-width, 100vw) - 1.4rem));
  max-height: calc(var(--effective-viewport-height, 100vh) - 1.4rem);
  overflow: auto;
  padding: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.48);
  border-radius: 1rem;
  background: linear-gradient(160deg, #111827, #020617);
  color: #f8fafc;
  text-align: center;
  box-shadow: 0 20px 48px rgba(2, 6, 23, 0.62);
}

.table-return-symbol {
  width: 2.8rem;
  height: 2.8rem;
  margin: 0 auto 0.55rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(127, 29, 29, 0.48);
  color: #fecaca;
  font-size: 1.45rem;
}

.table-return-symbol.next-round {
  background: #14532d;
  color: #dcfce7;
  font-weight: 900;
}

.table-return-dialog h2,
.table-return-dialog p {
  margin: 0;
}

.table-return-dialog h2 {
  font-size: 1.2rem;
}

.table-return-dialog p {
  margin-top: 0.5rem;
  color: #cbd5e1;
  font-size: 0.9rem;
  line-height: 1.55;
}

.table-return-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
  margin-top: 0.9rem;
}

.table-return-actions button {
  min-height: 48px;
  padding: 0.55rem 0.65rem;
  border: 1px solid #475569;
  border-radius: 0.72rem;
  background: #1e293b;
  color: #f8fafc;
  font-weight: 800;
}

.table-return-actions button.danger {
  border-color: #dc2626;
  background: #b91c1c;
}

@keyframes settlement-winner-glow {
  0% {
    filter: hue-rotate(0deg);
  }
  100% {
    filter: hue-rotate(360deg);
  }
}

@media (max-width: 767px) and (pointer: fine) {
  .player-grid {
    grid-template-columns: 1fr;
  }

  .meta {
    flex-direction: column;
    gap: 4px;
    text-align: right;
  }

  .settlement-list {
    grid-template-columns: 1fr;
  }

  .candidate-cards-preview {
    grid-template-columns: 1fr;
  }

}

@media (max-height: 600px) {
  .layout {
    gap: 0.3rem;
    padding: 0.25rem;
  }

  .top {
    padding: 0.2rem 0.4rem;
  }

  .top h1 {
    font-size: clamp(0.86rem, 2vh, 1.05rem);
  }

  .meta {
    gap: 0.35rem;
    font-size: clamp(0.55rem, 1.25vh, 0.68rem);
  }

}

@media (max-width: 960px), (max-height: 500px) {
  .layout {
    --game-header-height: max(2.5rem, 40px);
    gap: 0.7vh;
    padding: max(0.25rem, var(--safe-top)) max(0.25rem, var(--safe-right))
      max(0.25rem, var(--safe-bottom)) max(0.25rem, var(--safe-left));
  }

  .layout.playing {
    grid-template-rows: auto minmax(0, 1fr) auto;
  }

  .top {
    border-radius: 1.2vh;
    padding: 0.45vh 1.2vw;
  }

  .top h1 {
    font-size: clamp(0.85rem, 2.2vh, 1.05rem);
  }

  .meta {
    font-size: clamp(0.54rem, 1.3vh, 0.66rem);
    gap: 1vw;
    flex-wrap: nowrap;
    justify-content: flex-end;
    overflow: hidden;
  }

  .layout.compact-landscape.playing {
    grid-template-rows: var(--game-header-height) minmax(0, 1fr);
    gap: 0.2rem;
    padding: max(0.15rem, var(--safe-top)) max(0.15rem, var(--safe-right))
      max(0.15rem, var(--safe-bottom)) max(0.15rem, var(--safe-left));
  }

  .top.game-control-header {
    border-radius: 0.65rem;
    padding-inline: 0.45rem;
  }
}

.layout.compact-viewport .hu-mask,
.layout.compact-viewport .rules-mask,
.layout.compact-viewport .candidate-mask {
  align-items: stretch;
}

.layout.compact-viewport .candidate-panel,
.layout.compact-viewport .rules-panel,
.layout.compact-viewport .hu-panel {
  width: 100%;
  max-width: none;
  min-width: 0;
  height: 100%;
  max-height: none;
  border-radius: 12px;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.layout.compact-viewport .rules-panel {
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  gap: 0.55rem;
  padding: 0.65rem;
}

.layout.compact-viewport .rules-head {
  grid-column: 1 / -1;
  top: -0.65rem;
  padding: 0.65rem 0 0.45rem;
}

.layout.compact-viewport .rules-section {
  padding: 0.65rem;
  border-radius: 12px;
}

.layout.compact-viewport .rules-list {
  font-size: max(0.9rem, 15px);
  line-height: 1.5;
}

.layout.compact-viewport .rules-chip {
  min-height: 2.15rem;
  font-size: max(0.84rem, 14px);
}

.layout.compact-viewport .hu-panel {
  padding: 0.65rem;
}

.layout.compact-viewport .settlement-scroll-region {
  margin-top: 0.45rem;
  padding-right: 0.15rem;
}

.layout.compact-viewport .settlement-list {
  grid-template-columns: minmax(0, 1fr);
  gap: 0.35rem;
}

.layout.compact-viewport .round-overview,
.layout.compact-viewport .settlement-loading {
  padding: 0.55rem 0.7rem;
}

.layout.compact-viewport .settlement-name {
  font-size: 1rem;
  font-weight: 750;
}

.layout.compact-viewport .settlement-item {
  padding: 0.35rem 0.55rem;
}

.layout.compact-viewport .settlement-head {
  min-height: 2.5rem;
}

.layout.compact-viewport .settlement-item[open] > .settlement-head {
  position: sticky;
  top: 0;
  z-index: 2;
  margin: -0.12rem -0.25rem 0;
  padding: 0.12rem 0.25rem;
  border-bottom: 1px solid #bfdbfe;
  background: #ffffff;
  box-shadow: 0 0.2rem 0.35rem rgba(15, 23, 42, 0.08);
}

.layout.compact-viewport .settlement-item.winner[open] > .settlement-head {
  background: #f8fafc;
}

.layout.compact-viewport .settlement-meta,
.layout.compact-viewport .zone-title,
.layout.compact-viewport .score-formula li,
.layout.compact-viewport .score-breakdown li {
  font-size: clamp(0.78rem, 3.2vh, 0.92rem);
  line-height: 1.4;
}

.layout.compact-viewport .settlement-cards :deep(.size-sm.mode-large) {
  width: clamp(2rem, 9vh, 2.25rem);
  height: clamp(2.2rem, 10vh, 2.5rem);
  font-size: clamp(1rem, 4.4vh, 1.15rem);
}

.layout.compact-viewport .candidate-panel {
  padding: 0.65rem;
}

.layout.compact-viewport .candidate-head {
  top: -0.65rem;
  padding: 0.65rem 0 0.45rem;
}

.layout.compact-viewport .hu-panel > .end-actions {
  margin-top: 0.45rem;
  padding-top: 0.45rem;
}

.layout.compact-viewport .ghost.mini,
.layout.compact-viewport .primary,
.layout.compact-viewport .ghost {
  min-height: 48px;
}

.layout.ultra-compact-viewport .top-slogan,
.layout.ultra-compact-viewport .meta > span:not(:first-child) {
  display: none;
}

.layout.ultra-compact-viewport .rules-slogan {
  display: none;
}

.layout.ultra-compact-viewport .rules-list {
  line-height: 1.45;
}

.layout.ultra-compact-viewport .settlement-fixed-head {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.layout.ultra-compact-viewport .settlement-fixed-head h2 {
  flex: 0 0 auto;
  font-size: 1.08rem;
  line-height: 1.15;
}

.layout.ultra-compact-viewport .round-overview,
.layout.ultra-compact-viewport .settlement-loading {
  flex: 1 1 auto;
  min-width: 0;
  margin-top: 0;
  padding: 0.32rem 0.55rem;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  line-height: 1.15;
}

.layout.ultra-compact-viewport .round-overview strong,
.layout.ultra-compact-viewport .settlement-loading strong {
  font-size: 1rem;
  white-space: nowrap;
}

.layout.ultra-compact-viewport .round-overview > span,
.layout.ultra-compact-viewport .settlement-loading > span {
  font-size: 0.88rem;
  white-space: nowrap;
}

.layout.ultra-compact-viewport .round-overview small {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.layout.ultra-compact-viewport .round-overview .cumulative-overview {
  position: static;
  width: auto;
  height: auto;
  margin: 0;
  padding: 0.2rem 0.42rem;
  overflow: visible;
  clip: auto;
  white-space: nowrap;
  border: 0;
  font-size: 0.84rem;
}

.layout.ultra-compact-viewport .settlement-scroll-region {
  margin-top: 0.3rem;
}

.layout.ultra-compact-viewport .end-global-info {
  display: none;
}

.layout.ultra-compact-viewport .settlement-player-section {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}

.layout.ultra-compact-viewport .settlement-player-section > h3 {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.layout.ultra-compact-viewport .settlement-list {
  gap: 0.25rem;
}

.layout.ultra-compact-viewport .settlement-item {
  padding: 0.14rem 0.45rem;
}

.layout.ultra-compact-viewport .settlement-head {
  min-height: 2.5rem;
  gap: 0.45rem;
}

.layout.ultra-compact-viewport .settlement-name {
  margin-bottom: 0.1rem;
  font-size: 0.94rem;
}

.layout.ultra-compact-viewport .settlement-meta,
.layout.ultra-compact-viewport .settlement-toggle-label {
  font-size: 0.75rem;
  line-height: 1.2;
}

.layout.ultra-compact-viewport .score-total {
  font-size: 1rem;
}

.layout.ultra-compact-viewport .score-caption,
.layout.ultra-compact-viewport .cumulative-total {
  font-size: 0.7rem;
}

.layout.ultra-compact-viewport .hu-panel > .end-actions {
  margin-top: 0.3rem;
  padding-top: 0.3rem;
}

.layout.reduce-motion :deep(*),
.layout.reduce-motion :deep(*::before),
.layout.reduce-motion :deep(*::after) {
  animation-delay: 0ms !important;
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  scroll-behavior: auto !important;
  transition-delay: 0ms !important;
  transition-duration: 0.01ms !important;
}

.layout.reduce-motion :deep(.fx-card),
.layout.reduce-motion :deep(.dealer-flight) {
  display: none !important;
}

@media (prefers-reduced-motion: reduce) {
  .layout :deep(*),
  .layout :deep(*::before),
  .layout :deep(*::after) {
    animation-delay: 0ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-delay: 0ms !important;
    transition-duration: 0.01ms !important;
  }

  .layout :deep(.fx-card),
  .layout :deep(.dealer-flight) {
    display: none !important;
  }
}
</style>
