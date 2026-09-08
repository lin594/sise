<template>
  <div
    ref="boardRef"
    class="board"
    :class="{
      'crowded-action-dock': crowdedActionDock,
      'hand-overflow': handHasOverflow,
      'rotated-scroll': props.viewportTransformKey?.endsWith(':rotated'),
      'dealer-ceremony-active': Boolean(dealerReveal),
      'board-declaring': state?.phase === 'declaring',
    }"
    data-testid="game-board"
    :data-geometry-busy="Boolean(flights.length || (!coordinateMotionSuppressed && activeTableEvents.length) || dealerReveal)"
    :data-table-layout="appliedTableLayout"
    :data-layout-pending="appliedTableLayout !== props.tableLayout"
    :data-response-phase="props.responsePhase ?? ''"
    :data-response-placement="responseCardPlacement"
    @keydown.esc="handleBoardEscape"
    @scroll.capture.passive="updateFlowScrollHints"
    @pointerdown.capture="startRotatedScroll"
    @pointermove.capture="moveRotatedScroll"
    @pointerup.capture="endRotatedScroll"
    @pointercancel.capture="endRotatedScroll"
    @click.capture="suppressScrollClick"
  >
    <div class="table" ref="tableRef">
      <div v-if="dealerReveal?.stage === 'revealed' && dealerReveal.pickerId" class="dealer-count-token" :key="dealerReveal.id" data-testid="dealer-count-status"
        :style="[dealerCounterPosition, reducedTableMotion ? { transition: 'none' } : {}]" :data-count-step="dealerCountStep" :data-count-seat="dealerCountingSeatId" :aria-label="`${dealerCountStep}，${dealerCountingName}`">{{ dealerCountStep }}</div>
      <div id="declaration-guidance-anchor" class="declaration-guidance-anchor" :style="{ visibility: dealerReveal || flights.length || tableFlights.length ? 'hidden' : undefined }" />
      <section
        v-if="flowTopLeftPlayer"
        class="flow-card flow-top-left"
        :class="{ 'flow-empty': flowCardCount(flowTopLeftPlayer.clientId) === 0 }"
        data-flow-lane="top-left"
        :data-flow-receiver-id="flowTopLeftPlayer.clientId"
        :aria-label="flowAccessibleTitle(flowTopLeftPlayer.clientId)"
      >
        <p aria-hidden="true">{{ flowTitle(flowTopLeftPlayer.clientId) }}</p>
        <div class="discard-strip" tabindex="0" aria-label="流水牌，可滚动查看">
          <CardComp
            v-for="(card, index) in visibleFlowCards(flowTopLeftPlayer.clientId)"
            :key="`flow-top-left-${card.id}`"
            :card="card"
            :style="movingCardStyle(card.id)"
            :mode="appliedTableCardMode"
            size="xs"
            class="discard-token"
            :class="{ active: isActiveDiscardCard(flowTopLeftPlayer.clientId, card, index) }"
            :title="cardLabel(card)"
          />
        </div>
      </section>

      <section
        v-if="topPlayer"
        :ref="(el) => topPlayer && setSeatRef(topPlayer.clientId, el as HTMLElement | null)"
        class="player-card player-top"
        data-testid="player-top"
        :data-dealer-count="dealerCountingSeatId === topPlayer.clientId ? (dealerReveal?.stage === 'picking' ? '翻' : dealerCountStep) : undefined"
        :data-player-id="topPlayer.clientId"
        role="group"
        :aria-label="playerAccessibleSummary(topPlayer, topGroupBlocks.length)"
        :class="{
          active: isCurrentTurn(topPlayer.clientId),
          dealer: showDealerSeatMarker(topPlayer.clientId),
          'actor-flash': flashActorId === topPlayer.clientId,
          'dealer-picker-active': dealerCountingSeatId === topPlayer.clientId,
        }"
      >
        <header class="seat-head">
          <div class="seat-identity">
            <strong>{{ topPlayer.name }}</strong>
            <span class="seat-identity-meta">
            <PlayerStatusIcon v-bind="statusIconProps(topPlayer)" />
            <span
              class="hand-count-badge"
              data-testid="opponent-hand-count"
              :data-player-id="topPlayer.clientId"
            >{{ playerHandCount(topPlayer) }}张</span>
            <span class="kan-count-badge" :aria-label="`开局声明暗坎 ${topPlayer.declaredKongs} 个`">{{ topPlayer.declaredKongs }}坎</span>
            <span class="group-score-badge" :class="{ positive: topPlayer.visibleGroupScore > 0 }" :aria-label="`当前明示牌组基础分 ${topPlayer.visibleGroupScore} 分`">牌面{{ topPlayer.visibleGroupScore }}分</span>
            </span>
            <span v-if="showDealerSeatMarker(topPlayer.clientId)" class="dealer-seat-lockup">
              <span class="dealer-badge" data-testid="dealer-badge">庄</span>
              <span class="dealer-card-mark" data-testid="dealer-card">
                <CardComp v-if="dealerInfoCard" :card="dealerInfoCard" :mode="appliedTableCardMode" size="xs" />
              </span>
            </span>
          </div>
          <div class="seat-tags">
            <span
              v-if="isCurrentTurn(topPlayer.clientId) && props.responsePhase !== 'collective' && seatCountdownSeconds !== null"
              class="turn-countdown"
            >
              剩余 {{ seatCountdownSeconds }}s
            </span>
          </div>
        </header>
        <div v-if="topGroupBlocks.length" class="group-block-list compact">
          <div
            v-for="group in topGroupBlocks"
            :key="`top-group-${group.id}`"
            class="group-block"
            :class="group.tone"
          >
            <span v-if="group.badge" class="group-badge">{{ group.badge }}</span>
            <div class="mini-card-strip stacked" :class="{ 'mode-long': appliedTableCardMode === 'long' }">
              <template v-if="group.faceDownCount">
                <span
                  v-for="slot in group.faceDownCount"
                  :key="`top-group-back-${group.id}-${slot}`"
                  class="mini-card pending-fish-back"
                  data-card-back="red-four-color"
                  aria-hidden="true"
                ><i v-for="mark in 4" :key="mark"></i></span>
              </template>
              <template v-else>
                <CardComp
                  v-for="card in group.cards"
                  :key="`top-group-card-${card.id}`"
                  :card="card"
                  :style="movingCardStyle(card.id)"
                  :mode="appliedTableCardMode"
                  size="xs"
                  class="mini-card"
                  :title="cardLabel(card)"
                />
              </template>
            </div>
          </div>
        </div>
      </section>

      <section
        v-if="flowTopRightPlayer"
        class="flow-card flow-top-right"
        :class="{ 'flow-empty': flowCardCount(flowTopRightPlayer.clientId) === 0 }"
        data-flow-lane="top-right"
        :data-flow-receiver-id="flowTopRightPlayer.clientId"
        :aria-label="flowAccessibleTitle(flowTopRightPlayer.clientId)"
      >
        <p aria-hidden="true">{{ flowTitle(flowTopRightPlayer.clientId) }}</p>
        <div class="discard-strip" tabindex="0" aria-label="流水牌，可滚动查看">
          <CardComp
            v-for="(card, index) in visibleFlowCards(flowTopRightPlayer.clientId)"
            :key="`flow-top-right-${card.id}`"
            :card="card"
            :style="movingCardStyle(card.id)"
            :mode="appliedTableCardMode"
            size="xs"
            class="discard-token"
            :class="{ active: isActiveDiscardCard(flowTopRightPlayer.clientId, card, index) }"
            :title="cardLabel(card)"
          />
        </div>
      </section>

      <section
        v-if="leftPlayer"
        :ref="(el) => leftPlayer && setSeatRef(leftPlayer.clientId, el as HTMLElement | null)"
        class="player-card player-left"
        data-testid="player-left"
        :data-dealer-count="dealerCountingSeatId === leftPlayer.clientId ? (dealerReveal?.stage === 'picking' ? '翻' : dealerCountStep) : undefined"
        :data-player-id="leftPlayer.clientId"
        role="group"
        :aria-label="playerAccessibleSummary(leftPlayer, leftGroupBlocks.length)"
        :class="{
          active: isCurrentTurn(leftPlayer.clientId),
          dealer: showDealerSeatMarker(leftPlayer.clientId),
          'actor-flash': flashActorId === leftPlayer.clientId,
          'dealer-picker-active': dealerCountingSeatId === leftPlayer.clientId,
        }"
      >
        <header class="seat-head">
          <div class="seat-identity">
            <strong>{{ leftPlayer.name }}</strong>
            <span class="seat-identity-meta">
            <PlayerStatusIcon v-bind="statusIconProps(leftPlayer)" />
            <span
              class="hand-count-badge"
              data-testid="opponent-hand-count"
              :data-player-id="leftPlayer.clientId"
            >{{ playerHandCount(leftPlayer) }}张</span>
            <span class="kan-count-badge" :aria-label="`开局声明暗坎 ${leftPlayer.declaredKongs} 个`">{{ leftPlayer.declaredKongs }}坎</span>
            <span class="group-score-badge" :class="{ positive: leftPlayer.visibleGroupScore > 0 }" :aria-label="`当前明示牌组基础分 ${leftPlayer.visibleGroupScore} 分`">牌面{{ leftPlayer.visibleGroupScore }}分</span>
            </span>
            <span v-if="showDealerSeatMarker(leftPlayer.clientId)" class="dealer-seat-lockup">
              <span class="dealer-badge" data-testid="dealer-badge">庄</span>
              <span class="dealer-card-mark" data-testid="dealer-card">
                <CardComp v-if="dealerInfoCard" :card="dealerInfoCard" :mode="appliedTableCardMode" size="xs" />
              </span>
            </span>
          </div>
          <div class="seat-tags">
            <span
              v-if="isCurrentTurn(leftPlayer.clientId) && props.responsePhase !== 'collective' && seatCountdownSeconds !== null"
              class="turn-countdown"
            >
              剩余 {{ seatCountdownSeconds }}s
            </span>
          </div>
        </header>
        <div v-if="leftGroupBlocks.length" class="group-block-list compact">
          <div
            v-for="group in leftGroupBlocks"
            :key="`left-group-${group.id}`"
            class="group-block"
            :class="group.tone"
          >
            <span v-if="group.badge" class="group-badge">{{ group.badge }}</span>
            <div class="mini-card-strip stacked" :class="{ 'mode-long': appliedTableCardMode === 'long' }">
              <template v-if="group.faceDownCount">
                <span
                  v-for="slot in group.faceDownCount"
                  :key="`left-group-back-${group.id}-${slot}`"
                  class="mini-card pending-fish-back"
                  data-card-back="red-four-color"
                  aria-hidden="true"
                ><i v-for="mark in 4" :key="mark"></i></span>
              </template>
              <template v-else>
                <CardComp
                  v-for="card in group.cards"
                  :key="`left-group-card-${card.id}`"
                  :card="card"
                  :style="movingCardStyle(card.id)"
                  :mode="appliedTableCardMode"
                  size="xs"
                  class="mini-card"
                  :title="cardLabel(card)"
                />
              </template>
            </div>
          </div>
        </div>
      </section>

      <section class="center" :class="{ 'my-turn': isMyTurn }">
        <div class="center-board">
          <div
            v-if="topPlayer"
            class="center-seat center-seat-top"
            :class="{ active: displayTurnPlayerId === topPlayer.clientId, action: hasSeatAction(topPlayer.clientId) }"
          >
            <div v-if="seatActionText(topPlayer.clientId)" class="center-seat-action">{{ seatActionText(topPlayer.clientId) }}</div>
          </div>
          <div
            v-if="leftPlayer"
            class="center-seat center-seat-left"
            :class="{ active: displayTurnPlayerId === leftPlayer.clientId, action: hasSeatAction(leftPlayer.clientId) }"
          >
            <div v-if="seatActionText(leftPlayer.clientId)" class="center-seat-action">{{ seatActionText(leftPlayer.clientId) }}</div>
          </div>
          <div class="center-stage">
            <div class="center-card-pair" data-testid="center-card-pair">
              <div class="deck-slot">
                <div
                  class="deck-stack"
                  ref="deckAnchorRef"
                  data-testid="deck-stack"
                  data-card-back="red-four-color"
                  role="img"
                  :aria-label="`牌堆剩余 ${props.state?.deckCount ?? 0} 张`"
                  :title="`牌堆剩余 ${props.state?.deckCount ?? 0} 张`"
                >
                  <span v-for="layer in 8" :key="layer" class="deck-layer" aria-hidden="true"></span>
                  <span class="deck-number" data-testid="deck-count" aria-hidden="true">
                    <strong>{{ props.state?.deckCount ?? 0 }}</strong><small>张</small>
                  </span>
                </div>
              </div>
              <div class="response-slot" ref="responseLandingRef">
                <div
                  v-if="centerCardVisible && responseCard"
                  class="pending-inline response-focus"
                  :class="{ 'draw-pending-hidden': isResponseCardDrawHidden || isMovingCard(responseCard.id) }"
                  data-testid="pending-card"
                >
                  <CardComp
                    :key="`resp-${appliedTableCardMode}-${responseCard.id}-${responseCard.source || 'upper'}`"
                    :card="responseCard"
                    :mode="appliedTableCardMode"
                    size="lg"
                    class="response-card-face"
                  />
                </div>
              </div>
            </div>
          </div>
          <div
            v-if="rightPlayer"
            class="center-seat center-seat-right"
            :class="{ active: displayTurnPlayerId === rightPlayer.clientId, action: hasSeatAction(rightPlayer.clientId) }"
          >
            <div v-if="seatActionText(rightPlayer.clientId)" class="center-seat-action">{{ seatActionText(rightPlayer.clientId) }}</div>
          </div>
          <div
            v-if="selfPlayer"
            class="center-seat center-seat-bottom"
            :class="{ active: displayTurnPlayerId === selfPlayer.clientId, action: hasSeatAction(selfPlayer.clientId) }"
          >
            <div v-if="seatActionText(selfPlayer.clientId)" class="center-seat-action">{{ seatActionText(selfPlayer.clientId) }}</div>
          </div>
        </div>
        <div v-if="centerPointerDirection" class="center-pointer" :class="`pointer-${centerPointerDirection}`">
          <i class="center-pointer-head"></i>
        </div>
      </section>

      <section
        v-if="rightPlayer"
        :ref="(el) => rightPlayer && setSeatRef(rightPlayer.clientId, el as HTMLElement | null)"
        class="player-card player-right"
        data-testid="player-right"
        :data-dealer-count="dealerCountingSeatId === rightPlayer.clientId ? (dealerReveal?.stage === 'picking' ? '翻' : dealerCountStep) : undefined"
        :data-player-id="rightPlayer.clientId"
        role="group"
        :aria-label="playerAccessibleSummary(rightPlayer, rightGroupBlocks.length)"
        :class="{
          active: isCurrentTurn(rightPlayer.clientId),
          dealer: showDealerSeatMarker(rightPlayer.clientId),
          'actor-flash': flashActorId === rightPlayer.clientId,
          'dealer-picker-active': dealerCountingSeatId === rightPlayer.clientId,
        }"
      >
        <header class="seat-head">
          <div class="seat-identity">
            <strong>{{ rightPlayer.name }}</strong>
            <span class="seat-identity-meta">
            <PlayerStatusIcon v-bind="statusIconProps(rightPlayer)" />
            <span
              class="hand-count-badge"
              data-testid="opponent-hand-count"
              :data-player-id="rightPlayer.clientId"
            >{{ playerHandCount(rightPlayer) }}张</span>
            <span class="kan-count-badge" :aria-label="`开局声明暗坎 ${rightPlayer.declaredKongs} 个`">{{ rightPlayer.declaredKongs }}坎</span>
            <span class="group-score-badge" :class="{ positive: rightPlayer.visibleGroupScore > 0 }" :aria-label="`当前明示牌组基础分 ${rightPlayer.visibleGroupScore} 分`">牌面{{ rightPlayer.visibleGroupScore }}分</span>
            </span>
            <span v-if="showDealerSeatMarker(rightPlayer.clientId)" class="dealer-seat-lockup">
              <span class="dealer-badge" data-testid="dealer-badge">庄</span>
              <span class="dealer-card-mark" data-testid="dealer-card">
                <CardComp v-if="dealerInfoCard" :card="dealerInfoCard" :mode="appliedTableCardMode" size="xs" />
              </span>
            </span>
          </div>
          <div class="seat-tags">
            <span
              v-if="isCurrentTurn(rightPlayer.clientId) && props.responsePhase !== 'collective' && seatCountdownSeconds !== null"
              class="turn-countdown"
            >
              剩余 {{ seatCountdownSeconds }}s
            </span>
          </div>
        </header>
        <div v-if="rightGroupBlocks.length" class="group-block-list compact">
          <div
            v-for="group in rightGroupBlocks"
            :key="`right-group-${group.id}`"
            class="group-block"
            :class="group.tone"
          >
            <span v-if="group.badge" class="group-badge">{{ group.badge }}</span>
            <div class="mini-card-strip stacked" :class="{ 'mode-long': appliedTableCardMode === 'long' }">
              <template v-if="group.faceDownCount">
                <span
                  v-for="slot in group.faceDownCount"
                  :key="`right-group-back-${group.id}-${slot}`"
                  class="mini-card pending-fish-back"
                  data-card-back="red-four-color"
                  aria-hidden="true"
                ><i v-for="mark in 4" :key="mark"></i></span>
              </template>
              <template v-else>
                <CardComp
                  v-for="card in group.cards"
                  :key="`right-group-card-${card.id}`"
                  :card="card"
                  :style="movingCardStyle(card.id)"
                  :mode="appliedTableCardMode"
                  size="xs"
                  class="mini-card"
                  :title="cardLabel(card)"
                />
              </template>
            </div>
          </div>
        </div>
      </section>

      <section
        v-if="flowBottomLeftPlayer"
        class="flow-card flow-bottom-left"
        :class="{ 'flow-empty': flowCardCount(flowBottomLeftPlayer.clientId) === 0 }"
        data-flow-lane="bottom-left"
        :data-flow-receiver-id="flowBottomLeftPlayer.clientId"
        :aria-label="flowAccessibleTitle(flowBottomLeftPlayer.clientId)"
      >
        <p aria-hidden="true">{{ flowTitle(flowBottomLeftPlayer.clientId) }}</p>
        <div class="discard-strip" tabindex="0" aria-label="流水牌，可滚动查看">
          <CardComp
            v-for="(card, index) in visibleFlowCards(flowBottomLeftPlayer.clientId)"
            :key="`flow-bottom-left-${card.id}`"
            :card="card"
            :style="movingCardStyle(card.id)"
            :mode="appliedTableCardMode"
            size="xs"
            class="discard-token"
            :class="{ active: isActiveDiscardCard(flowBottomLeftPlayer.clientId, card, index) }"
            :title="cardLabel(card)"
          />
        </div>
      </section>

      <section
        v-if="selfPlayer"
        class="self-groups-card"
        :class="{ empty: !selfGroupBlocks.length }"
        ref="selfOpenRef"
      >
        <template v-if="selfGroupBlocks.length">
          <div class="group-block-list">
            <div
              v-for="group in selfGroupBlocks"
              :key="`self-exp-${group.id}`"
              class="group-block"
              :class="group.tone"
            >
              <span v-if="group.badge" class="group-badge">{{ group.badge }}</span>
              <div class="mini-card-strip" :class="{ 'mode-long': appliedTableCardMode === 'long' }">
                <template v-if="group.faceDownCount">
                  <span
                    v-for="slot in group.faceDownCount"
                    :key="`self-group-back-${group.id}-${slot}`"
                    class="mini-card pending-fish-back"
                    data-card-back="red-four-color"
                    aria-hidden="true"
                  ><i v-for="mark in 4" :key="mark"></i></span>
                </template>
                <template v-else>
                  <CardComp
                    v-for="card in group.cards"
                    :key="`self-exp-card-${card.id}`"
                    :card="card"
                    :style="movingCardStyle(card.id)"
                    :mode="appliedTableCardMode"
                    size="xs"
                    class="mini-card"
                    :title="cardLabel(card)"
                  />
                </template>
              </div>
            </div>
          </div>
        </template>
      </section>

      <section
        v-if="flowBottomRightPlayer"
        class="flow-card flow-bottom-right"
        :class="{ 'flow-empty': flowCardCount(flowBottomRightPlayer.clientId) === 0 }"
        data-flow-lane="bottom-right"
        :data-flow-receiver-id="flowBottomRightPlayer.clientId"
        :aria-label="flowAccessibleTitle(flowBottomRightPlayer.clientId)"
      >
        <p aria-hidden="true">{{ flowTitle(flowBottomRightPlayer.clientId) }}</p>
        <div class="discard-strip" tabindex="0" aria-label="流水牌，可滚动查看">
          <CardComp
            v-for="(card, index) in visibleFlowCards(flowBottomRightPlayer.clientId)"
            :key="`flow-bottom-right-${card.id}`"
            :card="card"
            :style="movingCardStyle(card.id)"
            :mode="appliedTableCardMode"
            size="xs"
            class="discard-token"
            :class="{ active: isActiveDiscardCard(flowBottomRightPlayer.clientId, card, index) }"
            :title="cardLabel(card)"
          />
        </div>
      </section>

      <Transition name="deal-fade">
        <div v-if="showDealAnimation" class="deal-overlay">发牌中...</div>
      </Transition>

      <Transition name="quick-phrase">
        <div
          v-if="quickPhrase"
          class="quick-phrase-toast"
          data-testid="quick-phrase-toast"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <strong>{{ quickPhraseSpeakerName }}</strong>
          <span>{{ quickPhrase.text }}</span>
        </div>
      </Transition>

      <Transition name="quick-phrase">
        <div
          v-if="tableNoticeText"
          class="table-notice-toast"
          data-testid="table-notice-toast"
          :role="props.actionFeedback?.status === 'rejected' ? 'alert' : 'status'"
          aria-live="polite"
        >{{ tableNoticeText }}</div>
      </Transition>

      <div
        v-if="dealerReveal"
        :key="`dealer-${dealerReveal.id}`"
        class="dealer-reveal"
        :class="`stage-${dealerReveal.stage}`"
        data-testid="dealer-ceremony"
        role="status"
        aria-live="polite"
        :aria-label="dealerRevealAccessibleText"
      >
        <div class="dealer-reveal-panel">
            <strong v-if="dealerReveal.stage === 'picking'" class="dealer-picker-name" data-testid="dealer-picker-name">{{ dealerCountingName }}</strong>
            <div class="dealer-reveal-tile">
              <div
                v-if="dealerReveal.stage === 'picking'"
                class="dealer-reveal-back"
                data-testid="dealer-reveal-back"
                data-card-back="red-four-color"
                aria-hidden="true"
              >
                <span></span><span></span><span></span><span></span>
              </div>
              <div v-else-if="dealerCeremonyCard" class="dealer-reveal-card" data-testid="dealer-reveal-card">
                <CardComp :card="dealerCeremonyCard" :mode="appliedTableCardMode" size="xl" />
              </div>
            </div>
            <strong v-if="dealerCeremonyCard" class="dealer-reveal-card-name">
              {{ getCardAccessibleText(dealerCeremonyCard) }}
            </strong>
            <small v-if="dealerReveal.stage === 'revealed' && dealerReveal.dealerName && (!dealerReveal.pickerId || dealerCountingFinished)" class="dealer-reveal-result">
              {{ dealerReveal.dealerName }}坐庄
            </small>
        </div>
      </div>

    </div>

    <section
      v-if="selfPlayer && !dealerReveal"
      class="self-command-row"
      :class="{ dealer: showDealerSeatMarker(selfPlayer.clientId), 'actor-flash': flashActorId === selfPlayer.clientId }"
      data-testid="player-self"
      :data-player-id="selfPlayer.clientId"
      role="group"
      :aria-label="playerAccessibleSummary(selfPlayer, selfGroupBlocks.length)"
      ref="selfZoneRef"
    >
      <div class="clock-slot">
        <span
          v-if="showDecisionClock"
          class="fixed-clock"
          :class="{ urgent: /^\d+秒$/.test(fixedClockText) && parseInt(fixedClockText) <= 5 }"
          data-testid="decision-countdown"
        >{{ fixedClockText }}</span>
      </div>
      <div class="self-info-card">
        <header class="self-head">
          <div ref="selfIdentityRef" class="seat-identity">
            <h3 ref="selfNameRef" :title="selfPlayer.name" :data-name-fallback="useSelfNameFallback ? 'true' : 'false'">
              {{ useSelfNameFallback ? "你" : selfPlayer.name }}
            </h3>
            <span ref="selfNameMeasureRef" class="self-name-measure" aria-hidden="true">{{ selfPlayer.name }}</span>
            <span ref="selfIdentityMetaRef" class="seat-identity-meta">
              <PlayerStatusIcon v-bind="statusIconProps(selfPlayer)" />
              <span class="hand-count-badge" :aria-label="`剩余手牌 ${playerHandCount(selfPlayer)} 张`">{{ playerHandCount(selfPlayer) }}张</span>
              <span class="kan-count-badge" :aria-label="`开局声明暗坎 ${selfPlayer.declaredKongs} 个`">{{ selfPlayer.declaredKongs }}坎</span>
              <span class="group-score-badge" :class="{ positive: selfPlayer.visibleGroupScore > 0 }" :aria-label="`当前明示牌组基础分 ${selfPlayer.visibleGroupScore} 分`">牌面{{ selfPlayer.visibleGroupScore }}分</span>
            </span>
            <span v-if="showDealerSeatMarker(selfPlayer.clientId)" class="dealer-seat-lockup" data-testid="self-dealer-lockup">
              <span class="dealer-badge" data-testid="dealer-badge">庄</span>
              <span class="dealer-card-mark" data-testid="dealer-card">
                <CardComp v-if="dealerInfoCard" :card="dealerInfoCard" :mode="appliedTableCardMode" size="xs" />
              </span>
            </span>
          </div>
        </header>
      </div>

      <div class="dynamic-action-track" data-testid="dynamic-action-track">
        <slot name="declaration" />
        <ActionPanel
          v-if="props.state?.phase === 'playing' && (canAct || canDiscard)"
          class="embedded-actions action-dock"
          fixed-status
          :actions="props.actions ?? []"
          :can-act="canAct"
          :can-discard="canDiscard"
          :has-discard-selection="Boolean(selectedDiscardCardId)"
          :discard-pending="Boolean(discardingCardId)"
          :is-current-turn="Boolean(props.isCurrentTurn)"
          :response-phase="props.responsePhase ?? ''"
          :paused-hint="effectiveInteractionPausedMessage"
          :seconds-left="seatCountdownSeconds"
          :untimed="Boolean(props.decisionUntimed)"
          :decision-key="props.decisionKey ?? ''"
          :action-feedback="effectiveActionFeedback"
          :selected-chi-candidate-id="selectedChiCandidate?.id ?? null"
          @confirm-discard="confirmDiscard"
          @submit="onSubmitAction"
        />

      </div>
    </section>

    <Transition name="quick-phrase">
      <div
        v-if="flowStatusText"
        class="self-flow-toast"
        data-testid="decision-status"
        role="status"
        aria-live="polite"
      >{{ flowStatusText }}</div>
    </Transition>

    <section v-if="listeningDetailsOpen && listeningDetailWaits.length" id="listening-details" ref="listeningDetailsRef"
      class="listening-details" role="region" :aria-label="listeningDetailTitle" data-testid="listening-details"
      tabindex="0" @pointerdown="restartListeningTimer" @scroll.capture.passive="restartListeningTimer"
      @focusin="pauseListeningTimer" @focusout="() => nextTick(restartListeningTimer)">
      <header><strong>{{ listeningDetailTitle }}</strong><button type="button" aria-label="关闭听牌详情" @click="closeListeningDetails(true)">×</button></header>
      <div class="listening-details-cards" tabindex="0">
        <span v-for="wait in listeningDetailWaits" :key="wait.card.id" class="current-listening-card" :class="{ exhausted: wait.visibleRemaining === 0 }"
          :data-visible-remaining="wait.visibleRemaining" :data-card-id="wait.card.id" data-testid="listening-wait">
          <CardComp :card="wait.card" size="xs" mode="large" />
          <span class="wait-count-badge" data-testid="listening-wait-count">{{ wait.visibleRemaining }}张</span>
        </span>
      </div>
    </section>

    <section v-if="selfPlayer" class="self-hand-card" :class="{ 'declaring-hand': state?.phase === 'declaring' }">
      <div
        class="self-hand-panel"
        :class="{ 'has-toolbar': handLayout === 'paged' && handHasOverflow }"
      >
        <button
          v-if="listeningDetailWaits.length"
          ref="listeningToggleRef"
          class="listening-toggle"
          type="button"
          data-testid="listening-toggle"
          :aria-expanded="listeningDetailsOpen"
          aria-controls="listening-details"
          aria-label="查看听牌详情"
          @click="toggleListeningDetails"
        >听</button>
        <div v-if="handLayout === 'paged' && handHasOverflow" class="hand-toolbar">
          <div class="hand-scroll-tools" data-testid="hand-scroll-tools">
            <button
              type="button"
              data-testid="hand-scroll-prev"
              aria-label="向左翻看手牌"
              :disabled="!handCanScrollBackward"
              @click="scrollHand('backward')"
            >‹ 前翻</button>
            <span
              class="hand-visible-range"
              data-testid="hand-visible-range"
              :aria-label="handVisibleRangeLabel"
            >{{ handVisibleRange.start }}–{{ handVisibleRange.end }} / {{ handVisibleRange.total }}</span>
            <button
              type="button"
              data-testid="hand-scroll-next"
              aria-label="向右翻看更多手牌"
              :disabled="!handCanScrollForward"
              @click="scrollHand('forward')"
            >后翻 ›</button>
          </div>
        </div>
        <div
          ref="handViewportRef"
          class="hand-viewport"
          :class="{ 'single-line': handLayout !== 'paged' }"
        >
          <div
            class="cards hand"
            :style="{ '--hand-scale': handLayout !== 'paged' ? handScale : 1 }"
            :data-hand-scale="(handLayout !== 'paged' ? handScale : 1).toFixed(4)"
            :class="{
              'single-line': handLayout !== 'paged',
              'can-scroll-backward': handCanScrollBackward,
              'can-scroll-forward': handCanScrollForward,
            }"
            ref="selfHandRef"
            @scroll.passive="scheduleHandLayoutUpdate"
          >
            <button
              v-for="card in handLayoutCards"
              :key="`me-${card.id}`"
              :data-testid="`hand-card-${card.id}`"
              :data-card-id="card.id"
              class="hand-card"
              :class="{
                'mode-large': appliedOwnCardMode === 'large',
                'mode-long': appliedOwnCardMode === 'long',
                'deal-concealed': isDealConcealedCard(card.id),
                playable: !isDealConcealedCard(card.id) && canSelectHandCard(card),
                blocked: canDiscard && isDiscardProtectedCard(card),
                'gold-blocked': canDiscard && card.color === 'gold',
                'discard-selected': !chiSelectionDraftActive && selectedDiscardCardId === card.id,
                'candidate-active': isChiCardSelectable(card.id),
                'candidate-selected': selectedChiCardIds.includes(card.id),
              }"
              :aria-hidden="isDealConcealedCard(card.id) ? 'true' : undefined"
              :aria-pressed="chiSelectionDraftActive ? selectedChiCardIds.includes(card.id) : selectedDiscardCardId === card.id"
              :aria-label="isDealConcealedCard(card.id) ? undefined : handCardAccessibleLabel(card)"
              :tabindex="isDealConcealedCard(card.id) ? -1 : undefined"
              :disabled="isDealConcealedCard(card.id) || !canSelectHandCard(card) || Boolean(discardingCardId)"
              @click="selectHandCard(card.id)"
              @dblclick.prevent="ensureHandCardSelected(card.id)"
            >
              <span v-if="state?.phase === 'declaring' && declarationMarks?.fish.includes(card.id)" class="hand-mark fish-mark">鱼</span>
              <span v-else-if="state?.phase === 'declaring' && declarationMarks?.kong.includes(card.id)" class="hand-mark kan-mark">坎</span>
              <span
                v-else-if="isListeningDiscard(card.id)"
                class="hand-mark listening-mark"
                data-testid="listening-mark"
                :data-listening-context="listeningMarkContext"
              >听</span>
              <span
                v-if="!chiSelectionDraftActive && selectedDiscardCardId === card.id"
                class="discard-selection-badge"
                aria-hidden="true"
              >✓</span>
              <span
                v-else-if="selectedChiCardIds.includes(card.id)"
                class="candidate-selection-badge"
                aria-hidden="true"
              >✓</span>
              <span
                v-else-if="canDiscard && isDiscardProtectedCard(card)"
                class="discard-protected-badge"
                aria-hidden="true"
              >留</span>
              <CardComp :card="card"
              :style="movingCardStyle(card.id)" :mode="appliedOwnCardMode" size="xl" />
            </button>
          </div>
        </div>
      </div>
    </section>

    <div
      v-if="isMyTurn && !dealerReveal"
      class="self-turn-outline"
      data-testid="self-turn-outline"
      aria-hidden="true"
    ></div>

    <Teleport to="body">
      <div v-for="flight in tableFlights" :key="flight.key" class="table-flight"
        :style="flight.style" :data-transition-kind="flight.kind" :data-transition-card-id="flight.card.id"
        :data-transition-stage="flight.stage" :data-transition-to="flight.destinationZone" aria-hidden="true">
        <div class="table-flight-turn" :style="{ transform: `rotateY(${flight.rotation}deg)` }">
          <CardBack v-if="flight.back" :mode="appliedTableCardMode" />
          <CardComp
            v-else
            :card="flight.card"
            :mode="appliedTableCardMode"
            :size="flight.cardSize"
            :class="flight.cardClass"
            :style="flight.cardStyle"
          />
        </div>
      </div>
    </Teleport>
    <div class="fx-layer">
      <div
        v-for="flight in flights"
        :key="`fx-${flight.id}`"
        class="fx-card"
        :class="flight.mode"
        :style="flightStyle(flight)"
      >
        <CardBack v-if="flight.mode === 'deal'" :mode="appliedOwnCardMode" />
        <CardComp v-else-if="flight.card" :card="flight.card" :mode="appliedTableCardMode" size="md" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ListeningHints } from "@/types/game";
import { computed, nextTick, onMounted, onUnmounted, onBeforeUpdate, ref, watch } from "vue";
import ActionPanel from "./ActionPanel.vue";
import CardBack from "./CardBack.vue";
import CardComp from "./Card.vue";
import PlayerStatusIcon from "./PlayerStatusIcon.vue";
import type {
  ActionFeedback,
  ActionCandidate,
  ActionRequest,
  AvailableAction,
  Card,
  PlayerState,
  RenderedCardMode,
  RenderedTableLayoutId,
  SeatDirection,
  TableTransition,
  TableLocation,
} from "@/types/game";
import { visibleDecisionEndsAt } from "@/utils/decisionClock";
import { getCardAccessibleText, getCardLabelText } from "@/utils/cardText";
import {
  getDisplayedTurnPlayerId,
  getRoundKey,
  projectResponseCardPlacement,
} from "@/utils/gameFlowPresentation";

type ExposedGroup = {
  id: string;
  cards: Card[];
};

type VisibleGroupBlock = {
  id: string;
  cards: Card[];
  faceDownCount?: number;
  badge?: string;
  tone: "meld" | "fish" | "public";
};

type FlightMode = "deal" | "discard" | "meld";

type CardFlight = {
  id: number;
  mode: FlightMode;
  card?: Card;
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  width: number;
  height: number;
  duration: number;
  delay: number;
};

type CardRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type DealerReveal = {
  id: number;
  stage: "picking" | "revealed";
  label: string;
  card: Card | null;
  dealerId: string;
  dealerName: string;
  pickerId: string;
  startedAt: number;
};

const props = defineProps<{
  tableLayout?: RenderedTableLayoutId;
  handLayout?: "single" | "paged";
  listeningHints?: ListeningHints | null;
  acceptedStateRevision?: number;
  declarationMarks?: { fish: string[]; kong: string[] };
  state: any;
  players: PlayerState[];
  privateHand: Card[];
  mySeatId: string;
  canDiscard?: boolean;
  actions?: AvailableAction[];
  canAct?: boolean;
  isCurrentTurn?: boolean;
  responsePhase?: string;
  deferredChiPending?: boolean;
  interactionPausedMessage?: string;
  decisionUntimed?: boolean;
  decisionTimerTotalMs?: number;
  decisionTimerEndsAt?: number;
  decisionKey?: string;
  actionFeedback?: ActionFeedback | null;
  ultraCompact?: boolean;
  ownCardMode?: RenderedCardMode;
  tableCardMode?: RenderedCardMode;
  seatDirection?: SeatDirection;
  reduceMotion?: boolean;
  viewportTransformed?: boolean;
  viewportTransformKey?: string;
  quickPhrase?: { seatId: string; phraseId: string; text: string; sequence: number } | null;
}>();

const emit = defineEmits<{
  geometryBusy: [busy: boolean];
  discardCard: [cardId: string];
  submitAction: [request: ActionRequest];
}>();

const nowMs = ref(Date.now());

function isOpeningDealIntroState(): boolean {
  return (
    props.state?.phase === "declaring" &&
    /^DEALER(?:_PICK|_CARD)?\s+\S+/.test(String(props.state?.lastAction ?? ""))
  );
}

function shouldConcealOpeningHand(): boolean {
  return props.state?.phase === "waiting" || isOpeningDealIntroState();
}

const seatOrderedPlayers = computed<PlayerState[]>(() => {
  // 房间中的 Map 插入顺序会随加入、换座和机器人补位而变化，不能代表
  // A→B→C→D 的权威座次。
  return [...(props.players ?? [])].sort((left, right) => {
    const leftSeat = Number.isInteger(left.seatIndex) && left.seatIndex >= 0
      ? left.seatIndex
      : Number.MAX_SAFE_INTEGER;
    const rightSeat = Number.isInteger(right.seatIndex) && right.seatIndex >= 0
      ? right.seatIndex
      : Number.MAX_SAFE_INTEGER;
    return leftSeat - rightSeat || left.clientId.localeCompare(right.clientId);
  });
});

const orderedPlayers = computed<PlayerState[]>(() => {
  // 围绕本人旋转仅服务于视觉座位，不改变权威座次环。
  const list = seatOrderedPlayers.value;
  if (!list.length) {
    return [];
  }
  const idx = list.findIndex((p) => p.clientId === props.mySeatId);
  if (idx < 0) {
    return list;
  }
  return [...list.slice(idx), ...list.slice(0, idx)];
});

const selfPlayer = computed<PlayerState | null>(() => orderedPlayers.value[0] ?? null);
const topPlayer = computed<PlayerState | null>(() => orderedPlayers.value[2] ?? null);
const rightPlayer = computed<PlayerState | null>(() =>
  props.seatDirection === "clockwise" ? orderedPlayers.value[3] ?? null : orderedPlayers.value[1] ?? null,
);
const leftPlayer = computed<PlayerState | null>(() =>
  props.seatDirection === "clockwise" ? orderedPlayers.value[1] ?? null : orderedPlayers.value[3] ?? null,
);
const flowTopLeftPlayer = computed<PlayerState | null>(() =>
  props.seatDirection === "clockwise" ? topPlayer.value : leftPlayer.value,
);
const flowTopRightPlayer = computed<PlayerState | null>(() =>
  props.seatDirection === "clockwise" ? rightPlayer.value : topPlayer.value,
);
const flowBottomLeftPlayer = computed<PlayerState | null>(() =>
  props.seatDirection === "clockwise" ? leftPlayer.value : selfPlayer.value,
);
const flowBottomRightPlayer = computed<PlayerState | null>(() =>
  props.seatDirection === "clockwise" ? selfPlayer.value : rightPlayer.value,
);
const quickPhraseSpeakerName = computed(() => {
  const speaker = props.players.find((player) => player.clientId === props.quickPhrase?.seatId);
  if (!speaker) return "牌友";
  return speaker.clientId === props.mySeatId ? "你" : speaker.name;
});
const discardingCardId = ref<string | null>(null);
const selectedDiscardCardId = ref<string | null>(null);
const selectedChiCardIds = ref<string[]>([]);
const chiAutoSelectionBlockedKey = ref("");
const chiValidationMessage = ref("");
const retainedUpperResponseCardId = ref("");
let activeChiSelectionContextKey = "";
const locallyAnimatedDiscardCardId = ref<string | null>(null);
const flights = ref<CardFlight[]>([]);
const showDealAnimation = ref(false);
const visibleHandCount = ref(shouldConcealOpeningHand() ? 0 : props.privateHand.length);
const dealerReveal = ref<DealerReveal | null>(null);
const flashActorId = ref("");
const drawHiddenCardId = ref("");

const tableRef = ref<HTMLElement | null>(null);
const appliedTableCardMode = ref<RenderedCardMode>(props.tableCardMode ?? "large");
const appliedOwnCardMode = ref<RenderedCardMode>(props.ownCardMode ?? "large");
const boardRef = ref<HTMLElement | null>(null);
const responseLandingRef = ref<HTMLElement | null>(null);
const deckAnchorRef = ref<HTMLElement | null>(null);
const selfHandRef = ref<HTMLElement | null>(null);
const handViewportRef = ref<HTMLElement | null>(null);
const handScale = ref(1);
const handScaleReady = ref(!shouldConcealOpeningHand());
const handHasOverflow = ref(false);
const handCanScrollBackward = ref(false);
const handCanScrollForward = ref(false);
const handVisibleRange = ref({ start: 0, end: 0, total: 0 });
let handResizeObserver: ResizeObserver | null = null;
let handLayoutFrame: number | null = null;
const selfZoneRef = ref<HTMLElement | null>(null);
const selfOpenRef = ref<HTMLElement | null>(null);
const selfIdentityRef = ref<HTMLElement | null>(null);
const selfIdentityMetaRef = ref<HTMLElement | null>(null);
const selfNameRef = ref<HTMLElement | null>(null);
const selfNameMeasureRef = ref<HTMLElement | null>(null);
const useSelfNameFallback = ref(false);
const listeningToggleRef = ref<HTMLButtonElement | null>(null);
const listeningDetailsRef = ref<HTMLElement | null>(null);
const listeningDetailsOpen = ref(false);
let selfNameResizeObserver: ResizeObserver | null = null;
const seatRefMap = new Map<string, HTMLElement>();

function updateSelfNameFit(): void {
  const identity = selfIdentityRef.value;
  const nameElement = selfNameRef.value;
  const measure = selfNameMeasureRef.value;
  if (!identity || !nameElement || !measure) {
    useSelfNameFallback.value = false;
    return;
  }
  const style = getComputedStyle(identity);
  const gap = Number.parseFloat(style.columnGap || style.gap || "0") || 0;
  const siblings = Array.from(identity.children).filter(
    (child) => child !== nameElement && child !== measure,
  ) as HTMLElement[];
  const available = style.display === "grid"
    ? nameElement.clientWidth
    : identity.clientWidth - siblings.reduce((sum, child) => sum + child.offsetWidth, 0) - gap * siblings.length;
  useSelfNameFallback.value = measure.scrollWidth > Math.max(24, available);
}

function observeSelfNameFit(): void {
  selfNameResizeObserver?.disconnect();
  selfNameResizeObserver = null;
  if (typeof ResizeObserver !== "undefined" && selfIdentityRef.value) {
    selfNameResizeObserver = new ResizeObserver(updateSelfNameFit);
    selfNameResizeObserver.observe(selfIdentityRef.value);
    if (selfIdentityMetaRef.value) selfNameResizeObserver.observe(selfIdentityMetaRef.value);
    if (selfNameRef.value) selfNameResizeObserver.observe(selfNameRef.value);
    if (selfNameMeasureRef.value) selfNameResizeObserver.observe(selfNameMeasureRef.value);
  }
  void nextTick(updateSelfNameFit);
}

let dealerRevealSeq = 0;
let flightSeq = 0;
let dealRunSeq = 0;
let dealFrame: number | null = null;
let preparedDealRoundKey = "";
let presentedDealRoundKey = "";
let animatedActionRoundKey = "";
const animatedActionKeys = new Set<string>();
const animatedSemanticActionKeys = new Set<string>();
let dealerTimer: ReturnType<typeof setTimeout> | null = null;
let dealerIntroTimer: ReturnType<typeof setTimeout> | null = null;
let flashTimer: ReturnType<typeof setTimeout> | null = null;
let drawHideTimer: ReturnType<typeof setTimeout> | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let discardPendingTimer: ReturnType<typeof setTimeout> | null = null;
let localDiscardAckTimer: ReturnType<typeof setTimeout> | null = null;
let chiValidationTimer: ReturnType<typeof setTimeout> | null = null;
const OP_COUNTDOWN_MS = 30000;

function splitExposedGroups(cards: Card[], sizes: number[], prefix: string): ExposedGroup[] {
  const normalizeResponseFlag = (chunk: Card[]): Card[] => {
    const firstResponseIndex = chunk.findIndex((card) => Boolean(card.isResponseCard));
    if (firstResponseIndex < 0) {
      return chunk.map((card) => ({ ...card }));
    }
    return chunk.map((card, idx) => ({
      ...card,
      isResponseCard: idx === firstResponseIndex,
    }));
  };

  const cleanSizes = sizes.filter((size) => Number.isFinite(size) && size > 0);
  const total = cleanSizes.reduce((sum, size) => sum + size, 0);
  if (!cleanSizes.length || total !== cards.length) {
    return cards.map((card, idx) => ({ id: `${prefix}-fallback-${idx}`, cards: [{ ...card }] }));
  }

  const groups: ExposedGroup[] = [];
  let offset = 0;
  for (let idx = 0; idx < cleanSizes.length; idx += 1) {
    const size = cleanSizes[idx];
    const chunk = normalizeResponseFlag(cards.slice(offset, offset + size));
    offset += size;
    if (chunk.length > 0) {
      groups.push({ id: `${prefix}-${idx}`, cards: chunk });
    }
  }
  return groups;
}

function buildOpenGroups(player: PlayerState, prefix: string): ExposedGroup[] {
  const exposed = splitExposedGroups(player.exposedArea ?? [], player.exposedGroupSizes ?? [], `${prefix}-exp`);
  const generals = (player.generalArea ?? []).map((card, idx) => ({ id: `${prefix}-gen-${idx}`, cards: [{ ...card }] }));
  return [...exposed, ...generals];
}

function splitFishGroups(cards: Card[], prefix: string): ExposedGroup[] {
  const groups: ExposedGroup[] = [];
  const buckets = new Map<string, Card[]>();
  const order: string[] = [];
  for (const card of cards) {
    const key = `${card.color}:${card.type}`;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push({ ...card });
  }
  order.forEach((key, index) => {
    const cardsInGroup = buckets.get(key) ?? [];
    if (cardsInGroup.length) {
      groups.push({ id: `${prefix}-fish-${index}`, cards: cardsInGroup });
    }
  });
  return groups;
}

function buildPlayerGroupBlocks(player: PlayerState, prefix: string): VisibleGroupBlock[] {
  // 鱼的具体牌面属于声明阶段的隐私：只公开每组张数，等所有玩家完成声明后
  // 才由服务端把真实牌面移入 fishArea 并统一翻开。
  const pendingFish = (player.pendingFishGroupSizes ?? []).map((size, index) => ({
    id: `${prefix}-pending-fish-${index}`,
    cards: [],
    faceDownCount: Math.max(0, Number(size) || 0),
    badge: "鱼",
    tone: "fish" as const,
  }));
  const fish = splitFishGroups(player.fishArea ?? [], prefix).map((group) => ({
    ...group,
    badge: "鱼",
    tone: "fish" as const,
  }));
  const exposed = splitExposedGroups(player.exposedArea ?? [], player.exposedGroupSizes ?? [], `${prefix}-exp`).map((group) => ({
    ...group,
    tone: "meld" as const,
  }));
  return [...pendingFish, ...fish, ...exposed];
}

const selfGroupBlocks = computed<VisibleGroupBlock[]>(() => {
  const player = selfPlayer.value;
  if (!player) {
    return [];
  }
  return buildPlayerGroupBlocks(player, `self-${player.clientId}`);
});

const topGroupBlocks = computed<VisibleGroupBlock[]>(() => {
  const player = topPlayer.value;
  if (!player) {
    return [];
  }
  return buildPlayerGroupBlocks(player, `seat-${player.clientId}`);
});

const leftGroupBlocks = computed<VisibleGroupBlock[]>(() => {
  const player = leftPlayer.value;
  if (!player) {
    return [];
  }
  return buildPlayerGroupBlocks(player, `seat-${player.clientId}`);
});

const rightGroupBlocks = computed<VisibleGroupBlock[]>(() => {
  const player = rightPlayer.value;
  if (!player) {
    return [];
  }
  return buildPlayerGroupBlocks(player, `seat-${player.clientId}`);
});

const latestDiscardFromAction = computed<Card | null>(() => {
  const match = String(props.state?.lastAction ?? "").match(/^(\S+)\s+DISCARD$/);
  if (!match) {
    return null;
  }

  const ownerId = match[1];
  const owner = props.players.find((x) => x.clientId === ownerId);
  const ownerDiscardCount = owner?.discardPile?.length ?? 0;
  const latestDiscard = ownerDiscardCount > 0 ? owner?.discardPile?.[ownerDiscardCount - 1] : undefined;
  if (latestDiscard?.id) {
    return { ...latestDiscard, source: "upper" };
  }

  const publicTop = props.state?.publicDiscardPile?.[props.state?.publicDiscardPile?.length - 1];
  if (publicTop?.id) {
    return { ...(publicTop as Card), source: "upper" };
  }

  return null;
});

const responseCard = computed<Card | null>(() => {
  const directResponse = props.state?.responseCard;
  if (directResponse?.id) {
    return directResponse as Card;
  }

  const directTarget = props.state?.targetCard;
  if (props.state?.responsePhase === "collective" && directTarget?.id) {
    return directTarget as Card;
  }

  if (props.state?.tablePresentationVersion) return null;
  const collective = props.state?.responsePhase === "collective";
  if (collective) {
    const publicCount = props.state?.publicDiscardPile?.length ?? 0;
    const publicTop = publicCount > 0 ? props.state?.publicDiscardPile?.[publicCount - 1] : undefined;
    if (publicTop?.id) {
      return { ...(publicTop as Card), source: "upper" };
    }
    if (latestDiscardFromAction.value?.id) {
      return latestDiscardFromAction.value;
    }
  }

  const card = props.state?.responseCard;
  if (card?.id) {
    return card as Card;
  }

  return collective ? latestDiscardFromAction.value : null;
});

function getPreviousPlayer(playerId: string): PlayerState | null {
  const list = seatOrderedPlayers.value;
  const idx = list.findIndex((player) => player.clientId === playerId);
  if (idx < 0 || list.length === 0) {
    return null;
  }
  return list[(idx - 1 + list.length) % list.length] ?? null;
}

function getNextPlayer(playerId: string): PlayerState | null {
  const list = seatOrderedPlayers.value;
  const idx = list.findIndex((player) => player.clientId === playerId);
  if (idx < 0 || list.length === 0) {
    return null;
  }
  return list[(idx + 1) % list.length] ?? null;
}

function flowOwner(playerId: string): PlayerState | null {
  return getPreviousPlayer(playerId);
}

function flowTitle(playerId: string): string {
  const receiver = props.players.find((player) => player.clientId === playerId);
  const sender = flowOwner(playerId);
  if (!receiver?.name || !sender?.name) {
    return "流水";
  }
  return `${sender.name} → ${receiver.name}`;
}

function flowAccessibleTitle(playerId: string): string {
  const receiver = props.players.find((player) => player.clientId === playerId);
  const sender = flowOwner(playerId);
  if (!receiver?.name || !sender?.name) {
    return "流水牌";
  }
  return `流水：${sender.name} 打给 ${receiver.name}`;
}

const activeFlowSourcePlayerId = computed(() => {
  const pending = responseCard.value;
  if (!pending || pending.source !== "upper") {
    return "";
  }
  return String(props.state?.pollOriginPlayerId || props.state?.previousPlayerId || "");
});

const activeFlowTargetPlayerId = computed(() => {
  const sourcePlayerId = activeFlowSourcePlayerId.value;
  if (!sourcePlayerId) {
    return "";
  }
  return getNextPlayer(sourcePlayerId)?.clientId ?? "";
});

const responseCardPlacement = computed(() => projectResponseCardPlacement({
  phase: String(props.state?.phase ?? ""),
  responsePhase: String(props.state?.responsePhase ?? ""),
  hasResponseCard: Boolean(responseCard.value),
  currentPlayerId: String(props.state?.currentPlayerId ?? ""),
  viewerPlayerId: props.mySeatId,
}));

watch(
  () => `${responseCard.value?.id ?? ""}|${responseCardPlacement.value}|${props.state?.responsePhase ?? ""}`,
  () => {
    if (props.state?.responsePhase === "local_upper" && responseCardPlacement.value === "center") {
      retainedUpperResponseCardId.value = responseCard.value?.id ?? "";
    }
  },
  { immediate: true },
);

function shouldAppendPendingToFlow(playerId: string): boolean {
  const pending = responseCard.value;
  if (!pending || pending.source !== "upper" || responseCardPlacement.value !== "flow") {
    return false;
  }
  if (activeFlowTargetPlayerId.value !== playerId) {
    return false;
  }
  const owner = props.players.find((player) => player.clientId === activeFlowSourcePlayerId.value);
  return !owner?.discardPile?.some((card) => card.id === pending.id);
}

function flowCards(playerId: string): Card[] {
  const owner = flowOwner(playerId);
  const cards = owner?.discardPile ? [...owner.discardPile].filter((card) => !(
    responseCardPlacement.value === "center" && responseCard.value?.id === card.id
  )) : [];
  if (shouldAppendPendingToFlow(playerId) && responseCard.value) {
    cards.push(responseCard.value);
  }
  return cards;
}

const presentationTick = ref(Date.now());
let presentationFrame: number | null = null;
const presentationNow = computed(() => presentationTick.value + Number(props.state?.presentationClockOffsetMs ?? 0));
const rawTableEvents = computed<TableTransition[]>(() => props.state?.tableTransitions ?? []);
const tableEvents = computed<TableTransition[]>(() => rawTableEvents.value.flatMap((event) => {
  const moves = event.moves.flatMap((move) => {
    if (
      responseCardPlacement.value === "center" &&
      responseCard.value?.id === move.card.id &&
      move.to.zone === "flow"
    ) return [];
    if (
      move.card.id === retainedUpperResponseCardId.value &&
      move.to.zone === "meld" &&
      move.to.playerId === props.mySeatId &&
      move.from.zone === "flow"
    ) return [{ ...move, from: { zone: "center" as const } }];
    return [move];
  });
  return moves.length ? [{ ...event, moves }] : [];
}));
const lastCardRects = new Map<string, CardRect>();
const tableFlightSources = new Map<string, CardRect>();
const tableFlightDestinations = new Map<string, CardRect>();
const tableFlightFaceStyles = new Map<string, Record<string, string>>();
let presentationScopeKey = "";
let lastPresentationPaintAt = 0;
watch(() => props.viewportTransformKey, () => {
  // A resize or a switch between native and CSS-rotated landscape invalidates
  // every cached DOMRect. Re-sample in the new coordinate space instead of
  // stretching an in-flight card toward an obsolete rectangle.
  lastCardRects.clear();
  tableFlightSources.clear();
  tableFlightDestinations.clear(); tableFlightFaceStyles.clear();
  flights.value = [];
  lastPresentationPaintAt = 0;
}, { flush: "sync" });
// Same-revision snapshots can correct the clock after the RAF loop went idle.
// Restart it so revived transitions expire and release deferred viewport changes.
watch(() => [props.state?.roomId, props.state?.completedRounds, props.state?.phase, props.state?.tableTransitions, props.state?.presentationClockOffsetMs] as const, () => {
  if (presentationFrame !== null) cancelAnimationFrame(presentationFrame);
  const nextScopeKey = getRoundKey(props.state?.roomId, props.state?.completedRounds, props.state?.phase);
  if (nextScopeKey !== presentationScopeKey) {
    presentationScopeKey = nextScopeKey;
    lastCardRects.clear();
    tableFlightSources.clear();
    tableFlightDestinations.clear(); tableFlightFaceStyles.clear();
    lastPresentationPaintAt = 0;
  }
  const currentMoveKeys = new Set(tableEvents.value.flatMap((event) =>
    event.moves.map((_, index) => `${event.round}:${event.id}:${index}`),
  ));
  for (const key of tableFlightSources.keys()) {
    if (!currentMoveKeys.has(key)) tableFlightSources.delete(key);
  }
  for (const key of tableFlightDestinations.keys()) {
    if (!currentMoveKeys.has(key)) tableFlightDestinations.delete(key);
  }
  const render = (frameTime = performance.now()) => {
    // A short handoff remains clear at 30 visual updates per second. On an
    // older phone, missed frames advance directly along the server timeline.
    if (frameTime - lastPresentationPaintAt >= 32 || lastPresentationPaintAt === 0) {
      lastPresentationPaintAt = frameTime;
      presentationTick.value = Date.now();
    }
    presentationFrame = tableEvents.value.some((event) => event.endsAt > presentationNow.value)
      ? requestAnimationFrame(render) : null;
  };
  render();
}, { immediate: true });
const activeTableEvents = computed(() => tableEvents.value.filter((event) => event.startsAt <= presentationNow.value && event.endsAt > presentationNow.value));
const centerCardVisible = computed(() => {
  if (responseCardPlacement.value !== "center") return false;
  if (!props.state?.tablePresentationVersion) return true;
  return !tableEvents.value.some((event) => event.kind === "hu" && event.startsAt <= presentationNow.value && event.moves.some((move) => move.card.id === responseCard.value?.id));
});
const systemReducedMotion = ref(typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
const reducedTableMotion = computed(() => props.reduceMotion || systemReducedMotion.value);
// A flight teleported to <body> uses physical viewport coordinates, while a
// portrait-locked table is painted in a rotated logical coordinate system.
// Showing the authoritative landing immediately is safer than briefly drawing
// the same card at a conflicting angle or scale.
const coordinateMotionSuppressed = computed(() => reducedTableMotion.value || props.viewportTransformed);
const motionQuery = typeof matchMedia !== "undefined" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
const updateMotionPreference = () => { systemReducedMotion.value = motionQuery?.matches ?? false; };
onMounted(() => motionQuery?.addEventListener("change", updateMotionPreference));
onUnmounted(() => motionQuery?.removeEventListener("change", updateMotionPreference));
onBeforeUpdate(() => {
  boardRef.value?.querySelectorAll<HTMLElement>(
    ".response-card-face[data-face-id], .hand [data-face-id], .discard-strip [data-face-id], .group-block-list [data-face-id]",
  ).forEach((element) => {
    const rect = rectFromElement(element);
    if (rect && element.dataset.faceId) lastCardRects.set(element.dataset.faceId, rect);
  });
  while (lastCardRects.size > 256) lastCardRects.delete(lastCardRects.keys().next().value!);
});
function isMovingCard(id: string): boolean {
  if (coordinateMotionSuppressed.value) return false;
  return activeTableEvents.value.some((event) => event.moves.some((move) => move.card.id === id));
}
function movingCardStyle(id: string): Record<string, string> {
  return isMovingCard(id) ? { visibility: "hidden" } : {};
}
function tableLocationContainer(location: TableLocation): HTMLElement | null {
  if (location.zone === "deck") return deckAnchorRef.value;
  if (location.zone === "center") return responseLandingRef.value;
  if (location.zone === "flow") {
    const receiver = getNextPlayer(location.playerId ?? "")?.clientId;
    return Array.from(boardRef.value?.querySelectorAll<HTMLElement>("[data-flow-receiver-id]") ?? [])
      .find((el) => el.dataset.flowReceiverId === receiver) ?? null;
  }
  if (location.zone === "meld") {
    return location.playerId === props.mySeatId
      ? selfOpenRef.value
      : seatRefMap.get(location.playerId ?? "") ?? null;
  }
  if (location.zone === "hand") {
    return location.playerId === props.mySeatId
      ? selfHandRef.value
      : seatRefMap.get(location.playerId ?? "") ?? null;
  }
  return null;
}

function tableLocationCardElement(location: TableLocation, cardId: string): HTMLElement | null {
  const container = tableLocationContainer(location);
  if (!container) return null;
  const selector = location.zone === "center"
    ? ".response-card-face[data-face-id]"
    : location.zone === "hand"
      ? ".hand-card [data-face-id]"
      : location.zone === "flow"
        ? ".discard-strip [data-face-id]"
        : location.zone === "meld"
          ? ".group-block-list [data-face-id]"
          : "";
  if (!selector) return null;
  return Array.from(container.querySelectorAll<HTMLElement>(selector))
    .find((element) => element.dataset.faceId === cardId) ?? null;
}

function tableLocationExactRect(location: TableLocation, cardId: string): CardRect | null {
  return rectFromElement(tableLocationCardElement(location, cardId));
}

function tableLocationAnchorElement(location: TableLocation): HTMLElement | null {
  const container = tableLocationContainer(location);
  if (location.zone !== "meld" || !container) return container;
  const publicGroups = container.querySelector<HTMLElement>(".group-block-list");
  // The self meld section is itself the dedicated public-card zone even while
  // empty. Opponent seat containers also include private seat chrome, so wait
  // for their public group list instead of drifting to the seat center.
  return publicGroups ?? (location.playerId === props.mySeatId ? container : null);
}

function cardRectAtPoint(point: { x: number; y: number } | null, size: Pick<CardRect, "width" | "height">): CardRect | null {
  if (!point) return null;
  return {
    left: point.x - size.width / 2,
    top: point.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

function tableLocationAnchorRect(location: TableLocation, size: Pick<CardRect, "width" | "height">): CardRect | null {
  return cardRectAtPoint(pointFromElement(tableLocationAnchorElement(location)), size);
}

function defaultTableCardRect(): Pick<CardRect, "width" | "height"> {
  return appliedTableCardMode.value === "long"
    ? { width: 32, height: 84 }
    : { width: 44, height: 50 };
}

function interpolateRect(start: CardRect, end: CardRect, progress: number): CardRect {
  const interpolate = (from: number, to: number) => from + (to - from) * progress;
  return {
    left: interpolate(start.left, end.left),
    top: interpolate(start.top, end.top),
    width: interpolate(start.width, end.width),
    height: interpolate(start.height, end.height),
  };
}

function tableFlightCardVisual(location: TableLocation): {
  size: "xs" | "lg";
  className: "discard-token" | "mini-card" | "response-card-face" | "";
} {
  if (location.zone === "flow") return { size: "xs", className: "discard-token" };
  if (location.zone === "meld") return { size: "xs", className: "mini-card" };
  if (location.zone === "center") return { size: "lg", className: "response-card-face" };
  return { size: "xs", className: "" };
}

const tableFlights = computed(() => coordinateMotionSuppressed.value ? [] : activeTableEvents.value.flatMap((event) => event.moves.flatMap((move, index) => {
  const key = `${event.round}:${event.id}:${index}`;
  const exactEnd = tableLocationExactRect(move.to, move.card.id);
  const frozenEnd = tableFlightDestinations.get(key);
  const fallbackSize = frozenEnd ?? exactEnd ?? defaultTableCardRect();
  // Source nodes can disappear in the same authoritative patch that creates
  // their destination. Freeze the last real card rectangle per move so later
  // frames cannot drift back to a container center.
  const start = tableFlightSources.get(key)
    ?? lastCardRects.get(move.card.id)
    ?? tableLocationExactRect(move.from, move.card.id)
    ?? tableLocationAnchorRect(move.from, fallbackSize);
  if (!start) return [];
  tableFlightSources.set(key, start);
  while (tableFlightSources.size > 128) tableFlightSources.delete(tableFlightSources.keys().next().value!);

  const end = frozenEnd ?? exactEnd;
  // A container center is not a card landing point. Without the real target,
  // prefer the authoritative final state to a plausible but incorrect flight.
  if (!end) return [];
  // A flight is one visual transaction. Freeze its real destination on the
  // first painted frame so a hand scroll, late sibling mount, or responsive
  // reflow cannot steer the card or resize it halfway through the animation.
  if (!frozenEnd) {
    tableFlightDestinations.set(key, end);
    while (tableFlightDestinations.size > 128) {
      tableFlightDestinations.delete(tableFlightDestinations.keys().next().value!);
    }
  }

  const elapsed = presentationNow.value - event.startsAt;
  const draw = event.kind === "draw";
  // Arrive before the 350ms server handoff ends, then hold the exact rectangle
  // for 150ms so low-frame devices can paint a stable landing.
  const progress = Math.min(1, elapsed / 200);
  const eased = 1 - Math.pow(1 - progress, 3);
  const flipping = draw && elapsed >= 700;
  const back = draw && elapsed < 950;
  const flip = Math.min(1, Math.max(0, (elapsed - 700) / 500)) * 180;
  const current = interpolateRect(start, end, eased);
  const scaleX = Math.max(0.01, current.width / end.width);
  const scaleY = Math.max(0.01, current.height / end.height);
  const destinationVisual = tableFlightCardVisual(move.to);
  let cardStyle = tableFlightFaceStyles.get(key);
  const destinationElement = tableLocationCardElement(move.to, move.card.id);
  if (!cardStyle && destinationElement) {
    const style = getComputedStyle(destinationElement);
    const top = destinationElement.querySelector('.text-top');
    const bottom = destinationElement.querySelector('.text-bottom');
    cardStyle = { width: '100%', height: '100%', boxSizing: 'border-box', fontSize: style.fontSize, borderWidth: style.borderWidth, borderRadius: style.borderRadius, padding: style.padding,
      '--flight-top-padding': top ? getComputedStyle(top).paddingTop : '0px',
      '--flight-bottom-padding': bottom ? getComputedStyle(bottom).paddingBottom : '0px' };
    tableFlightFaceStyles.set(key, cardStyle);
    while (tableFlightFaceStyles.size > 128) tableFlightFaceStyles.delete(tableFlightFaceStyles.keys().next().value!);
  }
  return [{ key, card: move.card, kind: event.kind,
    back, rotation: draw ? (back ? flip : flip - 180) : 0,
    stage: draw ? (elapsed < 200 ? "flying" : flipping ? "flipping" : "waiting") : progress < 1 ? "flying" : "landed",
    destinationZone: move.to.zone,
    cardSize: destinationVisual.size,
    cardClass: destinationVisual.className,
    cardStyle,
    style: {
      width: `${Math.max(1, end.width)}px`,
      height: `${Math.max(1, end.height)}px`,
      transform: `translate3d(${current.left}px, ${current.top}px, 0) scale(${scaleX}, ${scaleY})`,
    },
  }];
})));

function flowCardCount(playerId: string): number {
  return flowCards(playerId).length;
}

function visibleFlowCards(playerId: string): Card[] {
  return flowCards(playerId);
}

function isActiveDiscardCard(playerId: string, card: Card, index: number): boolean {
  const cards = visibleFlowCards(playerId);
  if (index !== cards.length - 1) {
    return false;
  }
  const pending = responseCard.value;
  if (!pending || pending.source !== "upper") {
    return false;
  }
  if (pending.id !== card.id) {
    return false;
  }
  if (shouldAppendPendingToFlow(playerId)) {
    return activeFlowTargetPlayerId.value === playerId;
  }
  const owner = flowOwner(playerId);
  const latestCount = owner?.discardPile?.length ?? 0;
  const latest = latestCount > 0 ? owner?.discardPile?.[latestCount - 1] : undefined;
  return Boolean(latest?.id === card.id);
}

const displayTurnPlayerId = computed(() => {
  return getDisplayedTurnPlayerId({
    responsePhase: props.state?.responsePhase,
    pendingReceiverId: props.state?.pendingReceiverId,
    currentTurnPlayerId: props.state?.currentTurnPlayerId,
    currentPlayerId: props.state?.currentPlayerId,
    playerIds: props.players.map((player) => player.clientId),
  });
});

const currentPlayer = computed(() => {
  const playerId = displayTurnPlayerId.value;
  if (!playerId) {
    return null;
  }
  return props.players.find((x) => x.clientId === playerId) ?? null;
});

const isMyTurn = computed(
  () =>
    Boolean(props.mySeatId) &&
    displayTurnPlayerId.value === props.mySeatId &&
    !Boolean(currentPlayer.value?.isBot || currentPlayer.value?.isAutoPlay),
);

const openingDealIntroActive = computed(() => isOpeningDealIntroState());
const handPresentationBusy = computed(() => openingDealIntroActive.value || showDealAnimation.value);
const canAct = computed(() => Boolean(props.canAct) && !handPresentationBusy.value);
const canDiscard = computed(() => Boolean(props.canDiscard) && !handPresentationBusy.value);
const effectiveInteractionPausedMessage = computed(() => {
  if (props.interactionPausedMessage) {
    return props.interactionPausedMessage;
  }
  if (handPresentationBusy.value && (props.canAct || props.canDiscard)) {
    return "正在整理手牌，请稍候";
  }
  return "";
});
const canConfirmDiscard = computed(() => {
  const selectedId = selectedDiscardCardId.value;
  if (!selectedId || !canDiscard.value) {
    return false;
  }
  const card = props.privateHand.find((item) => item.id === selectedId);
  return Boolean(card && canDiscardCard(card));
});
const displayPrivateHand = computed<Card[]>(() => {
  if (props.state?.phase === "waiting") {
    return [];
  }
  const shouldLimit = showDealAnimation.value || openingDealIntroActive.value;
  const authoritativeLimit = openingDealIntroActive.value
    ? Math.max(0, props.privateHand.length - 1)
    : props.privateHand.length;
  const limit = shouldLimit
    ? Math.min(authoritativeLimit, Math.max(0, visibleHandCount.value || 0))
    : props.privateHand.length;
  return props.privateHand.slice(0, limit);
});
const visibleHandCardIds = computed(() => new Set(displayPrivateHand.value.map((card) => card.id)));
const handLayoutCards = computed<Card[]>(() =>
  props.handLayout !== "paged" && handPresentationBusy.value
    ? props.privateHand
    : displayPrivateHand.value,
);
function isDealConcealedCard(cardId: string): boolean {
  if (handPresentationBusy.value && props.handLayout !== "paged" && !handScaleReady.value) {
    return true;
  }
  return handPresentationBusy.value && !visibleHandCardIds.value.has(cardId);
}
const handVisibleRangeLabel = computed(() => {
  const { start, end, total } = handVisibleRange.value;
  return `当前显示第 ${start} 到 ${end} 张，共 ${total} 张`;
});
const isResponseCardDrawHidden = computed(
  () => Boolean(drawHiddenCardId.value) && responseCard.value?.id === drawHiddenCardId.value,
);
const activeChiCandidates = computed<ActionCandidate[]>(() => {
  if (!canAct.value) {
    return [];
  }
  const entry = (props.actions ?? []).find(
    (action) => action.action === "chi" && (action.enabled || action.deferred),
  );
  return entry?.candidates ?? [];
});
const chiSelectionAvailable = computed(() => activeChiCandidates.value.length > 0);
const chiSelectionContextKey = computed(() => {
  const targetId = responseCard.value?.id ?? props.state?.targetCard?.id ?? "";
  if (!targetId || props.state?.phase !== "playing") {
    return "";
  }
  return `${props.state?.roomId ?? ""}|${props.state?.completedRounds ?? 0}|${targetId}`;
});
const chiSelectionDraftActive = computed(
  () => chiSelectionAvailable.value || Boolean(chiSelectionContextKey.value && selectedChiCardIds.value.length > 0),
);
const selectedChiCandidate = computed<ActionCandidate | null>(() => {
  const selected = [...selectedChiCardIds.value].sort();
  return activeChiCandidates.value.find((candidate) => {
    const candidateIds = [...candidate.cardIds].sort();
    return candidateIds.length === selected.length && candidateIds.every((id, index) => id === selected[index]);
  }) ?? null;
});
const effectiveActionFeedback = computed<ActionFeedback | null>(() => props.actionFeedback ?? null);
const tableNoticeText = computed(() => {
  if (chiValidationMessage.value) return chiValidationMessage.value;
  if (props.actionFeedback?.status === "rejected" && props.actionFeedback.visible !== false) {
    return props.actionFeedback.message;
  }
  return effectiveInteractionPausedMessage.value;
});
const extendableChiCandidates = computed(() => {
  const selected = new Set(selectedChiCardIds.value);
  return activeChiCandidates.value.filter((candidate) =>
    selectedChiCardIds.value.length <= candidate.cardIds.length &&
    [...selected].every((cardId) => candidate.cardIds.includes(cardId)),
  );
});

function chiCandidateFaceSignature(candidate: ActionCandidate): string {
  const cardsById = new Map(props.privateHand.map((card) => [card.id, card]));
  const faces = candidate.cardIds.map((cardId) => {
    const card = cardsById.get(cardId);
    return card ? `${card.color}:${card.type}` : `missing:${cardId}`;
  }).sort();
  return `${faces.length}|${faces.join("|")}`;
}

function uniqueVisibleChiCandidate(candidates = activeChiCandidates.value): ActionCandidate | null {
  const byVisibleComposition = new Map<string, ActionCandidate[]>();
  for (const candidate of candidates) {
    const signature = chiCandidateFaceSignature(candidate);
    const entries = byVisibleComposition.get(signature) ?? [];
    entries.push(candidate);
    byVisibleComposition.set(signature, entries);
  }
  if (byVisibleComposition.size !== 1) {
    return null;
  }
  return [...(byVisibleComposition.values().next().value ?? [])]
    .sort((left, right) => left.id.localeCompare(right.id))[0] ?? null;
}

function defaultVisibleChiCandidate(): ActionCandidate | null {
  const candidates = activeChiCandidates.value;
  const targetCard = responseCard.value ?? props.state?.targetCard ?? null;
  const canEatJiangDirectly = candidates.some((candidate) => candidate.kind === "single");
  if (targetCard?.type === "jiang" && canEatJiangDirectly) {
    // “直接吃将”不勾手牌，容易被误认为系统漏选；并存时优先展示完整的将士象草稿。
    const jsxCandidate = uniqueVisibleChiCandidate(
      candidates.filter((candidate) => candidate.kind === "jsx"),
    );
    if (jsxCandidate) {
      return jsxCandidate;
    }
  }
  return uniqueVisibleChiCandidate(candidates);
}

function blockChiAutoSelectionForCurrentTarget(): void {
  if (chiSelectionContextKey.value) {
    chiAutoSelectionBlockedKey.value = chiSelectionContextKey.value;
  }
}

const ACTION_LABELS: Record<string, string> = {
  DISCARD: "出牌",
  PENG: "碰",
  KAI: "开",
  CHI: "吃",
  HU: "胡",
  ZHUA: "抓",
  PASS: "过",
  TIMEOUT_PASS: "超时过",
  FORCE_TAKE: "吃",
};

const latestSeatAction = computed<{ actorId: string; label: string } | null>(() => {
  const action = String(props.state?.lastAction ?? "").trim();
  if (!action) {
    return null;
  }
  const { actor, keyword } = parseActionDescriptor(action);
  if (!actor) {
    return null;
  }
  const label = ACTION_LABELS[keyword];
  if (!label) {
    return null;
  }
  return { actorId: actor, label };
});

const publicCollectiveSeconds = computed<number | null>(() => {
  if (props.state?.phase !== "playing" || props.state?.responsePhase !== "collective" || Number(props.state?.responseEndsAt ?? 0) <= 0) return null;
  const endsAt = Number(props.decisionTimerEndsAt || props.state.responseEndsAt);
  const visibleEnd = visibleDecisionEndsAt("collective", endsAt, Number(props.decisionTimerTotalMs ?? 0));
  const time = nowMs.value + Number(props.state.presentationClockOffsetMs ?? 0);
  return Math.max(0, Math.min(3, Math.ceil((visibleEnd - time) / 1000)));
});
const fixedClockText = computed(() => {
  if (effectiveInteractionPausedMessage.value || !['playing', 'declaring'].includes(props.state?.phase)) return '—';
  if (publicCollectiveSeconds.value !== null) return `${publicCollectiveSeconds.value}秒`;
  if (props.decisionUntimed) return '不限时';
  const deadline = Number(props.decisionTimerEndsAt ?? 0);
  const time = nowMs.value + Number(props.state?.presentationClockOffsetMs ?? 0);
  return deadline > time ? `${Math.ceil((deadline - time) / 1000)}秒` : '—';
});
const activeHints = computed(() => {
  const hints = props.listeningHints;
  return !effectiveInteractionPausedMessage.value && hints?.stateRevision === (props.acceptedStateRevision ?? props.state?.stateRevision) && hints?.decisionKey === props.decisionKey ? hints : null;
});
const currentListeningWaits = computed(() => activeHints.value?.currentWaits ?? []);
const currentListeningAccessibleLabel = computed(() => `已经听牌，等待${currentListeningWaits.value
  .map((wait) => `${getCardAccessibleText(wait.card)}，可见余量${wait.visibleRemaining}张`)
  .join("；")}`);
const markedListeningRoutes = computed(() => {
  if (selectedChiCandidate.value) return activeHints.value?.chi.find((item) => item.candidateId === selectedChiCandidate.value?.id)?.discards ?? [];
  return canDiscard.value ? activeHints.value?.discards ?? [] : [];
});
const listeningMarkContext = computed(() => selectedChiCandidate.value ? "post-chi" : "discard");
function isListeningDiscard(cardId: string): boolean {
  return markedListeningRoutes.value.some((route) => route.discardCardId === cardId);
}
function handCardById(id: string): Card | undefined { return props.privateHand.find((card) => card.id === id); }
const selectedPreview = computed(() => canDiscard.value
  ? handCardById(selectedDiscardCardId.value ?? "")
  : undefined);
const selectedDiscardListeningRoute = computed(() => selectedPreview.value
  ? markedListeningRoutes.value.find((route) => route.discardCardId === selectedPreview.value?.id)
  : undefined);
const listeningDetailWaits = computed(() => selectedPreview.value ? selectedDiscardListeningRoute.value?.waits ?? [] : currentListeningWaits.value);
const listeningDetailTitle = computed(() => selectedPreview.value ? "打出此牌后听" : "当前听牌");
let listeningCloseTimer: ReturnType<typeof setTimeout> | null = null;
function pauseListeningTimer() {
  if (listeningCloseTimer) clearTimeout(listeningCloseTimer);
  listeningCloseTimer = null;
}
function restartListeningTimer() {
  pauseListeningTimer();
  if (!listeningDetailsOpen.value || listeningDetailsRef.value?.contains(document.activeElement)) return;
  listeningCloseTimer = setTimeout(() => closeListeningDetails(), 5000);
}
function toggleListeningDetails() {
  if (listeningDetailsOpen.value) closeListeningDetails();
  else { listeningDetailsOpen.value = true; restartListeningTimer(); }
}
watch(() => selectedPreview.value?.id, () => {
  closeListeningDetails();
  if (selectedDiscardListeningRoute.value?.waits.length) { listeningDetailsOpen.value = true; restartListeningTimer(); }
});
const selectedPreviewAccessibleLabel = computed(() => {
  const selected = selectedPreview.value;
  if (!selected) return "";
  const waits = selectedDiscardListeningRoute.value?.waits ?? [];
  if (!waits.length) return `已选出牌预览：${getCardAccessibleText(selected)}`;
  return `已选出牌预览：${getCardAccessibleText(selected)}，打出后等待${waits
    .map((wait) => `${getCardAccessibleText(wait.card)}，可见余量${wait.visibleRemaining}张`)
    .join("；")}`;
});

const seatCountdownSeconds = computed<number | null>(() => {
  if (publicCollectiveSeconds.value !== null) return publicCollectiveSeconds.value;
  if (
    /^DEALER\s+\S+/.test(String(props.state?.lastAction ?? "")) &&
    Number(props.state?.responseEndsAt ?? 0) > nowMs.value
  ) {
    return null;
  }
  const endsAt = activeDecisionEndsAt.value;
  if (!endsAt || endsAt <= nowMs.value) {
    return null;
  }
  const totalMs = Math.max(OP_COUNTDOWN_MS, Number(props.decisionTimerTotalMs ?? 0));
  return Math.max(
    0,
    Math.min(Math.ceil(totalMs / 1000), Math.ceil((endsAt - nowMs.value) / 1000)),
  );
});

const activeDecisionEndsAt = computed(() => {
  if (Number(props.decisionTimerEndsAt ?? 0) > 0) {
    return Number(props.decisionTimerEndsAt);
  }
  return Number(props.state?.responseEndsAt ?? 0);
});

const hasMeaningfulCollectiveAction = computed(() =>
  (props.actions ?? []).some((action) =>
    (action.action === "hu" || action.action === "kai" || action.action === "peng") && action.enabled,
  ),
);
const showDecisionClock = computed(() =>
  publicCollectiveSeconds.value !== null || (props.state?.phase === "declaring"
    ? !Boolean(selfPlayer.value?.declaredReady || selfPlayer.value?.declarationStep === "done") &&
      (Boolean(props.decisionUntimed) || seatCountdownSeconds.value !== null)
    : props.state?.phase === "playing" &&
      (canDiscard.value || canAct.value) &&
      (props.state?.responsePhase !== "collective" || hasMeaningfulCollectiveAction.value) &&
      (Boolean(props.decisionUntimed) || seatCountdownSeconds.value !== null)),
);

const flowStatusText = computed(() => {
  if (props.deferredChiPending) return "已选择吃，等待其他玩家响应";
  if (props.state?.phase === "declaring") {
    return selfPlayer.value?.declaredReady || selfPlayer.value?.declarationStep === "done"
      ? "等待其他玩家声明"
      : "";
  }
  if (discardingCardId.value || props.actionFeedback?.status === "pending") {
    return "正在提交";
  }
  if (props.state?.phase === "playing" && props.state?.responsePhase === "collective") {
    return canAct.value ? "" : publicCollectiveSeconds.value === 0 ? "等待其他玩家操作" : "等待其他玩家响应";
  }
  return "";
});

const crowdedActionDock = computed(() =>
  canAct.value && (props.actions ?? []).filter((action) => action.enabled || Boolean(action.deferred)).length >= 4,
);

const centerPointerDirection = computed<"up" | "down" | "left" | "right" | null>(() => {
  const currentId = String(displayTurnPlayerId.value || "");
  if (!currentId) {
    return null;
  }
  const position = resolvePlayerPosition(currentId);
  if (position === "top") {
    return "up";
  }
  if (position === "left") {
    return "left";
  }
  if (position === "right") {
    return "right";
  }
  return position === "self" ? "down" : null;
});

const dealerInfoCard = computed<Card | null>(() => {
  const card = props.state?.dealerCard;
  return card?.id ? (card as Card) : null;
});

const dealerSeatMarkerReady = computed(
  () => !/^DEALER_(?:PICK|CARD)\b/.test(String(props.state?.lastAction ?? "")),
);

// Colyseus may notify lastAction before the dealerCard fields from the same
// patch have reached Vue. Keep the visible face bound to the authoritative
// state so a reveal can never freeze the previous round's card.
const dealerCeremonyCard = computed<Card | null>(() => {
  const reveal = dealerReveal.value;
  if (!reveal || reveal.stage !== "revealed") {
    return null;
  }
  return dealerInfoCard.value ?? reveal.card;
});

const dealerPickerDescription = computed(() => {
  const id = dealerReveal.value?.pickerId;
  if (id === props.mySeatId) return "你（本家）";
  const name = props.players.find(player => player.clientId === id)?.name || "牌友";
  const position = topPlayer.value?.clientId === id ? "对家" : leftPlayer.value?.clientId === id ? "左侧" : "右侧";
  return `${name}（${position}）`;
});
const dealerCountTotal = computed(() => ({ yellow: 1, red: 2, green: 3, white: 4, gold: 2 }[dealerCeremonyCard.value?.color ?? "yellow"] ?? 1));
const dealerCountStep = computed(() => dealerReveal.value?.stage === "revealed"
  ? Math.min(dealerCountTotal.value, 1 + Math.floor(Math.max(0, nowMs.value - dealerReveal.value.startedAt - 450) / 650)) : 0);
const dealerCountingFinished = computed(() => Boolean(dealerReveal.value && nowMs.value - dealerReveal.value.startedAt >= 450 + (dealerCountTotal.value - 1) * 650 + 480));
const dealerCountingSeatId = computed(() => {
  const reveal = dealerReveal.value;
  if (!reveal) return "";
  if (reveal.stage === "picking") return reveal.pickerId;
  if (!reveal.pickerId) return reveal.dealerId;
  const players = orderedPlayers.value;
  const first = players.findIndex(player => player.clientId === reveal.pickerId);
  return first < 0 ? "" : players[(first + dealerCountStep.value - 1) % players.length]?.clientId ?? "";
});
const dealerCountingName = computed(() => dealerCountingSeatId.value === props.mySeatId ? "你" : props.players.find(player => player.clientId === dealerCountingSeatId.value)?.name || "牌友");
const dealerCounterPosition = computed(() => {
  const id = dealerCountingSeatId.value;
  const position = id === props.mySeatId ? [50, 88]
    : id === topPlayer.value?.clientId ? [50, 15]
    : id === leftPlayer.value?.clientId ? [16, 50] : [84, 50];
  return { left: `${position[0]}%`, top: `${position[1]}%` };
});
const dealerRevealAccessibleText = computed(() => {
  const reveal = dealerReveal.value;
  const card = dealerCeremonyCard.value;
  if (!reveal || reveal.stage === "picking" || !card) {
    return `由${dealerPickerDescription.value}翻定庄牌`;
  }
  return `定庄牌为${getCardAccessibleText(card)}，${reveal.dealerName || "庄家"}坐庄`;
});

function showDealerSeatMarker(playerId: string): boolean {
  return dealerSeatMarkerReady.value && isDealer(playerId) && Boolean(dealerInfoCard.value);
}

function seatActionText(playerId: string): string {
  return latestSeatAction.value?.actorId === playerId ? latestSeatAction.value.label : "";
}

function hasSeatAction(playerId: string): boolean {
  return seatActionText(playerId).length > 0;
}

function isCurrentTurn(playerId: string): boolean {
  return displayTurnPlayerId.value === playerId;
}

function statusText(player: PlayerState): string {
  if (player.isConfiguredBot) {
    return "机器人";
  }
  if (player.isAutoPlay) {
    return props.ultraCompact ? "托管中" : "机器人代打";
  }
  if (player.isBot) {
    return props.ultraCompact ? "托管中" : "暂由机器人";
  }
  return player.connected ? "真人在线" : "真人离线";
}

function statusIconProps(player: PlayerState) {
  return {
    isConfiguredBot: player.isConfiguredBot,
    isAutoPlay: player.isAutoPlay,
    isBot: player.isBot,
    connected: player.connected,
  };
}

function playerAccessibleSummary(player: PlayerState, _groupCount: number): string {
  const parts = [
    player.clientId === props.mySeatId ? `${player.name}，你的位置` : player.name,
    `剩余手牌 ${playerHandCount(player)} 张`,
    `已声明暗坎 ${player.declaredKongs} 个`,
    `当前明示牌组基础分 ${player.visibleGroupScore} 分`,
    statusText(player),
  ];
  const pendingFishGroups = player.pendingFishGroupSizes?.length ?? 0;
  if (pendingFishGroups > 0) {
    parts.push(`待揭晓鱼 ${pendingFishGroups} 组`);
  }
  if (isDealer(player.clientId)) {
    parts.push("庄家");
  }
  if (isCurrentTurn(player.clientId)) {
    parts.push(props.state?.responsePhase === "collective" ? "下一操作位" : "当前回合");
  }
  return parts.join("，");
}

function isTemporaryBotControl(player: PlayerState): boolean {
  return player.isAutoPlay || (player.isBot && !player.isConfiguredBot);
}

function playerHandCount(player: PlayerState): number {
  if (player.clientId === props.mySeatId) {
    return props.privateHand.length;
  }
  return Number(player.handCount ?? 0);
}

function isDealer(playerId: string): boolean {
  return Boolean(playerId) && String(props.state?.dealerId ?? "") === playerId;
}

function isSystemAction(actionKey: string): boolean {
  return actionKey === "NO_RESPONSE" || actionKey === "TURN_DRAW" || actionKey === "KONG_DRAW";
}

function canDiscardCard(card: Card): boolean {
  return canDiscard.value && !isDiscardProtectedCard(card);
}

function canPreselectDiscardCard(card: Card): boolean {
  return props.state?.phase === "playing" &&
    !handPresentationBusy.value &&
    !Boolean(selfPlayer.value?.isBot || selfPlayer.value?.isAutoPlay) &&
    !isDiscardProtectedCard(card);
}

function isChiCardSelectable(cardId: string): boolean {
  if (!chiSelectionAvailable.value) {
    return false;
  }
  if (selectedChiCardIds.value.includes(cardId)) {
    return true;
  }
  return extendableChiCandidates.value.some((candidate) => candidate.cardIds.includes(cardId));
}

function canSelectHandCard(card: Card): boolean {
  if (chiSelectionDraftActive.value) {
    return isChiCardSelectable(card.id);
  }
  return canPreselectDiscardCard(card);
}

function isDiscardProtectedCard(card: Card): boolean {
  return card.type === "jiang" || card.color === "gold";
}

function selectDiscardCard(cardId: string): void {
  if (discardingCardId.value) {
    return;
  }
  const picked = props.privateHand.find((card) => card.id === cardId);
  if (!picked || !canPreselectDiscardCard(picked)) {
    return;
  }
  selectedDiscardCardId.value = selectedDiscardCardId.value === cardId ? null : cardId;
}

function selectHandCard(cardId: string): void {
  if (!chiSelectionDraftActive.value) {
    selectDiscardCard(cardId);
    return;
  }
  if (!isChiCardSelectable(cardId)) {
    return;
  }
  blockChiAutoSelectionForCurrentTarget();
  if (selectedChiCardIds.value.includes(cardId)) {
    selectedChiCardIds.value = selectedChiCardIds.value.filter((id) => id !== cardId);
    return;
  }
  selectedChiCardIds.value = [...selectedChiCardIds.value, cardId];
}

function ensureHandCardSelected(cardId: string): void {
  if (!chiSelectionDraftActive.value) {
    const picked = props.privateHand.find((card) => card.id === cardId);
    if (picked && canPreselectDiscardCard(picked)) {
      selectedDiscardCardId.value = cardId;
    }
    return;
  }
  if (isChiCardSelectable(cardId) && !selectedChiCardIds.value.includes(cardId)) {
    blockChiAutoSelectionForCurrentTarget();
    selectedChiCardIds.value = [...selectedChiCardIds.value, cardId];
  }
}

function clearChiSelection(event?: KeyboardEvent): void {
  if (selectedChiCardIds.value.length === 0) {
    return;
  }
  event?.preventDefault();
  blockChiAutoSelectionForCurrentTarget();
  selectedChiCardIds.value = [];
}

function closeListeningDetails(restoreFocus = false): void {
  pauseListeningTimer();
  if (!listeningDetailsOpen.value) return;
  listeningDetailsOpen.value = false;
  if (restoreFocus) void nextTick(() => listeningToggleRef.value?.focus());
}

function handleBoardEscape(event?: KeyboardEvent): void {
  if (listeningDetailsOpen.value) {
    event?.preventDefault();
    closeListeningDetails(true);
    return;
  }
  clearChiSelection(event);
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!listeningDetailsOpen.value || !(event.target instanceof Node)) return;
  if (listeningToggleRef.value?.contains(event.target) || listeningDetailsRef.value?.contains(event.target)) return;
  closeListeningDetails();
}

function updateHandLayoutState(): void {
  const hand = selfHandRef.value;
  const viewport = handViewportRef.value;
  if (!hand) {
    handHasOverflow.value = false;
    handCanScrollBackward.value = false;
    handCanScrollForward.value = false;
    handVisibleRange.value = { start: 0, end: 0, total: 0 };
    return;
  }
  const panel = viewport?.parentElement;
  const panelStyle = panel ? getComputedStyle(panel) : null;
  const available = panel ? panel.clientWidth - (parseFloat(panelStyle!.paddingLeft) || 0) - (parseFloat(panelStyle!.paddingRight) || 0) : viewport?.clientWidth ?? 0;
  const keepGeometry = handScaleReady.value && Boolean(flights.value.length || (!coordinateMotionSuppressed.value && activeTableEvents.value.length));
  let needsOverflow = keepGeometry ? handHasOverflow.value : false;
  if (props.handLayout !== 'paged' && !keepGeometry) {
    const style = getComputedStyle(hand);
    const card = hand.querySelector<HTMLElement>('.hand-card');
    const face = card?.querySelector<HTMLElement>('.card');
    if (card && face && viewport?.clientWidth) {
      // Natural CSS dimensions are independent of the previously applied scale.
      const naturalWidth = parseFloat(style.getPropertyValue('--hand-width'));
      const count = handLayoutCards.value.length;
      const gap = parseFloat(style.columnGap) || 0;
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      // Single mode fits every authoritative card, including concealed opening cards.
      // Only paged mode reserves toolbar space and enforces large touch targets.
      const spacing = padding + gap * Math.max(0, count - 1) + 4;
      needsOverflow = false;
      const fit = (available - spacing) / (naturalWidth * count);
      const nextScale = Math.min(1, Math.max(0.01, fit));
      hand.scrollLeft = 0;
      if (Math.abs(handScale.value - nextScale) > 0.001) {
        handScale.value = nextScale;
        void nextTick(scheduleHandLayoutUpdate);
      }
      handScaleReady.value = true;
    }
  } else if (!keepGeometry) {
    handScale.value = 1;
    const cards = Array.from(hand.querySelectorAll<HTMLElement>('.hand-card'));
    const style = getComputedStyle(hand);
    needsOverflow = cards.reduce((width, card) => width + card.offsetWidth, 0)
      + (parseFloat(style.columnGap) || 0) * Math.max(0, cards.length - 1)
      + (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0) > available + 2;
  }
  if (handHasOverflow.value !== needsOverflow) {
    handHasOverflow.value = needsOverflow;
    void nextTick(scheduleHandLayoutUpdate);
  }
  const maxScrollLeft = Math.max(0, hand.scrollWidth - hand.clientWidth);
  handCanScrollBackward.value = hand.scrollLeft > 2;
  handCanScrollForward.value = hand.scrollLeft < maxScrollLeft - 2;

  const cards = Array.from(hand.querySelectorAll<HTMLElement>("[data-card-id]"));
  const firstCardOffset = cards[0]?.offsetLeft ?? 0;
  const viewportStart = hand.scrollLeft;
  const viewportEnd = viewportStart + hand.clientWidth;
  let visibleIndexes = cards
    .map((card, index) => ({ index, start: card.offsetLeft - firstCardOffset, width: card.offsetWidth }))
    .filter(({ start, width }) => {
      const center = start + width / 2;
      return center >= viewportStart && center <= viewportEnd;
    })
    .map(({ index }) => index);
  if (!visibleIndexes.length) {
    visibleIndexes = cards
      .map((card, index) => ({ index, start: card.offsetLeft - firstCardOffset, width: card.offsetWidth }))
      .filter(({ start, width }) => start + width > viewportStart && start < viewportEnd)
      .map(({ index }) => index);
  }
  handVisibleRange.value = visibleIndexes.length
    ? { start: visibleIndexes[0]! + 1, end: visibleIndexes.at(-1)! + 1, total: cards.length }
    : { start: 0, end: 0, total: cards.length };
}

function scheduleHandLayoutUpdate(): void {
  if (handLayoutFrame !== null) return;
  handLayoutFrame = window.requestAnimationFrame(() => {
    handLayoutFrame = null;
    updateHandLayoutState();
    updateFlowLayout();
  });
}

function scrollHand(direction: "backward" | "forward"): void {
  const hand = selfHandRef.value;
  if (!hand) {
    return;
  }
  const distance = Math.max(120, Math.round(hand.clientWidth * 0.72));
  const maxScrollLeft = Math.max(0, hand.scrollWidth - hand.clientWidth);
  const target = Math.min(
    maxScrollLeft,
    Math.max(0, hand.scrollLeft + (direction === "forward" ? distance : -distance)),
  );
  // 翻页按钮每次移动一段可预期距离并播报新区间；触屏拖动仍由原生滚动处理。
  hand.scrollTo({ left: target, behavior: "auto" });
  updateHandLayoutState();
}

function observeHandViewport(viewport: HTMLElement | null): void {
  handResizeObserver?.disconnect();
  handResizeObserver = null;
  if (!viewport) {
    scheduleHandLayoutUpdate();
    return;
  }
  if (typeof ResizeObserver !== "undefined") {
    handResizeObserver = new ResizeObserver(scheduleHandLayoutUpdate);
    handResizeObserver.observe(viewport);
    boardRef.value?.querySelectorAll(".flow-card").forEach(el => handResizeObserver?.observe(el));
  }
  void nextTick(scheduleHandLayoutUpdate);
}

let rotatedScroll: { element: HTMLElement; pointerId: number; x: number; y: number; left: number; top: number } | null = null;
let scrollDragged = false;
function startRotatedScroll(event: PointerEvent): void {
  scrollDragged = false;
  rotatedScroll = null;
  if (event.pointerType !== 'touch' || !props.viewportTransformKey?.endsWith(':rotated')) return;
  const element = (event.target as Element).closest<HTMLElement>('.hand, .discard-strip, .self-groups-card, .player-card');
  if (!element || (element.scrollWidth <= element.clientWidth + 2 && element.scrollHeight <= element.clientHeight + 2)) return;
  rotatedScroll = { element, pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop };
}
function moveRotatedScroll(event: PointerEvent): void {
  const drag = rotatedScroll;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (!scrollDragged && Math.hypot(dx, dy) < 6) return;
  scrollDragged = true;
  event.preventDefault();
  boardRef.value?.setPointerCapture(event.pointerId);
  // The board rotates 90 degrees: screen Y is local X; screen X is -local Y.
  drag.element.scrollLeft = drag.left - dy;
  drag.element.scrollTop = drag.top + dx;
  scheduleHandLayoutUpdate();
}
function endRotatedScroll(event: PointerEvent): void {
  if (rotatedScroll?.pointerId !== event.pointerId) return;
  if (boardRef.value?.hasPointerCapture(event.pointerId)) boardRef.value.releasePointerCapture(event.pointerId);
  rotatedScroll = null;
}
function suppressScrollClick(event: MouseEvent): void {
  if (!scrollDragged) return;
  event.preventDefault();
  event.stopPropagation();
  scrollDragged = false;
}

function updateFlowScrollHints(): void {
  boardRef.value?.querySelectorAll<HTMLElement>('.discard-strip').forEach(strip => {
    strip.dataset.scrollBefore = String(strip.scrollTop > 2);
    strip.dataset.scrollAfter = String(strip.scrollHeight - strip.clientHeight - strip.scrollTop > 2);
  });
}

function updateFlowLayout(): void {
  if (flights.value.length || (!coordinateMotionSuppressed.value && activeTableEvents.value.length)) return;
  boardRef.value?.querySelectorAll<HTMLElement>('.flow-card').forEach(zone => {
    const strip = zone.querySelector<HTMLElement>('.discard-strip');
    if (!strip || !strip.clientWidth || !strip.clientHeight) return;
    const cards = strip.querySelectorAll<HTMLElement>('.discard-token');
    const count = cards.length;
    const latestId = cards[count - 1]?.dataset.faceId ?? '';
    const followLatest = !strip.dataset.latestId || (latestId !== strip.dataset.latestId && strip.dataset.scrollAfter !== 'true');
    const long = appliedTableCardMode.value === 'long';
    const width = long ? 24 : 30, height = long ? 32 : 30;
    const availableWidth = strip.clientWidth - 8, availableHeight = strip.clientHeight - 8;
    let scale = 1;
    // The lower bound retains a 10px font. Full rows wrap before scrolling.
    while (scale > 5 / 6) {
      const columns = Math.max(1, Math.floor((availableWidth + 2) / (width * scale + 2)));
      const rows = Math.ceil(count / columns);
      if (rows * (height * scale + 2) - 2 <= availableHeight) break;
      scale = Math.max(5 / 6, scale - .025);
    }
    zone.style.setProperty('--flow-scale', String(scale));
    if (followLatest) strip.scrollTop = strip.scrollHeight;
    strip.dataset.latestId = latestId;
  });
  updateFlowScrollHints();
}

function confirmDiscard(): void {
  const cardId = selectedDiscardCardId.value;
  if (!cardId || !canConfirmDiscard.value || discardingCardId.value) {
    return;
  }
  const picked = props.privateHand.find((card) => card.id === cardId);
  if (!picked) {
    selectedDiscardCardId.value = null;
    return;
  }
  const cardElement = Array.from(selfHandRef.value?.querySelectorAll<HTMLElement>("[data-card-id]") ?? [])
    .find((element) => element.dataset.cardId === cardId);
  if (localDiscardAckTimer) {
    clearTimeout(localDiscardAckTimer);
    localDiscardAckTimer = null;
  }
  if (cardElement && !props.state?.tablePresentationVersion) {
    triggerDiscardAnimationFromElement(cardElement, picked);
    locallyAnimatedDiscardCardId.value = cardId;
    localDiscardAckTimer = setTimeout(() => {
      if (locallyAnimatedDiscardCardId.value === cardId) {
        locallyAnimatedDiscardCardId.value = null;
      }
      localDiscardAckTimer = null;
    }, 10_000);
  } else {
    locallyAnimatedDiscardCardId.value = null;
  }
  discardingCardId.value = cardId;
  emit("discardCard", cardId);
  if (discardPendingTimer) {
    clearTimeout(discardPendingTimer);
  }
  discardPendingTimer = setTimeout(() => {
    if (discardingCardId.value === cardId) {
      discardingCardId.value = null;
    }
    discardPendingTimer = null;
  }, 2500);
}

function onSubmitAction(request: ActionRequest): void {
  if (typeof request !== "string" && request.action === "chi" && activeChiCandidates.value.length > 0) {
    if (!selectedChiCandidate.value) {
      showChiValidationMessage(selectedChiCardIds.value.length === 0
        ? "请先选择要吃的手牌"
        : "这不是一个合法的吃牌组合");
      return;
    }
    request = { ...request, candidateId: selectedChiCandidate.value.id };
  }
  chiValidationMessage.value = "";
  if (typeof request !== "string" && request.action === "chi") {
    selectedChiCardIds.value = [];
  }
  emit("submitAction", request);
}

function showChiValidationMessage(message: string): void {
  if (chiValidationTimer) clearTimeout(chiValidationTimer);
  chiValidationMessage.value = message;
  chiValidationTimer = setTimeout(() => {
    chiValidationMessage.value = "";
    chiValidationTimer = null;
  }, 2500);
}

function cardLabel(card: Card): string {
  return getCardLabelText(card);
}

function handCardAccessibleLabel(card: Card): string {
  const state = chiSelectionDraftActive.value
    ? selectedChiCardIds.value.includes(card.id)
      ? "已选入吃牌组合"
      : isChiCardSelectable(card.id)
        ? "可加入吃牌组合"
        : "不能加入当前吃牌组合"
    : selectedDiscardCardId.value === card.id
      ? "已预选出牌"
      : canPreselectDiscardCard(card)
        ? "可预选出牌"
        : canDiscard.value && isDiscardProtectedCard(card)
          ? "规则保护，不能打出"
          : "当前无需选牌";
  const listening = isListeningDiscard(card.id)
    ? listeningMarkContext.value === "post-chi"
      ? "，吃后打出可听牌"
      : "，打出后可听牌"
    : "";
  return `${getCardAccessibleText(card)}，${state}${listening}`;
}

function parseActionDescriptor(action: string): { actor: string; keyword: string } {
  const parts = String(action ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { actor: "", keyword: "" };
  }
  if (parts[0].startsWith("seat_") || parts[0].startsWith("bot_")) {
    return {
      actor: parts[0],
      keyword: parts[1] ?? "",
    };
  }
  return {
    actor: "",
    keyword: parts[0],
  };
}

function setSeatRef(playerId: string, el: HTMLElement | null): void {
  if (!playerId) {
    return;
  }
  if (el) {
    seatRefMap.set(playerId, el);
  } else {
    seatRefMap.delete(playerId);
  }
}

function resolvePlayerPosition(playerId: string): "top" | "left" | "right" | "self" | null {
  if (selfPlayer.value?.clientId === playerId) {
    return "self";
  }
  if (topPlayer.value?.clientId === playerId) {
    return "top";
  }
  if (leftPlayer.value?.clientId === playerId) {
    return "left";
  }
  if (rightPlayer.value?.clientId === playerId) {
    return "right";
  }
  return null;
}

function pointFromElement(el: HTMLElement | null): { x: number; y: number } | null {
  const rect = rectFromElement(el);
  if (!rect) return null;
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function rectFromElement(el: HTMLElement | null): CardRect | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function openAreaTargetForSelf(): { x: number; y: number } | null {
  return pointFromElement(selfOpenRef.value) ?? pointFromElement(selfZoneRef.value);
}

function targetForPlayer(playerId: string): { x: number; y: number } | null {
  if (!playerId) {
    return null;
  }
  if (selfPlayer.value?.clientId === playerId) {
    return pointFromElement(selfHandRef.value) ?? pointFromElement(selfZoneRef.value);
  }
  return pointFromElement(seatRefMap.get(playerId) ?? null);
}

function responseLandingPoint(): { x: number; y: number } | null {
  return pointFromElement(responseLandingRef.value) ?? pointFromElement(tableRef.value);
}

function dealStartPoint(): { x: number; y: number } | null {
  return pointFromElement(deckAnchorRef.value) ?? responseLandingPoint();
}

function groupOffsets(count: number): Array<{ x: number; y: number }> {
  if (count <= 1) {
    return [{ x: 0, y: 0 }];
  }
  if (count === 3) {
    return [
      { x: -20, y: 6 },
      { x: 0, y: -10 },
      { x: 20, y: 6 },
    ];
  }
  return [
    { x: -28, y: 8 },
    { x: -10, y: -10 },
    { x: 10, y: -10 },
    { x: 28, y: 8 },
  ];
}

function spawnFlight(flight: Omit<CardFlight, "id">): void {
  // Legacy action flights aim at estimated zone centers. Keep only the
  // symbolic opening-deal backs; exact table transitions own card movement.
  if (flight.mode !== "deal" || coordinateMotionSuppressed.value) return;
  const id = ++flightSeq;
  flights.value.push({ id, ...flight });
  const ttl = Math.max(120, flight.duration + flight.delay + 120);
  window.setTimeout(() => {
    flights.value = flights.value.filter((item) => item.id !== id);
  }, ttl);
}

function flightStyle(flight: CardFlight): Record<string, string> {
  return {
    "--sx": `${flight.sx}px`,
    "--sy": `${flight.sy}px`,
    "--ex": `${flight.ex}px`,
    "--ey": `${flight.ey}px`,
    "--dur": `${flight.duration}ms`,
    "--delay": `${flight.delay}ms`,
    width: `${flight.width}px`,
    height: `${flight.height}px`,
  };
}

function triggerDiscardAnimationFromElement(sourceEl: HTMLElement, card: Card): void {
  const source = pointFromElement(sourceEl);
  const target = responseLandingPoint();
  if (!source || !target) {
    return;
  }
  spawnFlight({
    mode: "discard",
    card,
    sx: source.x - 12,
    sy: source.y - 34,
    ex: target.x - 14,
    ey: target.y - 38,
    width: 28,
    height: 76,
    duration: 260,
    delay: 0,
  });
}

function triggerDiscardAnimationFromSeat(actorId: string): void {
  const source = targetForPlayer(actorId);
  const target = responseLandingPoint();
  const card = responseCard.value ?? latestDiscardFromAction.value ?? undefined;
  if (!source || !target || !card) {
    return;
  }
  spawnFlight({
    mode: "discard",
    card,
    sx: source.x - 12,
    sy: source.y - 34,
    ex: target.x - 14,
    ey: target.y - 38,
    width: 28,
    height: 76,
    duration: 300,
    delay: 0,
  });
}

function triggerMeldAnimation(actorId: string, keyword: string): void {
  const source = responseLandingPoint();
  const target =
    selfPlayer.value?.clientId === actorId
      ? openAreaTargetForSelf()
      : pointFromElement(seatRefMap.get(actorId) ?? null);
  if (!source || !target) {
    return;
  }
  const baseCard = responseCard.value ?? latestDiscardFromAction.value ?? undefined;
  if (!baseCard) {
    return;
  }
  const count = keyword === "KAI" ? 4 : 3;
  const offsets = groupOffsets(count);
  offsets.forEach((offset, index) => {
    spawnFlight({
      mode: "meld",
      card: { ...baseCard, id: `${baseCard.id}-meld-${index}-${Date.now()}` },
      sx: source.x - 11 + index * 3,
      sy: source.y - 32 + index * 2,
      ex: target.x - 13 + offset.x,
      ey: target.y - 36 + offset.y,
      width: 26,
      height: 72,
      duration: 330,
      delay: index * 70,
    });
  });
}

function triggerDrawAnimation(actorId: string): void {
  const source = dealStartPoint();
  const target = responseLandingPoint();
  const card = responseCard.value ?? undefined;
  if (!source || !target || !card) {
    return;
  }
  if (drawHideTimer) {
    clearTimeout(drawHideTimer);
    drawHideTimer = null;
  }
  drawHiddenCardId.value = card.id;
  spawnFlight({
    mode: "discard",
    card,
    sx: source.x - 12,
    sy: source.y - 34,
    ex: target.x - 14,
    ey: target.y - 38,
    width: 28,
    height: 76,
    duration: 340,
    delay: 0,
  });
  drawHideTimer = setTimeout(() => {
    if (drawHiddenCardId.value === card.id) {
      drawHiddenCardId.value = "";
    }
    drawHideTimer = null;
  }, 330);
  triggerActorFlash(actorId);
}

function buildDealPlan(): string[] {
  const players = orderedPlayers.value.map((p) => p.clientId);
  if (players.length !== 4) {
    return [];
  }
  const dealerId = String(props.state?.dealerId ?? "");
  if (!dealerId || !players.includes(dealerId)) {
    return [];
  }
  const dealerIdx = players.indexOf(dealerId);
  const ring = Array.from({ length: players.length }, (_, idx) => players[(dealerIdx + idx) % players.length]);
  const rest = new Map<string, number>(players.map((id) => [id, id === dealerId ? 21 : 20]));
  const plan: string[] = [];
  let safe = 0;
  while (safe < 120) {
    safe += 1;
    let progressed = false;
    for (const id of ring) {
      const left = rest.get(id) ?? 0;
      if (left <= 0) {
        continue;
      }
      plan.push(id);
      rest.set(id, left - 1);
      progressed = true;
    }
    if (!progressed) {
      break;
    }
  }
  return plan;
}

function currentDealRoundKey(): string {
  return getRoundKey(props.state?.roomId, props.state?.completedRounds, props.state?.phase);
}

function currentAnimationRoundKey(): string {
  return getRoundKey(props.state?.roomId, props.state?.completedRounds, props.state?.phase);
}

function shouldAnimateAuthoritativeAction(action: string): boolean {
  const roundKey = currentAnimationRoundKey();
  if (roundKey !== animatedActionRoundKey) {
    animatedActionRoundKey = roundKey;
    animatedActionKeys.clear();
    animatedSemanticActionKeys.clear();
  }
  const targetCardId = String(
    (/^DEALER(?:_PICK|_CARD)?\b/.test(action) ? props.state?.dealerCard?.id : "") ||
    props.state?.responseCard?.id ||
    props.state?.targetCard?.id ||
    "",
  );
  const revision = Math.max(0, Number(props.state?.stateRevision ?? 0));
  const key = `${revision}|${action}|${targetCardId}`;
  const semanticKey = `${action}|${targetCardId}`;
  if (animatedActionKeys.has(key) || animatedSemanticActionKeys.has(semanticKey)) {
    return false;
  }
  animatedActionKeys.add(key);
  animatedSemanticActionKeys.add(semanticKey);
  if (animatedActionKeys.size > 64) {
    animatedActionKeys.delete(animatedActionKeys.values().next().value as string);
  }
  if (animatedSemanticActionKeys.size > 64) {
    animatedSemanticActionKeys.delete(animatedSemanticActionKeys.values().next().value as string);
  }
  return true;
}

function clearDealAnimationRuntime(revealFullHand = true): void {
  dealRunSeq += 1;
  if (dealFrame !== null) {
    cancelAnimationFrame(dealFrame);
    dealFrame = null;
  }
  showDealAnimation.value = false;
  if (revealFullHand) {
    visibleHandCount.value = props.privateHand.length;
  }
}

function prepareOpeningRound(roundKey = currentDealRoundKey()): void {
  if (preparedDealRoundKey === roundKey) {
    return;
  }
  clearDealAnimationRuntime(false);
  preparedDealRoundKey = roundKey;
  visibleHandCount.value = 0;
}

function triggerDealAnimation(roundKey = currentDealRoundKey()): number {
  prepareOpeningRound(roundKey);
  if (presentedDealRoundKey === roundKey) {
    return 0;
  }
  presentedDealRoundKey = roundKey;
  clearDealAnimationRuntime(false);
  const plan = buildDealPlan();
  const start = dealStartPoint();
  if (!plan.length || !start) {
    visibleHandCount.value = isOpeningDealIntroState()
      ? Math.max(0, props.privateHand.length - 1)
      : props.privateHand.length;
    return 0;
  }

  const runId = ++dealRunSeq;
  showDealAnimation.value = true;
  visibleHandCount.value = 0;
  let dispatchedCount = 0;
  const serverTimeLeft = Math.max(0, Number(props.state?.responseEndsAt ?? 0) - Date.now());
  const finishMs = serverTimeLeft > 0 ? serverTimeLeft : plan.length * 32 + 320;
  const settleMs = Math.min(320, Math.max(60, finishMs * 0.1));
  const flightWindowMs = Math.max(1, finishMs - settleMs);
  const startedAt = performance.now();

  const dispatchUntil = (targetCount: number) => {
    // When a device misses frames, advance directly to the absolute position
    // in the sequence. Only materialize the most recent few flights so a
    // delayed frame cannot cause a large catch-up burst and another freeze.
    if (targetCount - dispatchedCount > 2) {
      dispatchedCount = targetCount - 2;
    }
    while (dispatchedCount < targetCount) {
      const targetSeat = plan[dispatchedCount];
      const end = targetForPlayer(targetSeat);
      if (end) {
        spawnFlight({
          mode: "deal",
          sx: start.x - 10,
          sy: start.y - 28,
          ex: end.x - 10,
          ey: end.y - 28,
          width: 20,
          height: 56,
          duration: Math.min(230, Math.max(100, flightWindowMs / 5)),
          delay: 0,
        });
      }
      dispatchedCount += 1;
    }
  };

  const renderFrame = (now: number) => {
    if (runId !== dealRunSeq || presentedDealRoundKey !== roundKey) {
      return;
    }
    const elapsed = Math.max(0, now - startedAt);
    const progress = Math.min(1, elapsed / flightWindowMs);
    const targetCount = Math.min(plan.length, Math.max(1, Math.floor(progress * plan.length)));
    dispatchUntil(targetCount);
    const fullHand = props.privateHand.length;
    if (fullHand > 0) {
      const authoritativeLimit = isOpeningDealIntroState() ? Math.max(0, fullHand - 1) : fullHand;
      const reveal = Math.min(authoritativeLimit, Math.ceil((targetCount / plan.length) * fullHand));
      visibleHandCount.value = Math.max(visibleHandCount.value, reveal);
    }
    if (elapsed >= finishMs) {
      dealFrame = null;
      showDealAnimation.value = false;
      visibleHandCount.value = isOpeningDealIntroState()
        ? Math.max(0, props.privateHand.length - 1)
        : props.privateHand.length;
      return;
    }
    dealFrame = requestAnimationFrame(renderFrame);
  };

  dealFrame = requestAnimationFrame(renderFrame);
  return finishMs;
}

function clearDealerIntroTimer(): void {
  if (dealerIntroTimer) {
    clearTimeout(dealerIntroTimer);
    dealerIntroTimer = null;
  }
}

function triggerActorFlash(actorId: string): void {
  if (!actorId) {
    return;
  }
  if (flashTimer) {
    clearTimeout(flashTimer);
    flashTimer = null;
  }
  flashActorId.value = actorId;
  flashTimer = setTimeout(() => {
    flashActorId.value = "";
    flashTimer = null;
  }, 780);
}

function clearDealerReveal(): void {
  if (dealerTimer) {
    clearTimeout(dealerTimer);
    dealerTimer = null;
  }
  dealerReveal.value = null;
}

function triggerDealerReveal(
  stage: DealerReveal["stage"],
  label: string,
  card?: Card | null,
  dealerId = "",
): void {
  if (dealerTimer) {
    clearTimeout(dealerTimer);
    dealerTimer = null;
  }
  const continuingReveal = stage === "revealed" && dealerReveal.value?.stage === "picking";
  const id = continuingReveal ? dealerReveal.value!.id : ++dealerRevealSeq;
  const dealerName = dealerId
    ? props.players.find((player) => player.clientId === dealerId)?.name || "庄家"
    : "";
  dealerReveal.value = {
    id,
    stage,
    label,
    card: card ?? null,
    dealerId,
    dealerName,
    startedAt: Date.now(),
    pickerId: stage === "picking" ? dealerId : String(props.state?.dealerPickerId ?? ""),
  };
  dealerTimer = setTimeout(() => {
    dealerReveal.value = null;
    dealerTimer = null;
  }, stage === "picking" ? 3000 : 4200);
}

onMounted(() => {
  scheduleHandLayoutUpdate();
  observeSelfNameFit();
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  countdownTimer = setInterval(() => {
    nowMs.value = Date.now();
  }, 500);
});

onUnmounted(() => {
  pauseListeningTimer();
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
  if (presentationFrame !== null) cancelAnimationFrame(presentationFrame);
  if (handLayoutFrame !== null) cancelAnimationFrame(handLayoutFrame);
  handLayoutFrame = null;
  handResizeObserver?.disconnect();
  handResizeObserver = null;
  selfNameResizeObserver?.disconnect();
  selfNameResizeObserver = null;
  clearDealAnimationRuntime();
  clearDealerIntroTimer();
  if (dealerTimer) {
    clearTimeout(dealerTimer);
    dealerTimer = null;
  }
  if (flashTimer) {
    clearTimeout(flashTimer);
    flashTimer = null;
  }
  if (drawHideTimer) {
    clearTimeout(drawHideTimer);
    drawHideTimer = null;
  }
  if (discardPendingTimer) {
    clearTimeout(discardPendingTimer);
    discardPendingTimer = null;
  }
  if (localDiscardAckTimer) {
    clearTimeout(localDiscardAckTimer);
    localDiscardAckTimer = null;
  }
  if (chiValidationTimer) {
    clearTimeout(chiValidationTimer);
    chiValidationTimer = null;
  }
  flashActorId.value = "";
  drawHiddenCardId.value = "";
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
});

watch(
  () => `${selfPlayer.value?.name ?? ""}|${selfPlayer.value?.declaredKongs ?? 0}|${selfPlayer.value?.visibleGroupScore ?? 0}|${selfPlayer.value?.handCount ?? 0}`,
  () => void nextTick(updateSelfNameFit),
);
watch(selfIdentityRef, observeSelfNameFit);
watch(() => props.decisionKey, () => closeListeningDetails());
watch(listeningDetailWaits, (waits) => {
  if (!waits.length) closeListeningDetails();
});

// GameBoard is mounted when the waiting lobby changes into the dealer intro.
// Present that initial DEALER_PICK/DEALER_CARD event immediately; the old
// mount hook incorrectly started a complete deal here and DEALER started a
// second one a moment later.
watch(
  () => [
    Number(props.state?.stateRevision ?? 0),
    String(props.state?.lastAction ?? ""),
    String(props.state?.responseCard?.id ?? props.state?.targetCard?.id ?? props.state?.dealerCard?.id ?? ""),
  ] as const,
  ([, action]) => {
    if (!action || !shouldAnimateAuthoritativeAction(action)) {
      return;
    }
    const roundKey = currentDealRoundKey();
    const dealerPickMatch = String(action ?? "").match(/^DEALER_PICK\s+(\S+)/);
    if (dealerPickMatch) {
      prepareOpeningRound(roundKey);
      triggerDealerReveal("picking", "翻定庄牌", null, dealerPickMatch[1]);
      return;
    }
    const dealerCardMatch = String(action ?? "").match(/^DEALER_CARD\s+(\S+)/);
    if (dealerCardMatch) {
      prepareOpeningRound(roundKey);
      const dealerId = dealerCardMatch[1];
      triggerDealerReveal("revealed", "定庄牌揭晓", dealerInfoCard.value, dealerId);
      return;
    }
    const dealerMatch = String(action ?? "").match(/^DEALER\s+(\S+)/);
    if (dealerMatch && props.state?.phase === "declaring") {
      clearDealerReveal();
      triggerDealAnimation(roundKey);
      return;
    }
    if (props.state?.phase === "declaring" && /^DECLARING\b/.test(String(action ?? ""))) {
      clearDealAnimationRuntime(true);
    }
    if (props.state?.tablePresentationVersion) return;
    const { actor, keyword } = parseActionDescriptor(String(action ?? ""));
    if (actor) {
      triggerActorFlash(actor);
    }
    if (keyword === "DISCARD" && actor) {
      const isLocalAcknowledgement = actor === props.mySeatId && Boolean(locallyAnimatedDiscardCardId.value);
      if (isLocalAcknowledgement) {
        locallyAnimatedDiscardCardId.value = null;
        if (localDiscardAckTimer) {
          clearTimeout(localDiscardAckTimer);
          localDiscardAckTimer = null;
        }
      } else {
        triggerDiscardAnimationFromSeat(actor);
      }
      return;
    }
    if ((keyword === "PENG" || keyword === "KAI" || keyword === "CHI") && actor) {
      triggerMeldAnimation(actor, keyword);
      return;
    }
    if ((keyword === "ZHUA" || keyword === "TURN_DRAW" || keyword === "KONG_DRAW") && actor) {
      triggerDrawAnimation(actor);
    }
  },
  { immediate: true },
);

watch(
  () => props.privateHand.map((x) => x.id).join("|"),
  () => {
    if (!showDealAnimation.value && !openingDealIntroActive.value && props.state?.phase !== "waiting") {
      visibleHandCount.value = props.privateHand.length;
    }
    if (discardingCardId.value && !props.privateHand.some((card) => card.id === discardingCardId.value)) {
      discardingCardId.value = null;
      if (discardPendingTimer) {
        clearTimeout(discardPendingTimer);
        discardPendingTimer = null;
      }
    }
    if (selectedDiscardCardId.value && !props.privateHand.some((card) => card.id === selectedDiscardCardId.value)) {
      selectedDiscardCardId.value = null;
    }
    const retainedChiCardIds = selectedChiCardIds.value.filter((cardId) =>
      props.privateHand.some((card) => card.id === cardId),
    );
    if (retainedChiCardIds.length !== selectedChiCardIds.value.length) {
      blockChiAutoSelectionForCurrentTarget();
      selectedChiCardIds.value = [];
    }
    void nextTick(scheduleHandLayoutUpdate);
  },
);

// Settle the new count's scale after mounting, before its first paint.
watch(
  () => handLayoutCards.value.map((card) => card.id).join("|"),
  () => updateHandLayoutState(),
  { flush: "post" },
);

watch(
  handPresentationBusy,
  (busy) => {
    if (busy && props.handLayout !== "paged") handScaleReady.value = false;
    void nextTick(scheduleHandLayoutUpdate);
  },
  { immediate: true },
);

watch(
  () => [appliedOwnCardMode.value, props.handLayout, props.viewportTransformKey],
  () => {
    handScaleReady.value = false;
    void nextTick(scheduleHandLayoutUpdate);
  },
);

watch(handViewportRef, observeHandViewport, { immediate: true });
watch(() => [props.players.map(player => player.discardPile.length).join(','), appliedTableCardMode.value,
  flights.value.length, activeTableEvents.value.length], () => void nextTick(scheduleHandLayoutUpdate));

watch(
  () => chiSelectionContextKey.value,
  (contextKey) => {
    if (contextKey === activeChiSelectionContextKey) {
      return;
    }
    activeChiSelectionContextKey = contextKey;
    chiAutoSelectionBlockedKey.value = "";
    selectedChiCardIds.value = [];
    chiValidationMessage.value = "";
  },
  { immediate: true },
);

watch(
  () => `${props.state?.roomId ?? ""}|${props.state?.completedRounds ?? 0}|${props.state?.phase ?? ""}`,
  () => {
    if (props.state?.phase !== "playing") retainedUpperResponseCardId.value = "";
    if (props.state?.phase === "playing") {
      return;
    }
    selectedDiscardCardId.value = null;
    selectedChiCardIds.value = [];
  },
);

watch(
  () => Boolean(selfPlayer.value?.isBot || selfPlayer.value?.isAutoPlay),
  (automatic) => {
    if (!automatic) return;
    selectedDiscardCardId.value = null;
    selectedChiCardIds.value = [];
  },
);

watch(
  () => `${chiSelectionContextKey.value}|${activeChiCandidates.value.map((candidate) => candidate.id).join("|")}`,
  () => {
    if (!chiSelectionAvailable.value) {
      return;
    }
    const selected = selectedChiCardIds.value;
    if (
      selected.length > 0 &&
      !activeChiCandidates.value.some((candidate) => selected.every((cardId) => candidate.cardIds.includes(cardId)))
    ) {
      selectedChiCardIds.value = [];
      blockChiAutoSelectionForCurrentTarget();
      return;
    }
    if (selected.length > 0 || chiAutoSelectionBlockedKey.value === chiSelectionContextKey.value) {
      return;
    }
    const defaultCandidate = defaultVisibleChiCandidate();
    if (defaultCandidate) {
      selectedChiCardIds.value = [...defaultCandidate.cardIds];
    }
  },
  { immediate: true },
);

watch(
  () => selectedChiCardIds.value.join("|"),
  () => {
    chiValidationMessage.value = "";
  },
);

watch(
  () => props.actionFeedback?.status,
  (status) => {
    if (status !== "rejected" || !discardingCardId.value) {
      return;
    }
    discardingCardId.value = null;
    locallyAnimatedDiscardCardId.value = null;
    if (discardPendingTimer) {
      clearTimeout(discardPendingTimer);
      discardPendingTimer = null;
    }
    if (localDiscardAckTimer) {
      clearTimeout(localDiscardAckTimer);
      localDiscardAckTimer = null;
    }
  },
);

watch(
  () => canAct.value || canDiscard.value,
  (ready, wasReady) => {
    if (!ready || wasReady) {
      return;
    }
    void nextTick(() => {
      if (document.querySelector<HTMLElement>("[aria-modal='true']") || document.activeElement?.closest(".game-tools")) {
        return;
      }
      const board = boardRef.value;
      const target = chiSelectionAvailable.value
        ? board?.querySelector<HTMLElement>(".hand-card.candidate-active:not(:disabled)") ??
          board?.querySelector<HTMLElement>(".action-dock .btn:not(:disabled)")
        : canDiscard.value
          ? board?.querySelector<HTMLElement>(".hand-card.playable")
          : board?.querySelector<HTMLElement>(".action-dock .btn:not(:disabled)");
      target?.focus({ preventScroll: true });
    });
  },
  { immediate: true },
);
// Do not evaluate flight geometry before onBeforeUpdate captures source anchors.
watch(() => Boolean(flights.value.length || (!coordinateMotionSuppressed.value && activeTableEvents.value.length) || dealerReveal.value), busy => emit("geometryBusy", busy), { flush: "post" });
onUnmounted(() => emit("geometryBusy", false));
// Geometry changes wait for all visible card transactions, including opening deals.
const appliedTableLayout = ref<RenderedTableLayoutId>(props.tableLayout ?? "classic");
watch(() => [props.tableLayout, props.tableCardMode, props.ownCardMode, flights.value.length, coordinateMotionSuppressed.value ? 0 : activeTableEvents.value.length, Boolean(dealerReveal.value)] as const,
  async ([layout, tableMode, ownMode, dealCount, moveCount, revealing]) => {
    if (dealCount || moveCount || revealing) return;
    if (appliedTableLayout.value === layout && appliedTableCardMode.value === tableMode && appliedOwnCardMode.value === ownMode) return;
    appliedTableLayout.value = layout ?? "classic";
    appliedTableCardMode.value = tableMode ?? "large";
    appliedOwnCardMode.value = ownMode ?? "large";
    lastCardRects.clear(); tableFlightSources.clear(); tableFlightDestinations.clear(); tableFlightFaceStyles.clear();
    await nextTick(); scheduleHandLayoutUpdate();
  },
);
</script>

<style scoped>
.dealer-count-token { position: absolute; z-index: 32; display: grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; border: 3px solid var(--ui-gold-text, #b87912); background: var(--ui-panel, #fff7df); color: var(--ui-text); box-shadow: 0 0 16px rgba(210, 163, 55, .55); font-size: 25px; font-weight: 850; transform: translate(-50%, -50%); transition: left 480ms ease-in-out, top 480ms ease-in-out; pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .dealer-count-token { transition: none; } }
.dealer-picker-name { color: var(--ui-text); font-size: clamp(1rem, 3vh, 1.4rem); max-width: 22rem; overflow-wrap: anywhere; }
.board .player-card.dealer-picker-active::after { content: attr(data-dealer-count); position: absolute; top: -8px; right: -8px; display: grid; place-items: center; min-width: 24px; height: 24px; border-radius: 50%; background: var(--ui-gold-text, #b87912); color: var(--ui-panel, #fff7df); font-size: 16px; font-weight: 800; }
.board .player-card.dealer-picker-active { z-index: 11; outline: 3px solid var(--ui-gold-text, #b87912); outline-offset: 3px; background: rgba(var(--ui-raised-rgb, 255, 247, 220), .8); }

.table-flight {
  position: fixed;
  left: 0;
  top: 0;
  pointer-events: none;
  perspective: 600px;
  z-index: 90;
  transform-origin: top left;
  will-change: transform;
  contain: strict;
}
.table-flight-turn { width: 100%; height: 100%; }
.table-flight-turn > :deep(.card), .table-flight-turn > .card-back { width: 100%; height: 100%; box-sizing: border-box; }

.board {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-columns: minmax(10rem, 23%) minmax(0, 1fr) clamp(12rem, 22vw, 18rem);
  grid-template-rows: minmax(0, 1fr) clamp(8.5rem, 26vh, 13rem);
  gap: clamp(0.3rem, 0.9vh, 0.5rem);
  overflow: hidden;
  overflow: clip;
}

.table {
  position: relative;
  grid-column: 1 / -1;
  width: 100%;
  aspect-ratio: auto;
  height: 100%;
  min-height: 0;
  max-height: none;
  margin: 0 auto;
  border-radius: clamp(0.5rem, 1.5vh, 1rem);
  border: 1px solid var(--ui-raised, #1e293b);
  background: radial-gradient(120% 90% at 50% 50%, rgba(var(--ui-panel-rgb, 6, 78, 59), 0.9), rgba(var(--ui-panel-rgb, 15, 23, 42), 0.96) 70%),
    linear-gradient(160deg, var(--ui-panel, #0b1220) 0%, var(--ui-page, #020617) 100%);
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 23%) minmax(0, 1fr) minmax(0, 23%);
  grid-template-rows: minmax(4.6rem, 0.82fr) minmax(5.2rem, 1fr) minmax(4.8rem, 0.9fr);
  grid-template-areas:
    "flowtl top flowtr"
    "left center right"
    "flowbl selfgroups flowbr";
  column-gap: clamp(0.3rem, 1vw, 0.75rem);
  row-gap: clamp(0.25rem, 0.9vh, 0.6rem);
  padding: clamp(0.35rem, 1vh, 0.7rem);
}

.corner-card {
  min-width: 4.3rem;
  min-height: 2rem;
  padding: 0.2rem 0.55rem;
  border-radius: 0.7rem;
  border: 2px solid rgba(var(--ui-panel-rgb, 15, 23, 42), 0.42);
  color: var(--ui-text, #111827);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.95rem;
  font-weight: 800;
}

.response-card-simple {
  min-width: clamp(2.2rem, 5vh, 2.9rem);
  min-height: clamp(3rem, 7vh, 4rem);
  font-size: clamp(1rem, 2.4vh, 1.38rem);
}

.player-card,
.flow-card,
.self-groups-card,
.self-info-card,
.self-hand-card {
  position: relative;
  background: rgba(var(--ui-panel-rgb, 11, 18, 32), 0.88);
  border: 1px solid var(--ui-raised, #1e293b);
  border-radius: clamp(0.4rem, 1vh, 0.8rem);
  padding: clamp(0.25rem, 0.8vh, 0.5rem);
  color: var(--ui-text, #e2e8f0);
  min-height: 0;
}

.player-card {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 6px;
  overflow: auto;
}

.player-top {
  grid-area: top;
  width: 100%;
  justify-self: center;
  height: auto;
  min-height: clamp(4.6rem, 13vh, 6.6rem);
}

.player-left {
  grid-area: left;
  width: 100%;
  height: 100%;
}

.player-right {
  grid-area: right;
  width: 100%;
  height: 100%;
}

.player-card.active {
  border-color: #22c55e;
  box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.35) inset;
}

.player-card.actor-flash,
.self-info-card.actor-flash {
  isolation: isolate;
}

.player-card.actor-flash::after,
.self-info-card.actor-flash::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  border: 3px solid rgba(var(--ui-accent-rgb, 56, 189, 248), 0.86);
  border-radius: inherit;
  animation: actor-flash 0.72s ease-out both;
}

.player-card.dealer,
.self-info-card.dealer {
  border-color: rgba(245, 158, 11, 0.92);
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.34) inset, 0 0 18px rgba(245, 158, 11, 0.2);
}

.flow-card {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  overflow: auto;
  contain: layout paint;
}

.flow-card.flow-empty {
  background: rgba(var(--ui-panel-rgb, 11, 18, 32), 0.48);
  border-color: rgba(var(--ui-border-rgb, 51, 65, 85), 0.7);
}

.flow-card p,
.self-groups-card p {
  margin: 0;
  font-size: clamp(0.72rem, 1.3vh, 0.86rem);
  color: var(--ui-muted, #cbd5e1);
}

.flow-top-left {
  grid-area: flowtl;
}

.flow-top-right {
  grid-area: flowtr;
}

.flow-bottom-left {
  grid-area: flowbl;
}

.flow-bottom-right {
  grid-area: flowbr;
}

.self-groups-card {
  grid-area: selfgroups;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  overflow: auto;
}

.self-groups-card.empty {
  padding: 0;
  border-color: transparent;
  background: transparent;
  overflow: hidden;
}

.self-info-card {
  grid-column: 1;
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  gap: 0.35rem;
  overflow: hidden;
}

.self-hand-card {
  grid-column: 2;
  overflow: visible;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.seat-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.seat-identity {
  min-width: 0;
  max-width: 100%;
  flex: 1 1 auto;
  display: inline-flex;
  align-items: center;
  gap: clamp(0.2rem, 0.55vh, 0.4rem);
}

.seat-identity strong,
.seat-identity h3 {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bot-seat-badge {
  flex: 0 0 auto;
  min-height: 1.2rem;
  padding: 0.06rem 0.32rem;
  border: 1px solid rgba(var(--ui-accent-rgb, 125, 211, 252), 0.74);
  border-radius: 999px;
  background: rgba(var(--ui-panel-rgb, 3, 105, 161), 0.42);
  color: var(--ui-accent-text, #e0f2fe);
  display: inline-grid;
  place-items: center;
  font-size: max(0.8125rem, 13px);
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
}

.hand-count-badge {
  flex: 0 0 auto;
  min-width: clamp(1.8rem, 4.4vh, 2.35rem);
  min-height: clamp(1.3rem, 3vh, 1.65rem);
  padding: 0.06rem 0.22rem;
  border: 1px solid rgba(var(--ui-accent-rgb, 125, 211, 252), 0.58);
  border-radius: 999px;
  background: rgba(var(--ui-panel-rgb, 3, 105, 161), 0.24);
  color: var(--ui-accent-text, #e0f2fe);
  display: inline-grid;
  place-items: center;
  font-size: max(0.8125rem, 13px);
  font-weight: 850;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  white-space: nowrap;
}

.dealer-badge {
  flex: 0 0 auto;
  width: clamp(1.35rem, 3.2vh, 1.8rem);
  height: clamp(1.35rem, 3.2vh, 1.8rem);
  border-radius: 50%;
  display: inline-grid;
  place-items: center;
  border: 1px solid rgba(245, 158, 11, 0.95);
  background: linear-gradient(145deg, var(--ui-raised, #fbbf24), var(--ui-raised, #b45309));
  color: var(--ui-danger-text, #451a03);
  font-size: max(0.8125rem, 13px);
  font-weight: 900;
  box-shadow: 0 0 10px rgba(245, 158, 11, 0.32);
}

.dealer-seat-lockup {
  flex: 0 0 auto;
  min-width: max-content;
  display: inline-flex;
  align-items: center;
  gap: clamp(0.16rem, 0.42vh, 0.3rem);
  overflow: visible;
}

.dealer-card-mark {
  flex: 0 0 auto;
  display: inline-grid;
  place-items: center;
  overflow: visible;
}

.dealer-card-mark :deep(.card) {
  transform: none;
}

.dealer-card-simple {
  min-width: 1.55rem;
  min-height: 1.55rem;
  padding: 0.12rem 0.28rem;
  border-radius: 0.45rem;
  display: inline-grid;
  place-items: center;
  color: var(--ui-text, #111827);
  font-size: clamp(0.72rem, 1.65vh, 0.95rem);
  font-weight: 900;
}

.seat-meta {
  margin: 0;
  color: var(--ui-accent-text, #93c5fd);
  font-size: clamp(0.72rem, 1.25vh, 0.84rem);
}

.seat-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tag {
  border-radius: 999px;
  padding: 2px 8px;
  font-size: clamp(0.68rem, 1.15vh, 0.82rem);
  line-height: 18px;
  white-space: nowrap;
  border: 1px solid var(--ui-raised, #334155);
  color: var(--ui-muted, #cbd5e1);
}

.tag.turn {
  border-color: #22c55e;
  background: rgba(var(--ui-panel-rgb, 34, 197, 94), 0.15);
  color: var(--ui-text, #bbf7d0);
  font-size: max(0.8125rem, 13px);
  line-height: 1.2;
}

.turn-countdown {
  border-radius: 999px;
  border: 1px solid rgba(16, 185, 129, 0.75);
  background: rgba(var(--ui-panel-rgb, 6, 78, 59), 0.28);
  color: var(--ui-accent-text, #a7f3d0);
  padding: 1px 7px;
  font-size: clamp(0.62rem, 1.2vh, 0.75rem);
  line-height: 1.2;
  white-space: nowrap;
}

.turn-timer-bar {
  position: relative;
  width: 100%;
  height: 7px;
  margin-top: 2px;
  border-radius: 999px;
  background: rgba(var(--ui-raised-rgb, 30, 41, 59), 0.9);
  border: 1px solid rgba(var(--ui-border-rgb, 71, 85, 105), 0.9);
  overflow: hidden;
}

.turn-timer-bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--ui-raised, #22c55e), var(--ui-raised, #84cc16));
  transition: width 0.35s linear;
}

.tag.status {
  border-color: var(--ui-ink, #334155);
}

.tag.dealer {
  border-color: #f59e0b;
  background: rgba(var(--ui-panel-rgb, 245, 158, 11), 0.16);
  color: var(--ui-gold-text, #fde68a);
}

.seat-zone {
  margin: 0;
  border-top: 1px dashed var(--ui-raised, #334155);
  padding-top: 6px;
  min-height: 0;
  overflow: auto;
}

.discard-zone {
  min-height: 5.2rem;
}

.seat-zone p {
  margin: 0 0 6px;
  font-size: clamp(0.72rem, 1.25vh, 0.84rem);
  color: var(--ui-muted, #cbd5e1);
}

.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.discard-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: flex-start;
}

.discard-token {
  position: relative;
  border-radius: 0.45rem;
  border: 2px solid rgba(var(--ui-panel-rgb, 15, 23, 42), 0.45);
  flex: 0 0 auto;
  box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.22);
  transition: transform 0.18s ease, opacity 0.18s ease, border-color 0.18s ease;
}

.discard-token.mode-large {
  width: clamp(1.72rem, 3.3vh, 1.95rem);
  height: clamp(1.82rem, 3.5vh, 2.05rem);
  font-size: clamp(0.76rem, 1.5vh, 0.92rem);
}

.discard-token.mode-long {
  width: clamp(1rem, 1.8vh, 1.2rem);
  height: clamp(2rem, 4vh, 2.4rem);
  font-size: clamp(0.56rem, 1.05vh, 0.68rem);
}

.discard-token.active {
  box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.22);
  transform: translateY(-1px);
}

.discard-token.active::after {
  content: "";
  position: absolute;
  inset: -4px;
  border-radius: 0.62rem;
  padding: 3px;
  background: linear-gradient(135deg, var(--ui-raised, #f43f5e), var(--ui-raised, #f59e0b), var(--ui-raised, #22c55e), var(--ui-accent, #38bdf8), var(--ui-raised, #a855f7));
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

.discard-empty {
  min-height: 3.2rem;
  border: 1px dashed rgba(100, 116, 139, 0.55);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-muted, #94a3b8);
  font-size: clamp(0.72rem, 1.25vh, 0.84rem);
  background: rgba(var(--ui-panel-rgb, 15, 23, 42), 0.18);
}

.grouped-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-content: flex-start;
}

.group-block-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-content: flex-start;
}

.group-block-list.compact {
  gap: 4px;
}

.group-block {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 2rem;
  padding: 0.25rem 0.35rem;
  border-radius: 0.7rem;
  border: 1px solid rgba(var(--ui-border-rgb, 71, 85, 105), 0.9);
  background: rgba(var(--ui-panel-rgb, 15, 23, 42), 0.56);
  flex: 0 1 auto;
  max-width: 100%;
}

.group-block.fish {
  border-color: rgba(var(--ui-accent-rgb, 56, 189, 248), 0.7);
  background: rgba(var(--ui-panel-rgb, 8, 47, 73), 0.42);
}

.group-block.public {
  border-color: rgba(250, 204, 21, 0.72);
  background: rgba(var(--ui-panel-rgb, 113, 63, 18), 0.32);
}

.group-badge {
  flex: 0 0 auto;
  min-width: 1.55rem;
  height: 1.55rem;
  border-radius: 999px;
  border: 1px solid rgba(var(--ui-muted-rgb, 148, 163, 184), 0.55);
  color: var(--ui-text, #e2e8f0);
  background: rgba(var(--ui-raised-rgb, 30, 41, 59), 0.9);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(0.68rem, 1.15vh, 0.8rem);
  font-weight: 700;
}

.mini-card-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  min-width: 0;
}

.mini-card-strip.mode-long,
.mini-card-strip.stacked {
  flex-wrap: nowrap;
  gap: 0;
  padding-right: 0.22rem;
}

.mini-card-strip.mode-long .mini-card + .mini-card {
  margin-left: -0.32rem;
}

.mini-card-strip.stacked:not(.mode-long) .mini-card + .mini-card {
  margin-left: -0.28rem;
}

.mini-card {
  border-radius: 0.45rem;
  border: 2px solid rgba(var(--ui-panel-rgb, 15, 23, 42), 0.42);
  flex: 0 0 auto;
  box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.22);
}

.mini-card.mode-large {
  width: clamp(1.55rem, 3vh, 1.8rem);
  height: clamp(1.68rem, 3.2vh, 1.95rem);
  font-size: clamp(0.76rem, 1.45vh, 0.92rem);
}

.mini-card.mode-long {
  width: clamp(0.95rem, 1.7vh, 1.15rem);
  height: clamp(1.95rem, 3.8vh, 2.3rem);
  font-size: clamp(0.54rem, 1vh, 0.66rem);
}

.pending-fish-back {
  position: relative;
  width: clamp(1.55rem, 3vh, 1.8rem);
  height: clamp(1.68rem, 3.2vh, 1.95rem);
  overflow: hidden;
  border-color: rgba(254, 202, 202, 0.84);
  background: var(--card-back);
  box-shadow: inset 0 0 0 2px rgba(127, 29, 29, 0.68), 0 2px 5px rgba(var(--ui-page-rgb, 2, 6, 23), 0.36);
}

.mini-card-strip.mode-long .pending-fish-back {
  border-radius: var(--long-card-radius);
  width: clamp(0.95rem, 1.7vh, 1.15rem);
  height: clamp(1.95rem, 3.8vh, 2.3rem);
}

.pending-fish-back i {
  position: absolute;
  left: 50%;
  width: 0.18rem;
  height: 0.18rem;
  border-radius: 50%;
  background: rgba(254, 202, 202, 0.84);
  transform: translateX(-50%);
}

.pending-fish-back i:nth-child(1) { top: 18%; }
.pending-fish-back i:nth-child(2) { top: 39%; }
.pending-fish-back i:nth-child(3) { top: 60%; }
.pending-fish-back i:nth-child(4) { top: 81%; }

.group-chip {
  appearance: none;
  border: 1px solid var(--ui-raised, #334155);
  background: rgba(var(--ui-panel-rgb, 15, 23, 42), 0.62);
  border-radius: 8px;
  padding: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  max-width: 100%;
}

.group-chip.stacked {
  padding-right: 6px;
  overflow: visible;
}

.group-chip.expanded {
  background: rgba(var(--ui-raised-rgb, 30, 41, 59), 0.65);
  border-color: #64748b;
}

.group-chip:focus-visible {
  outline: 2px solid #22c55e;
  outline-offset: 1px;
}

.stacked-preview {
  display: inline-flex;
  align-items: flex-end;
  padding: 2px 2px 0 0;
}

.stack-item {
  transform-origin: bottom center;
  transition: transform 0.2s ease;
}

.stack-count {
  margin-left: 6px;
  font-size: clamp(0.72rem, 1.25vh, 0.84rem);
  color: var(--ui-text, #bfdbfe);
  font-weight: 700;
}

.expanded-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-start;
}

.seat-zone .cards {
  max-height: none;
  overflow: visible;
  padding-right: 0;
}

.center {
  position: relative;
  grid-area: center;
  width: 100%;
  justify-self: stretch;
  min-width: 0;
  min-height: 0;
  background: rgba(var(--ui-panel-rgb, 11, 18, 32), 0.82);
  border: 1px solid rgba(var(--ui-muted-rgb, 148, 163, 184), 0.28);
  border-radius: clamp(0.5rem, 1.4vh, 0.9rem);
  padding: clamp(0.3rem, 0.95vh, 0.65rem);
  color: var(--ui-text, #e2e8f0);
  display: flex;
  align-items: stretch;
  align-self: stretch;
}

.center-board {
  width: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(7.6rem, 1.35fr) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) minmax(0, 1.25fr) minmax(0, 1fr);
  grid-template-areas:
    ". top ."
    "left core right"
    ". bottom .";
  gap: clamp(0.22rem, 0.7vh, 0.48rem);
}

.center-seat {
  min-width: 0;
  min-height: 0;
  display: grid;
  justify-items: center;
  align-content: center;
  gap: clamp(0.18rem, 0.55vh, 0.35rem);
  pointer-events: none;
}

.center-seat-top {
  grid-area: top;
  align-self: start;
}

.center-seat-left {
  grid-area: left;
  justify-self: start;
  align-self: center;
}

.center-seat-right {
  grid-area: right;
  justify-self: end;
  align-self: center;
}

.center-seat-bottom {
  grid-area: bottom;
  align-self: end;
}

.center-seat-name {
  font-size: clamp(0.62rem, 1.2vh, 0.76rem);
  color: var(--ui-muted, #cbd5e1);
  text-align: center;
}

.center-seat-action {
  min-width: clamp(3rem, 7vw, 4.3rem);
  min-height: clamp(2rem, 4.8vh, 2.8rem);
  padding: 0.18rem 0.42rem;
  border-radius: 0.8rem;
  border: 1px dashed rgba(var(--ui-border-rgb, 71, 85, 105), 0.8);
  background: rgba(var(--ui-panel-rgb, 15, 23, 42), 0.46);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(0.84rem, 1.6vh, 1.02rem);
  font-weight: 800;
  color: var(--ui-muted, #94a3b8);
  text-align: center;
  line-height: 1.1;
}

.center-seat.action .center-seat-action {
  border-style: solid;
  border-color: rgba(251, 191, 36, 0.88);
  background: rgba(var(--ui-panel-rgb, 120, 53, 15), 0.34);
  color: var(--ui-gold-text, #fef3c7);
  box-shadow: 0 0 16px rgba(245, 158, 11, 0.18);
}

.center-seat.responding .center-seat-action,
.center-seat.active .center-seat-action {
  border-color: rgba(34, 197, 94, 0.88);
  color: var(--ui-text, #dcfce7);
  box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.24) inset, 0 0 16px rgba(34, 197, 94, 0.16);
}

.center-stage {
  grid-column: 2;
  grid-row: 1 / 4;
  position: relative;
  min-width: 0;
  min-height: 0;
  pointer-events: none;
  display: grid;
  place-items: center;
}

.center-card-pair {
  display: grid;
  grid-template-columns: clamp(2.65rem, 6vh, 3.2rem) clamp(2.8rem, 8vh, 4.5rem);
  gap: clamp(0.45rem, 1.1vw, 0.85rem);
  align-items: center;
  justify-content: center;
}

.deck-slot,
.response-slot {
  display: grid;
  place-items: center;
  min-width: 0;
  width: 100%;
  height: clamp(3.25rem, 8vh, 4rem);
}

.pending-inline {
  display: flex;
  align-items: center;
  justify-content: center;
}

.response-focus {
  position: relative;
  z-index: 5;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  filter: drop-shadow(0 9px 16px rgba(var(--ui-page-rgb, 2, 6, 23), 0.32));
}

.response-caption {
  position: absolute;
  left: 50%;
  bottom: -0.2rem;
  z-index: 2;
  transform: translate(-50%, 55%);
  border-radius: 999px;
  border: 1px solid rgba(var(--ui-accent-rgb, 125, 211, 252), 0.42);
  background: rgba(var(--ui-panel-rgb, 8, 47, 73), 0.88);
  color: var(--ui-accent-text, #e0f2fe);
  padding: 0.05rem 0.38rem;
  font-size: max(0.8125rem, 13px);
  font-weight: 800;
  line-height: 1.15;
  white-space: nowrap;
}

.pending-inline.draw-pending-hidden > * {
  opacity: 0;
}

.deck-stack {
  position: relative;
  width: 100%;
  height: 100%;
  z-index: 5;
  filter: drop-shadow(0 7px 10px rgba(var(--ui-page-rgb, 2, 6, 23), 0.3));
}

.deck-layer {
  --deck-x: -7px;
  --deck-y: 0px;
  position: absolute;
  left: 50%;
  top: 50%;
  width: clamp(0.72rem, 1.6vh, 0.9rem);
  height: calc(100% - 0.2rem);
  transform: translate(calc(-50% + var(--deck-x)), calc(-50% + var(--deck-y)));
  border: 1px solid rgba(254, 202, 202, 0.82);
  border-radius: var(--long-card-radius);
  background: var(--card-back);
  box-shadow:
    inset 0 0 0 1px rgba(127, 29, 29, 0.42),
    0 1px 2px rgba(var(--ui-page-rgb, 2, 6, 23), 0.45);
}

.deck-layer:nth-child(2) { --deck-x: -5px; --deck-y: 0px; }
.deck-layer:nth-child(3) { --deck-x: -3px; --deck-y: 0px; }
.deck-layer:nth-child(4) { --deck-x: -1px; --deck-y: 0px; }
.deck-layer:nth-child(5) { --deck-x: 1px; --deck-y: 0px; }
.deck-layer:nth-child(6) { --deck-x: 3px; --deck-y: 0px; }
.deck-layer:nth-child(7) { --deck-x: 5px; --deck-y: 0px; }
.deck-layer:nth-child(8) { --deck-x: 7px; --deck-y: 0px; }

.deck-number {
  position: absolute;
  z-index: 2;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  min-width: 1.9rem;
  min-height: 1.45rem;
  padding: 0.08rem 0.22rem;
  border: 1px solid rgba(253, 224, 71, 0.76);
  border-radius: 999px;
  background: rgba(69, 10, 10, 0.92);
  color: #fefce8;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.08rem;
  line-height: 1;
  white-space: nowrap;
}

.deck-number strong {
  font-size: clamp(0.86rem, 2vh, 1.12rem);
  font-variant-numeric: tabular-nums;
}

.deck-number small {
  font-size: max(0.625rem, 10px);
  line-height: 1.15;
  color: var(--ui-gold-text, #fef08a);
}

.center-pointer {
  position: absolute;
  width: 34px;
  height: 34px;
  pointer-events: none;
  z-index: 4;
  display: grid;
  place-items: center;
  filter: drop-shadow(0 0 8px rgba(34, 197, 94, 0.75));
}

.center-pointer::before {
  content: "";
  position: absolute;
  width: 4px;
  height: 16px;
  border-radius: 999px;
  background: rgba(var(--ui-panel-rgb, 34, 197, 94), 0.98);
  top: 14px;
}

.center-pointer-head {
  position: absolute;
  width: 0;
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-bottom: 16px solid #22c55e;
  top: 0;
}

.pointer-up {
  left: 50%;
  top: -16px;
  transform: translateX(-50%) rotate(0deg);
}

.pointer-right {
  right: -16px;
  top: 50%;
  transform: translateY(-50%) rotate(90deg);
}

.pointer-down {
  left: 50%;
  bottom: -16px;
  transform: translateX(-50%) rotate(180deg);
}

.pointer-left {
  left: -16px;
  top: 50%;
  transform: translateY(-50%) rotate(270deg);
}

.empty {
  margin: 0;
  color: var(--ui-muted, #64748b);
  font-size: clamp(0.72rem, 1.25vh, 0.84rem);
}

.self-zone {
  position: relative;
  background: var(--ui-panel, #0b1220);
  border: 1px solid var(--ui-raised, #1e293b);
  border-radius: clamp(0.45rem, 1vh, 0.85rem);
  padding: clamp(0.3rem, 0.9vh, 0.6rem);
  color: var(--ui-text, #e2e8f0);
  display: flex;
  flex-direction: column;
  gap: clamp(0.25rem, 0.8vh, 0.55rem);
  min-height: 0;
  overflow: hidden;
}

.self-zone.active {
  border-color: #22c55e;
  box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.35) inset;
  background: linear-gradient(180deg, rgba(var(--ui-panel-rgb, 8, 26, 19), 0.9), rgba(var(--ui-panel-rgb, 11, 18, 32), 0.95));
}

.self-zone.dealer {
  border-color: rgba(245, 158, 11, 0.95);
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.38) inset, 0 0 24px rgba(245, 158, 11, 0.16);
}

.self-zone.actor-flash {
  isolation: isolate;
}

.self-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.self-head > div:first-child {
  min-width: 0;
  flex: 1 1 auto;
}

.self-info-card .seat-identity {
  width: 100%;
  max-width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  overflow: hidden;
}

.self-info-card .seat-identity h3 {
  width: 100%;
  position: relative;
}

.self-name-measure {
  position: absolute;
  inset: 0 auto auto 0;
  width: max-content;
  visibility: hidden;
  white-space: nowrap;
  pointer-events: none;
}

.self-head h3,
.self-head p {
  margin: 0;
}

.self-turn-timer {
  margin-top: 2px;
}

.self-main {
  display: grid;
  grid-template-columns: minmax(10rem, 34%) minmax(0, 1fr);
  gap: clamp(0.25rem, 0.8vh, 0.55rem);
  min-height: 0;
  flex: 1 1 auto;
}

.self-main.no-open {
  grid-template-columns: minmax(0, 1fr);
}

.self-areas {
  display: grid;
  grid-template-columns: 1fr;
  gap: clamp(0.2rem, 0.7vh, 0.5rem);
  max-height: 100%;
  overflow: auto;
}

.self-hand-panel {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  gap: clamp(0.25rem, 0.7vh, 0.5rem);
}

.self-hand-panel.has-toolbar {
  grid-template-rows: auto minmax(0, 1fr);
}

.hand-viewport {
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  align-items: stretch;
}

.hand-viewport.single-line {
  align-items: center;
  justify-content: center;
}

.hand-viewport > .hand {
  width: 100%;
}

.hand-toolbar {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.45rem;
}

.hand-scroll-tools {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  color: var(--ui-accent-text, #bae6fd);
  font-size: 0.74rem;
  font-weight: 750;
  white-space: nowrap;
}

.hand-scroll-tools button {
  min-width: 3rem;
  height: 2.25rem;
  padding: 0 0.5rem;
  border: 1px solid rgba(var(--ui-accent-rgb, 125, 211, 252), 0.68);
  border-radius: 0.5rem;
  background: var(--ui-raised, #075985);
  color: var(--ui-text, #f0f9ff);
  display: inline-grid;
  place-items: center;
  font-size: 0.86rem;
  font-weight: 900;
  line-height: 1;
}

.hand-scroll-tools button:focus-visible {
  outline: 3px solid #facc15;
  outline-offset: 2px;
}

.hand-scroll-tools button:disabled {
  border-color: var(--ui-ink, #334155);
  background: var(--ui-raised, #1e293b);
  color: var(--ui-muted, #64748b);
  opacity: 0.72;
}

.hand-visible-range {
  min-width: 4.7rem;
  height: 2.25rem;
  padding: 0 0.42rem;
  border: 1px solid rgba(186, 230, 253, 0.5);
  border-radius: 999px;
  background: var(--ui-panel, #0f172a);
  color: var(--ui-gold-text, #fef3c7);
  display: inline-grid;
  place-items: center;
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
}

.self-area {
  background: var(--ui-panel, #111827);
  border: 1px solid var(--ui-raised, #334155);
  border-radius: clamp(0.3rem, 0.8vh, 0.55rem);
  padding: clamp(0.2rem, 0.6vh, 0.4rem);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}

.self-area p {
  margin: 0 0 6px;
  color: var(--ui-muted, #cbd5e1);
  font-size: 12px;
}

.self-area .cards {
  max-height: none;
  overflow: visible;
  padding-right: 2px;
}

.tone-red {
  background: var(--ui-raised, #e53935);
}

.tone-yellow {
  background: var(--ui-raised, #ffd700);
}

.tone-green {
  background: var(--ui-raised, #43a047);
}

.tone-white {
  background: var(--ui-raised, #ffffff);
}

.tone-gold {
  background: var(--ui-raised, #c41e1e);
}

.hand {
  flex: 1 1 auto;
  min-height: 0;
  align-content: flex-start;
  overflow: auto;
  padding-right: 0;
  gap: clamp(2px, 0.3vw, 4px);
}

.hand.can-scroll-forward {
  box-shadow: inset -18px 0 13px -12px rgba(var(--ui-accent-rgb, 125, 211, 252), 0.9);
}

.hand.can-scroll-backward.can-scroll-forward {
  box-shadow:
    inset 18px 0 13px -12px rgba(var(--ui-accent-rgb, 125, 211, 252), 0.9),
    inset -18px 0 13px -12px rgba(var(--ui-accent-rgb, 125, 211, 252), 0.9);
}

.hand.can-scroll-backward:not(.can-scroll-forward) {
  box-shadow: inset 18px 0 13px -12px rgba(var(--ui-accent-rgb, 125, 211, 252), 0.9);
}

.hand-card {
  position: relative;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  border-radius: 10px;
  flex: 0 0 clamp(34px, 3.2vw, 44px);
  width: clamp(34px, 3.2vw, 44px);
  min-width: 0;
  min-height: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.hand-card.deal-concealed {
  visibility: hidden;
  pointer-events: none;
}

@media (hover: hover) and (pointer: fine) {
  .hand-card.playable:hover {
    transform: translateY(-4px);
  }
}

.hand-card.playable:active {
  transform: translateY(-2px) scale(0.97);
}

.hand-card:focus-visible {
  outline: 3px solid var(--ui-accent-text, #e0f2fe);
  outline-offset: 2px;
  z-index: 4;
}

.hand-card.discard-selected {
  z-index: 2;
  transform: translateY(-5px);
  box-shadow: 0 0 0 2px var(--ui-accent, #38bdf8);
}

.hand-card.blocked {
  opacity: 0.72;
  cursor: not-allowed;
}

.hand-card.gold-blocked {
  opacity: 0.78;
}

.hand-card.candidate-active {
  position: relative;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.65);
}

.hand-card.candidate-selected {
  box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.95);
  transform: translateY(-2px);
}

.candidate-selection-badge {
  position: absolute;
  right: 2px;
  top: 2px;
  z-index: 3;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  border: 2px solid var(--ui-gold-text, #fef3c7);
  background: #b45309;
  color: #ffffff;
  font-size: 12px;
  font-weight: 900;
}

.discard-selection-badge {
  position: absolute;
  right: 2px;
  top: 2px;
  z-index: 3;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  border: 2px solid var(--ui-accent-text, #e0f2fe);
  background: #0369a1;
  color: #ffffff;
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
  box-shadow: 0 1px 4px rgba(var(--ui-page-rgb, 2, 6, 23), 0.55);
}

.discard-protected-badge {
  position: absolute;
  right: 2px;
  top: 2px;
  z-index: 3;
  min-width: 18px;
  height: 18px;
  padding: 0 3px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  border: 2px solid var(--ui-gold-text, #fef3c7);
  background: var(--ui-raised, #92400e);
  color: var(--ui-text, #fffbeb);
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
  box-shadow: 0 1px 4px rgba(var(--ui-page-rgb, 2, 6, 23), 0.55);
}

.hand :deep(.size-xl.mode-long) {
  width: clamp(1.3rem, 2vw, 2rem);
  height: clamp(3.5rem, 5.2vw, 5.3rem);
}

.hand :deep(.size-xl.mode-large) {
  width: clamp(2.55rem, 3.7vw, 3.15rem);
  height: clamp(3.2rem, 4.5vw, 3.9rem);
}

.embedded-actions {
  margin: 0;
  background: var(--ui-panel, #0b1220);
  position: relative;
  z-index: 2;
  border: 1px solid var(--ui-raised, #1e293b);
  border-radius: clamp(0.45rem, 1vh, 0.75rem);
  padding: clamp(0.2rem, 0.65vh, 0.45rem);
  overflow: hidden;
  min-height: 0;
}

.action-dock {
  grid-column: 3;
  min-width: 0;
  min-height: 0;
  display: grid;
  align-content: center;
}

.embedded-actions :deep(.panel) {
  background: transparent;
  border-top: none;
  padding: 0;
  gap: clamp(0.2rem, 0.5vh, 0.4rem);
}

.fx-layer {
  position: fixed;
  inset: 0;
  z-index: 36;
  pointer-events: none;
  overflow: hidden;
}

.fx-card {
  position: fixed;
  left: 0;
  top: 0;
  transform: translate(var(--sx), var(--sy));
  animation-name: fly-card;
  animation-duration: var(--dur);
  animation-delay: var(--delay);
  animation-timing-function: cubic-bezier(0.2, 0.75, 0.2, 1);
  animation-fill-mode: forwards;
  filter: drop-shadow(0 8px 14px rgba(var(--ui-page-rgb, 2, 6, 23), 0.36));
}

.fx-card.deal {
  filter: drop-shadow(0 8px 14px rgba(var(--ui-panel-rgb, 15, 23, 42), 0.45));
}


.deal-overlay {
  position: absolute;
  inset: 0;
  z-index: 9;
  display: grid;
  place-items: center;
  pointer-events: none;
  background: radial-gradient(circle at center, rgba(var(--ui-panel-rgb, 15, 23, 42), 0.32), rgba(var(--ui-page-rgb, 2, 6, 23), 0.58));
  color: var(--ui-text, #e2e8f0);
  font-size: clamp(0.95rem, 2.1vh, 1.3rem);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-shadow: 0 0 12px rgba(var(--ui-muted-rgb, 148, 163, 184), 0.55);
}

.dealer-reveal {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: grid;
  place-items: center;
  padding: clamp(0.4rem, 1.2vh, 0.8rem);
  background: radial-gradient(circle at center, rgba(var(--ui-panel-rgb, 120, 53, 15), 0.28), rgba(var(--ui-page-rgb, 2, 6, 23), 0.76) 72%);
  pointer-events: none;
}

.dealer-reveal-panel {
  position: relative;
  isolation: isolate;
  min-width: clamp(9.5rem, 26vw, 15rem);
  min-height: clamp(8rem, 26vh, 11.5rem);
  border: 2px solid rgba(251, 191, 36, 0.92);
  border-radius: clamp(1rem, 2.8vh, 1.6rem);
  background: linear-gradient(160deg, rgba(var(--ui-raised-rgb, 30, 41, 59), 0.98), rgba(var(--ui-panel-rgb, 7, 15, 29), 0.98));
  box-shadow:
    0 0 0 4px rgba(120, 53, 15, 0.34),
    0 0 36px rgba(251, 191, 36, 0.38),
    0 18px 40px rgba(var(--ui-page-rgb, 2, 6, 23), 0.58);
  padding: clamp(0.55rem, 1.4vh, 0.9rem) clamp(0.8rem, 2vw, 1.25rem);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  justify-items: center;
  align-items: center;
  gap: clamp(0.16rem, 0.5vh, 0.34rem);
  animation: dealer-panel-arrive 0.18s ease-out both;
}

.dealer-reveal-panel::before,
.dealer-reveal-panel::after {
  content: "";
  position: absolute;
  z-index: -1;
  left: 50%;
  top: 50%;
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

.dealer-reveal-panel::before {
  width: 72%;
  aspect-ratio: 1;
}

.dealer-reveal-panel::after {
  width: 54%;
  aspect-ratio: 1;
}

.dealer-reveal-label {
  color: var(--ui-gold-text, #fbbf24);
  font-size: clamp(0.82rem, 1.9vh, 1rem);
  font-weight: 900;
  letter-spacing: 0.08em;
  text-shadow: 0 0 12px rgba(251, 191, 36, 0.38);
}

.dealer-reveal-tile {
  min-height: clamp(4.9rem, 14vh, 6.6rem);
  display: grid;
  place-items: center;
  perspective: 500px;
}

.dealer-reveal-back {
  position: relative;
  width: clamp(2.05rem, 5.4vh, 2.8rem);
  height: clamp(4.8rem, 13vh, 6.2rem);
  overflow: hidden;
  border: 2px solid #fecaca;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.18), transparent 30% 70%, rgba(69, 10, 10, 0.24)),
    #dc2626;
  box-shadow:
    inset 0 0 0 3px rgba(127, 29, 29, 0.72),
    0 8px 18px rgba(var(--ui-page-rgb, 2, 6, 23), 0.52),
    0 0 20px rgba(248, 113, 113, 0.24);
}

.dealer-reveal-back span {
  position: absolute;
  left: 50%;
  width: 0.32rem;
  height: 0.32rem;
  border-radius: 50%;
  background: rgba(var(--ui-panel-rgb, 254, 202, 202), 0.82);
  transform: translateX(-50%);
}

.dealer-reveal-back span:nth-child(1) { top: 22%; }
.dealer-reveal-back span:nth-child(2) { top: 39%; }
.dealer-reveal-back span:nth-child(3) { top: 56%; }
.dealer-reveal-back span:nth-child(4) { top: 73%; }

.dealer-reveal-card {
  min-width: clamp(2.8rem, 7vh, 4.2rem);
  min-height: clamp(4.9rem, 14vh, 6.6rem);
  display: grid;
  place-items: center;
  animation: dealer-card-turn 0.18s ease-out both;
}

.dealer-reveal-card :deep(.card) {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.75), 0 10px 22px rgba(var(--ui-page-rgb, 2, 6, 23), 0.52);
}

.dealer-reveal-card-name {
  color: var(--ui-text, #fff7ed);
  font-size: clamp(1rem, 2.4vh, 1.3rem);
  line-height: 1.1;
}

.dealer-reveal-result {
  color: var(--ui-gold-text, #fde68a);
  font-size: clamp(0.86rem, 2vh, 1.05rem);
  font-weight: 850;
}

.deal-fade-enter-active,
.deal-fade-leave-active {
  transition: opacity 0.3s ease;
}

.deal-fade-enter-from,
.deal-fade-leave-to {
  opacity: 0;
}

.dealer-reveal-enter-active,
.dealer-reveal-leave-active {
  transition: opacity 0.22s ease;
}

.dealer-reveal-enter-from,
.dealer-reveal-leave-to {
  opacity: 0;
}

.center.my-turn {
  border-color: rgba(34, 197, 94, 0.7);
  box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.35) inset;
}

@keyframes blink-turn {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

@keyframes dealer-panel-arrive {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

@keyframes dealer-card-turn {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

@keyframes actor-flash {
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@keyframes fly-card {
  0% {
    transform: translate(var(--sx), var(--sy));
    opacity: 0.98;
  }
  75% {
    opacity: 0.98;
  }
  100% {
    transform: translate(var(--ex), var(--ey));
    opacity: 0;
  }
}

@media (min-width: 961px) {
  .table {
    height: 100%;
    max-height: 100%;
    aspect-ratio: auto;
  }

  .hand :deep(.size-xl.mode-long) {
    height: clamp(3rem, 4.3vw, 4.8rem);
  }

  .discard-token.mode-long,
  .mini-card.mode-long {
    width: clamp(1.35rem, 1.75vw, 1.75rem);
    height: clamp(2.75rem, 3.55vw, 3.55rem);
    font-size: clamp(0.78rem, 0.96vw, 1rem);
  }
}

@media (max-width: 1200px) {
  .table {
    grid-template-columns: minmax(0, 24%) minmax(0, 1fr) minmax(0, 24%);
  }
}

@media (orientation: landscape) and (max-height: 600px) {
  .board {
    gap: 0.25rem;
  }

  .table {
    aspect-ratio: auto;
    max-height: none;
    border-radius: 0.65rem;
    padding: 0.25rem;
  }

  .center {
    padding: 0.25rem;
  }

  .center-board {
    gap: 0.18rem;
  }

  .center-seat-action {
    min-width: 2.6rem;
    min-height: 1.7rem;
    font-size: clamp(0.68rem, 1.35vh, 0.84rem);
  }

  .response-wrap {
    min-height: clamp(2.8rem, 8.8vh, 4.6rem);
  }

  .response-wrap small {
    font-size: 11px;
  }

  .self-head h3 {
    font-size: 16px;
  }

  .self-head p {
    font-size: 12px;
  }

  .hand {
    gap: 0.2rem;
  }

  .turn-timer-bar {
    height: 6px;
  }
}

:global(.layout.effective-short-landscape .turn-timer-bar) {
  height: 6px;
}

@media (max-width: 960px), (max-height: 500px) {
  .board {
    grid-template-columns: clamp(6rem, calc(var(--effective-vw, 1vw) * 15), 7.5rem) minmax(0, 1fr) clamp(8.4rem, calc(var(--effective-vw, 1vw) * 21), 10.5rem);
    grid-template-rows: minmax(0, 1fr) var(--compact-board-self-row-height, clamp(6.75rem, calc(var(--effective-vh, 1vh) * 31), 7.5rem));
    gap: calc(var(--effective-vh, 1vh) * 0.4);
  }

  .board.crowded-action-dock {
    grid-template-columns: clamp(6rem, calc(var(--effective-vw, 1vw) * 15), 7.5rem) minmax(0, 1fr) clamp(10.5rem, calc(var(--effective-vw, 1vw) * 21), 12rem);
  }

  .table {
    height: 100%;
    max-height: none;
    aspect-ratio: auto;
    padding: calc(var(--effective-vh, 1vh) * 0.45);
    border-radius: calc(var(--effective-vh, 1vh) * 1.6);
    grid-template-columns: minmax(0, 22%) minmax(0, 1fr) minmax(0, 22%);
    grid-template-rows: minmax(0, 0.8fr) minmax(4.4rem, 1.2fr) minmax(0, 0.8fr);
    grid-template-areas:
      "flowtl top flowtr"
      "left center right"
      "flowbl selfgroups flowbr";
    column-gap: calc(var(--effective-vh, 1vh) * 0.35);
    row-gap: calc(var(--effective-vh, 1vh) * 0.35);
  }

  .corner-card {
    min-width: 3rem;
    min-height: 1.55rem;
    font-size: 0.76rem;
  }

  .group-block-list {
    gap: calc(var(--effective-vh, 1vh) * 0.35);
  }

  .group-block {
    gap: calc(var(--effective-vh, 1vh) * 0.35);
    padding: calc(var(--effective-vh, 1vh) * 0.28) calc(var(--effective-vh, 1vh) * 0.4);
    border-radius: calc(var(--effective-vh, 1vh) * 0.9);
  }

  .group-badge {
    min-width: 1.28rem;
    height: 1.28rem;
    font-size: clamp(0.5rem, calc(var(--effective-vh, 1vh) * 1.15), 0.62rem);
  }

  .mini-card.mode-large {
    width: 1.55rem;
    height: 1.7rem;
    font-size: clamp(0.78rem, calc(var(--effective-vh, 1vh) * 3.4), 0.9rem);
  }

  .discard-token.mode-long,
  .mini-card.mode-long {
    width: 1.2rem;
    height: 2.35rem;
    font-size: 0.72rem;
  }

  .player-card,
  .flow-card,
  .self-groups-card,
  .self-info-card,
  .self-hand-card {
    padding: calc(var(--effective-vh, 1vh) * 0.3) calc(var(--effective-vh, 1vh) * 0.42);
    gap: calc(var(--effective-vh, 1vh) * 0.25);
  }

  .player-top {
    min-height: 0;
  }

  .player-left,
  .player-right {
    overflow-x: hidden;
    overflow-y: auto;
  }

  .player-left .seat-head,
  .player-right .seat-head {
    align-items: stretch;
    flex-direction: column;
    gap: calc(var(--effective-vh, 1vh) * 0.3);
  }

  .player-left .seat-identity,
  .player-right .seat-identity {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: calc(var(--effective-vh, 1vh) * 0.3);
  }

  .player-left .seat-identity > strong,
  .player-right .seat-identity > strong {
    flex: 1 0 100%;
    width: 100%;
  }

  .seat-head strong {
    font-size: clamp(0.92rem, calc(var(--effective-vh, 1vh) * 4), 1.05rem);
  }

  .seat-meta {
    font-size: clamp(0.56rem, calc(var(--effective-vh, 1vh) * 1.35), 0.68rem);
  }

  .tag {
    padding: 0.1rem 0.35rem;
    line-height: 1.1;
    font-size: clamp(0.54rem, calc(var(--effective-vh, 1vh) * 1.25), 0.65rem);
  }

  .flow-card p,
  .self-groups-card p {
    font-size: clamp(0.8125rem, calc(var(--effective-vh, 1vh) * 3.2), 0.85rem);
  }

  .center {
    padding: calc(var(--effective-vh, 1vh) * 0.7) calc(var(--effective-vh, 1vh) * 0.9);
    border-radius: calc(var(--effective-vh, 1vh) * 1.4);
  }

  .center-board {
    grid-template-columns: minmax(0, 1fr) minmax(6.4rem, 1.2fr) minmax(0, 1fr);
    gap: calc(var(--effective-vh, 1vh) * 0.45);
  }

  .center-text p {
    font-size: clamp(0.62rem, calc(var(--effective-vh, 1vh) * 1.4), 0.76rem);
  }

  .center-info-row {
    gap: 0.22rem;
  }

  .info-chip {
    min-height: 1.25rem;
    padding: 0.08rem 0.35rem;
    font-size: clamp(0.5rem, calc(var(--effective-vh, 1vh) * 1.15), 0.64rem);
  }

  .center-seat-name {
    font-size: clamp(0.5rem, calc(var(--effective-vh, 1vh) * 1.1), 0.62rem);
  }

  .center-seat-action {
    min-width: 2.4rem;
    min-height: 1.7rem;
    padding: 0.12rem 0.28rem;
    font-size: max(0.8125rem, 13px);
  }

  .response-wrap {
    min-height: calc(var(--effective-vh, 1vh) * 8.8);
    padding: calc(var(--effective-vh, 1vh) * 0.45);
  }

  .response-wrap small {
    font-size: clamp(0.54rem, calc(var(--effective-vh, 1vh) * 1.28), 0.66rem);
  }

  .self-head {
    align-items: flex-start;
    gap: calc(var(--effective-vh, 1vh) * 0.4);
    flex-wrap: wrap;
  }

  .self-head h3 {
    font-size: clamp(0.96rem, calc(var(--effective-vh, 1vh) * 4.2), 1.1rem);
    line-height: 1.08;
  }

  .self-info-card .seat-identity {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: calc(var(--effective-vh, 1vh) * 0.3);
  }

  .self-info-card .seat-identity > h3 {
    flex: 1 0 100%;
    width: 100%;
  }

  .self-head p {
    font-size: clamp(0.8125rem, calc(var(--effective-vh, 1vh) * 2.8), 0.85rem);
  }

  .self-head .seat-tags {
    width: 100%;
    justify-content: flex-start;
    gap: calc(var(--effective-vh, 1vh) * 0.35);
  }

  .self-info-card {
    grid-column: 1;
    border-radius: calc(var(--effective-vh, 1vh) * 1.4);
    padding: calc(var(--effective-vh, 1vh) * 0.4) calc(var(--effective-vh, 1vh) * 0.55);
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
  }

  .self-groups-card,
  .self-hand-card {
    border-radius: calc(var(--effective-vh, 1vh) * 1.1);
    padding: calc(var(--effective-vh, 1vh) * 0.25) calc(var(--effective-vh, 1vh) * 0.4);
  }

  .self-hand-card {
    grid-column: 2;
  }

  .hand-scroll-tools {
    gap: 0.2rem;
  }

  .hand-scroll-tools button {
    min-width: 44px;
    height: 36px;
    padding: 0 0.34rem;
    border-radius: calc(var(--effective-vh, 1vh) * 0.8);
    font-size: max(0.8125rem, 13px);
  }

  .hand-visible-range {
    min-width: 4.25rem;
    height: 36px;
    padding: 0 0.28rem;
    font-size: max(0.8125rem, 13px);
  }

  .discard-token.mode-large {
    width: 1.55rem;
    height: 1.65rem;
    font-size: clamp(0.76rem, calc(var(--effective-vh, 1vh) * 3.2), 0.88rem);
  }

  .hand {
    overflow-x: auto;
    overflow-y: hidden;
    display: flex;
    flex-wrap: nowrap;
    gap: 2px;
    min-height: 0;
    align-items: center;
    align-content: center;
    padding: 0.08rem 0.08rem 0.25rem;
    overscroll-behavior-inline: contain;
    touch-action: pan-x;
    scrollbar-width: thin;
  }

  .hand-viewport:not(.single-line) {
    min-height: 58px;
  }

  .hand-card.mode-long {
    border-radius: calc(var(--effective-vh, 1vh) * 0.7);
    flex-basis: clamp(28px, calc(var(--effective-vw, 1vw) * 4.5), 32px);
    width: clamp(28px, calc(var(--effective-vw, 1vw) * 4.5), 32px);
  }

  .hand-card.mode-large {
    border-radius: calc(var(--effective-vh, 1vh) * 0.7);
    flex-basis: clamp(40px, calc(var(--effective-vw, 1vw) * 6.2), 44px);
    width: clamp(40px, calc(var(--effective-vw, 1vw) * 6.2), 44px);
  }

  .hand-card {
    min-height: 0;
  }

  .hand :deep(.size-xl.mode-long) {
    width: clamp(0.9rem, calc(var(--effective-vw, 1vw) * 2.2), 1.3rem);
    height: clamp(2.7rem, calc(var(--effective-vh, 1vh) * 6.6), 3.8rem);
    font-size: clamp(0.62rem, calc(var(--effective-vh, 1vh) * 1.55), 0.82rem);
  }

  .cards.hand:not(.single-line) :deep(.size-xl.mode-long) {
    width: clamp(28px, calc(var(--effective-vw, 1vw) * 4.5), 32px);
    height: clamp(52px, calc(var(--effective-vh, 1vh) * 14), 60px);
    font-size: clamp(16px, calc(var(--effective-vh, 1vh) * 4.4), 20px);
  }

  .hand :deep(.size-xl.mode-large) {
    width: clamp(40px, calc(var(--effective-vw, 1vw) * 6.2), 44px);
    height: clamp(52px, calc(var(--effective-vh, 1vh) * 14), 60px);
    font-size: clamp(22px, calc(var(--effective-vh, 1vh) * 5.8), 1.55rem);
  }

  .embedded-actions {
    background: var(--ui-panel, #0b1220);
    border: 1px solid var(--ui-raised, #1e293b);
    border-radius: calc(var(--effective-vh, 1vh) * 1.1);
    padding: calc(var(--effective-vh, 1vh) * 0.35);
  }

  .embedded-actions :deep(.action-row) {
    width: 100%;
    gap: calc(var(--effective-vh, 1vh) * 0.45);
  }

  .embedded-actions :deep(.btn) {
    width: auto;
    flex: 1 1 0;
    min-width: clamp(40px, calc(var(--effective-vw, 1vw) * 7), 48px);
    min-height: clamp(40px, calc(var(--effective-vh, 1vh) * 11.5), 46px);
    padding-inline: clamp(0.2rem, calc(var(--effective-vw, 1vw) * 0.8), 0.45rem);
    font-size: clamp(0.96rem, calc(var(--effective-vh, 1vh) * 4), 1.08rem);
    border-radius: calc(var(--effective-vh, 1vh) * 0.85);
  }

  .embedded-actions :deep(.btn:disabled) {
    opacity: 0.58;
  }

}

@media (max-width: 720px), (max-height: 380px) {
  .seat-meta,
  .tag.status:not(.temporary-control) {
    display: none;
  }

  .tag.status.temporary-control {
    display: inline-flex;
    border-color: rgba(251, 113, 133, 0.82);
    background: rgba(var(--ui-panel-rgb, 127, 29, 29), 0.78);
    color: var(--ui-text, #fff1f2);
    font-weight: 800;
  }

  .seat-tags {
    gap: 0.2rem;
  }

  .self-info-card {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .self-head p {
    line-height: 1.15;
  }

  .discard-empty {
    display: none;
  }

  .deck-number strong {
    font-size: 0.95rem;
  }

  .dealer-card-mark :deep(.card) {
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dealer-reveal,
  .dealer-reveal-panel,
  .dealer-reveal-back,
  .dealer-reveal-card {
    animation: none !important;
    transition-duration: 0.01ms !important;
  }
}

@media (max-width: 620px) and (max-height: 360px),
  (max-width: 360px) and (max-height: 620px) {
  .board {
    grid-template-columns: clamp(5.4rem, 15vw, 6rem) minmax(0, 1fr) clamp(8.25rem, 23vw, 9rem);
    gap: 2px;
  }

  .board.crowded-action-dock {
    grid-template-columns: clamp(5.4rem, 15vw, 6rem) minmax(0, 1fr) clamp(10.5rem, 30vw, 11rem);
  }
}

@supports (-webkit-touch-callout: none) {
  @media (max-width: 960px), (max-height: 500px) {
    .hand {
      -webkit-overflow-scrolling: touch;
    }
  }
}

/* 下方两行尺寸恒定：上行整段是动态操作区，下行整段是手牌，按钮切换不会推挤手牌。 */
.board,
.board.board-declaring,
.board.crowded-action-dock {
  position: relative;
  height: auto;
  align-self: stretch;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) clamp(3rem, 8vh, 3.5rem) clamp(7rem, 21vh, 10rem);
  gap: 2px;
}

.table {
  grid-column: 1;
  grid-row: 1;
}

.self-command-row {
  position: relative;
  grid-column: 1;
  grid-row: 2;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: clamp(15rem, 34%, 18rem) minmax(0, 1fr);
  align-items: stretch;
  overflow: visible;
  border: 1px solid var(--ui-raised, #1e293b);
  border-radius: 0.62rem;
  background: rgba(var(--ui-panel-rgb, 11, 18, 32), 0.94);
  color: var(--ui-text, #e2e8f0);
}

.self-command-row.dealer {
  border-color: rgba(245, 158, 11, 0.92);
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.28) inset;
}

.self-command-row.actor-flash {
  isolation: isolate;
}

.self-command-row.actor-flash::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  border: 3px solid rgba(var(--ui-accent-rgb, 56, 189, 248), 0.86);
  border-radius: inherit;
  animation: actor-flash 0.72s ease-out both;
}

.self-info-card {
  min-width: 0;
  display: flex;
  align-items: center;
  padding: 0.2rem 0.42rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  overflow: hidden;
}

.self-info-card .self-head,
.self-info-card .seat-identity {
  width: 100%;
}

.self-info-card .seat-identity {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
}

.self-info-card .seat-identity > h3 {
  display: block;
  flex: 1 1 auto;
  width: auto;
}

.dynamic-action-track {
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.35rem;
  border-left: 1px solid rgba(var(--ui-border-rgb, 51, 65, 85), 0.86);
  overflow-x: auto;
  overflow-y: visible;
  scrollbar-width: none;
}

.dynamic-action-track::-webkit-scrollbar {
  display: none;
}

.dynamic-action-track > :deep(.declare-mask),
.action-dock {
  flex: 1 1 auto;
  min-width: 0;
}

.embedded-actions,
.action-dock {
  margin: 0;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  overflow: visible;
}

.embedded-actions :deep(.panel) {
  padding: 0;
  border: 0;
  background: transparent;
}

.embedded-actions :deep(.action-row) {
  width: 100%;
  display: flex;
  flex-wrap: nowrap;
  justify-content: flex-end;
  gap: 0.3rem;
}

.embedded-actions :deep(.btn) {
  flex: 1 1 0;
  min-width: 2.65rem;
  min-height: 40px;
  padding: 0.2rem 0.55rem;
}

.fixed-clock {
  position: sticky;
  right: 0;
  z-index: 3;
  flex: 0 0 auto;
  min-width: 3.6rem;
  min-height: 2.1rem;
  padding: 0.22rem 0.42rem;
  border: 1px solid rgba(245, 158, 11, 0.48);
  border-radius: 0.48rem;
  background: rgba(var(--ui-panel-rgb, 15, 23, 42), 0.96);
  color: var(--ui-gold-text, #fcd34d);
  display: inline-grid;
  place-items: center;
  text-align: center;
  font-size: max(0.75rem, 12px);
  font-weight: 850;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.fixed-clock.urgent {
  border-color: #fb7185;
  background: var(--ui-raised, #9f1239);
  color: var(--ui-text, #fff1f2);
}

.self-hand-card {
  position: relative;
  grid-column: 1;
  grid-row: 3;
  min-width: 0;
  min-height: 0;
  display: block;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  overflow: visible;
}

.self-hand-card > .self-hand-panel {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: clamp(0.2rem, 0.65vh, 0.42rem);
  border: 1px solid var(--ui-raised, #1e293b);
  border-radius: 0.65rem;
  background: rgba(var(--ui-panel-rgb, 11, 18, 32), 0.94);
  overflow: hidden;
}

.self-turn-outline {
  grid-column: 1;
  grid-row: 2 / 4;
  z-index: 11;
  min-width: 0;
  min-height: 0;
  border: 2px solid #22c55e;
  border-radius: 0.7rem;
  box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.3) inset, 0 0 14px rgba(34, 197, 94, 0.18);
  pointer-events: none;
}

.self-flow-toast {
  grid-column: 1;
  grid-row: 2;
  z-index: 13;
  align-self: start;
  justify-self: center;
  transform: translateY(calc(-100% - 0.25rem));
  width: max-content;
  max-width: min(22rem, calc(100% - 1rem));
  padding: 0.36rem 0.68rem;
  border: 1px solid rgba(203, 213, 225, 0.9);
  border-radius: 0.7rem;
  background: rgba(var(--ui-panel-rgb, 248, 250, 252), 0.98);
  color: var(--ui-text, #0f172a);
  box-shadow: 0 8px 22px rgba(var(--ui-page-rgb, 2, 6, 23), 0.46);
  font-size: max(0.8125rem, 13px);
  font-weight: 800;
  line-height: 1.25;
  text-align: center;
  pointer-events: none;
}

.quick-phrase-enter-active,
.quick-phrase-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.self-flow-toast.quick-phrase-enter-from,
.self-flow-toast.quick-phrase-leave-to {
  opacity: 0;
  transform: translateY(calc(-100% + 0.15rem)) scale(0.96);
}

.quick-phrase-toast.quick-phrase-enter-from,
.quick-phrase-toast.quick-phrase-leave-to {
  opacity: 0;
  transform: translate(-50%, calc(-50% - clamp(2.7rem, 9vh, 4.5rem))) scale(0.96);
}

.table-notice-toast.quick-phrase-enter-from,
.table-notice-toast.quick-phrase-leave-to {
  opacity: 0;
  transform: translate(-50%, 0.35rem) scale(0.96);
}

.cards.hand.single-line {
  flex: 0 0 auto;
  flex-wrap: nowrap;
  justify-content: center;
  width: max-content;
  min-height: 0;
  overflow: visible;
  transform: scale(var(--hand-scale, 1));
  transform-origin: center center;
}

.cards.hand.single-line .hand-card {
  flex: 0 0 auto;
  width: max-content;
}

.hand-mark {
  position: absolute;
  top: -14px;
  left: 0;
  z-index: 2;
  padding: 1px 3px;
  border-radius: 3px;
  background: var(--mark-background, #175c50);
  color: var(--mark-text, #fff);
  font-size: 11px;
}

.listening-mark {
  background: #047857;
}

.selected-card-preview {
  position: absolute;
  right: clamp(0.3rem, 2vw, 1rem);
  bottom: calc(100% + 0.25rem);
  z-index: 14;
  max-width: min(70vw, 28rem);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border: 1px solid #34d399;
  border-radius: 6px;
  background: var(--ui-panel, #0f172a);
  pointer-events: none;
}

.selected-preview-wait-label {
  color: var(--ui-accent-text, #a7f3d0);
  font-size: 12px;
  font-weight: 800;
}

.selected-preview-waits {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 3px;
}

.selected-preview-wait,
.current-listening-card {
  position: relative;
  flex: 0 0 auto;
  display: inline-flex;
}

.selected-preview-wait.exhausted :deep(.card),
.current-listening-card.exhausted :deep(.card) {
  filter: grayscale(1);
  opacity: 0.48;
}

.wait-count-badge {
  position: absolute;
  right: -2px;
  top: -4px;
  z-index: 2;
  min-width: 22px;
  padding: 0 3px;
  border-radius: 999px;
  background: #065f46;
  color: #ecfdf5;
  box-shadow: 0 0 0 1px var(--ui-panel, #0f172a);
  font-size: 9px;
  line-height: 14px;
  font-weight: 800;
  text-align: center;
  white-space: nowrap;
}

.selected-preview-wait.exhausted .wait-count-badge,
.current-listening-card.exhausted .wait-count-badge {
  background: #475569;
  color: var(--ui-text, #e2e8f0);
}

.current-listening-waits {
  min-width: 0;
  max-width: min(42vw, 24rem);
  display: flex;
  align-items: center;
  gap: 0.22rem;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.current-listening-waits::-webkit-scrollbar {
  display: none;
}

.dynamic-action-track > .current-listening-waits {
  flex: 1 1 auto;
  max-width: none;
}

.current-listening-label {
  flex: 0 0 auto;
  color: var(--ui-accent-text, #a7f3d0);
  font-weight: 900;
}

.current-listening-card :deep(.card) {
  width: 1.35rem;
  height: 2.2rem;
  font-size: 0.78rem;
}

.listening-toggle {
  position: absolute;
  right: 0.3rem;
  top: 0.3rem;
  z-index: 10;
  min-width: 2rem;
  min-height: 2rem;
  padding: 0.15rem 0.42rem;
  border: 1px solid rgba(52, 211, 153, 0.78);
  border-radius: 0.48rem;
  background: rgba(var(--ui-panel-rgb, 6, 78, 59), 0.94);
  color: var(--ui-text, #ecfdf5);
  font-weight: 900;
}

.listening-popover {
  position: absolute;
  right: 0.3rem;
  bottom: calc(100% + 0.28rem);
  z-index: 15;
  width: max-content;
  max-width: min(24rem, calc(100vw - 1rem));
  min-height: 2.8rem;
  padding: 0.42rem 0.55rem;
  border: 1px solid rgba(52, 211, 153, 0.72);
  border-radius: 0.65rem;
  background: rgba(var(--ui-panel-rgb, 15, 23, 42), 0.98);
  box-shadow: 0 10px 24px rgba(var(--ui-page-rgb, 2, 6, 23), 0.52);
}

.seat-identity {
  flex-wrap: wrap;
}

.seat-identity > strong,
.seat-identity > h3 {
  flex: 1 1 4.5rem;
}

.seat-identity-meta {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  white-space: nowrap;
}

.player-left .seat-identity,
.player-right .seat-identity {
  flex-wrap: wrap;
  align-content: flex-start;
}

.player-left .seat-identity > strong,
.player-right .seat-identity > strong {
  flex: 1 1 4.5rem;
  width: auto;
}

.group-score-badge,
.kan-count-badge {
  flex: 0 0 auto;
  min-height: 1.55rem;
  padding: 0.12rem 0.3rem;
  border-radius: 0.45rem;
  display: inline-grid;
  place-items: center;
  font-size: clamp(0.72rem, 1.65vh, 0.9rem);
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
}

.group-score-badge {
  border: 1px solid #475569;
  color: var(--ui-muted, #94a3b8);
  background: rgba(var(--ui-panel-rgb, 15, 23, 42), 0.78);
}

.group-score-badge.positive {
  color: var(--ui-gold-text, #fde68a);
  border-color: rgba(245, 158, 11, 0.62);
  background: rgba(var(--ui-panel-rgb, 120, 53, 15), 0.34);
}

.kan-count-badge {
  border: 1px solid rgba(167, 139, 250, 0.58);
  color: var(--ui-text, #ddd6fe);
  background: rgba(var(--ui-panel-rgb, 76, 29, 149), 0.26);
}

.quick-phrase-toast {
  position: absolute;
  z-index: 12;
  left: 50%;
  top: 50%;
  transform: translate(-50%, calc(-50% - clamp(3.2rem, 10vh, 5rem)));
  width: max-content;
  max-width: min(18rem, calc(100% - 1rem));
  padding: 0.38rem 0.62rem;
  border: 1px solid rgba(var(--ui-accent-rgb, 125, 211, 252), 0.78);
  border-radius: 0.78rem;
  background: rgba(var(--ui-panel-rgb, 248, 250, 252), 0.98);
  color: var(--ui-text, #0f172a);
  box-shadow: 0 8px 22px rgba(var(--ui-page-rgb, 2, 6, 23), 0.48);
  display: flex;
  align-items: baseline;
  gap: 0.42rem;
  font-size: max(0.8125rem, 13px);
  font-weight: 800;
  line-height: 1.25;
  pointer-events: none;
}

.quick-phrase-toast strong {
  flex: 0 0 auto;
  color: var(--ui-accent-text, #0369a1);
}

.quick-phrase-toast span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-notice-toast {
  position: absolute;
  z-index: 13;
  left: 50%;
  bottom: clamp(0.55rem, 2vh, 1rem);
  transform: translateX(-50%);
  width: max-content;
  max-width: min(26rem, calc(100% - 1rem));
  padding: 0.42rem 0.72rem;
  border: 1px solid rgba(203, 213, 225, 0.9);
  border-radius: 0.72rem;
  background: rgba(var(--ui-panel-rgb, 248, 250, 252), 0.98);
  color: var(--ui-text, #0f172a);
  box-shadow: 0 8px 22px rgba(var(--ui-page-rgb, 2, 6, 23), 0.46);
  font-size: max(0.8125rem, 13px);
  font-weight: 800;
  line-height: 1.3;
  text-align: center;
  pointer-events: none;
}

.center-card-pair {
  gap: clamp(0.8rem, 1.8vw, 1.25rem);
}

.turn-countdown,
.self-turn-timer {
  display: none;
}

@media (max-width: 960px), (max-height: 500px) {
  .board,
  .board.board-declaring,
  .board.crowded-action-dock {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) 3rem clamp(5.8rem, calc(var(--effective-vh, 1vh) * 23), 7.2rem);
  }

  .self-command-row {
    grid-template-columns: clamp(12rem, 36%, 16rem) minmax(0, 1fr);
  }

  .self-info-card .seat-identity-meta {
    width: auto;
    justify-content: flex-start;
  }

  .seat-identity-meta {
    gap: 0.12rem;
  }

  .hand-count-badge,
  .kan-count-badge,
  .group-score-badge {
    min-height: 1.3rem;
    padding: 0.08rem 0.22rem;
    border-radius: 0.35rem;
    font-size: max(0.75rem, 13px);
  }

  :deep(.player-status-icon) {
    width: 1.3rem;
    height: 1.3rem;
    flex-basis: 1.3rem;
    border-radius: 0.35rem;
  }

  :deep(.player-status-icon svg) {
    width: 0.9rem;
    height: 0.9rem;
  }

  .table {
    grid-template-columns: minmax(0, 28%) minmax(0, 1fr) minmax(0, 28%);
  }

  .dynamic-action-track {
    gap: 0.25rem;
    padding-inline: 0.25rem;
  }

  .embedded-actions :deep(.btn) {
    min-width: 2.5rem;
    min-height: 40px;
  }
}

/* Layout owns geometry only. Theme materials are inherited from appearance.css. */
.board[data-table-layout="classic"] .table {
  grid-template-columns: minmax(0, 24%) minmax(0, 14%) minmax(0, 24%) minmax(0, 14%) minmax(0, 24%);
  grid-template-areas:
    "flowtl flowtl top flowtr flowtr"
    "left center center center right"
    "flowbl selfgroups selfgroups selfgroups flowbr";
  grid-template-rows: minmax(0, .9fr) minmax(4.4rem, 1.1fr) minmax(0, .8fr);
  column-gap: 0;
  padding: clamp(.35rem, 1.2vh, .8rem);
  border-radius: clamp(.8rem, 3vh, 2rem);
}
.board[data-table-layout="classic"] :is(.player-left, .player-right) {
  align-self: center; height: auto; max-height: 100%; min-height: 0; margin-inline: .15rem; width: calc(100% - .3rem);
}
.board[data-table-layout="classic"] .player-top { min-height: 0; height: fit-content; max-height: 100%; align-self: start; }
.board[data-table-layout="classic"] .center { margin-inline: .3rem; width: calc(100% - .6rem); }
.board[data-table-layout="classic"] .flow-card { align-self: center; max-height: 100%; }
.board[data-table-layout="classic"] .player-card .seat-identity-meta { flex-wrap: wrap; }
.board[data-table-layout="classic"] :is(.flow-top-left, .flow-top-right) { margin-inline: .25rem; }
@media (max-width: 960px), (max-height: 500px) {
  .board[data-table-layout="classic"] .table {
    padding: 2px; border-radius: .8rem; row-gap: 1px;
  }
  .board[data-table-layout="classic"] :is(.flow-top-left, .flow-top-right) { margin-inline: 1px; padding: 1px; }
}

.listening-details { grid-row: 1; grid-column: 1; align-self: end; justify-self: end; position: relative; z-index: 20; width: min(32%, 24rem); max-height: min(100%, 7rem); min-height: 0; box-sizing: border-box; margin: .25rem; padding: .3rem; border: 1px solid var(--ui-border, #64748b); border-radius: .6rem; background: var(--ui-panel, #0f172a); color: var(--ui-text, #f8fafc); display: flex; flex-direction: column; box-shadow: 0 3px 12px #0003; }
.listening-details header { display: flex; align-items: center; justify-content: space-between; gap: .25rem; font-size: 13px; }
.listening-details header button { background: transparent; border: 0; color: inherit; min-width: 28px; min-height: 28px; }
.listening-details-cards { display: flex; flex-wrap: wrap; gap: .5rem .3rem; padding: .45rem .15rem .15rem; overflow: auto; min-height: 0; max-height: 5.3rem; }
.listening-details .current-listening-card :deep(.card) { width: 1.6rem; height: 2.2rem; font-size: .85rem; }

/* A single physical table, with cards placed directly on the felt. */
.board[data-table-layout="classic"] { isolation: isolate; padding: clamp(4px, 1.2vw, 16px); gap: 3px; }
.board[data-table-layout="classic"]::before { content: ""; position: absolute; inset: 0; z-index: -1; border: clamp(4px, 1vw, 13px) solid var(--table-wood, #63503b); border-radius: clamp(18px, 4vw, 56px); background: radial-gradient(ellipse at 50% 30%, #ffffff0d, transparent 70%), var(--table-felt, #24384a); box-shadow: inset 0 0 0 2px #0003, inset 0 8px 20px #0002, 0 6px 18px #0003; }
.board[data-table-layout="classic"]::after { content: ""; position: absolute; inset: 5px; z-index: -1; border-radius: inherit; pointer-events: none; border-bottom: 2px solid #ffffff30; }
.board[data-table-layout="classic"] .table { border: 0; border-radius: 0; overflow: hidden; padding: 2px; grid-template-rows: minmax(34px, 1fr) minmax(40px, 1fr) minmax(34px, 1fr); }
.board[data-table-layout="classic"] :is(.player-card, .flow-card, .self-groups-card, .center, .center-board, .self-hand-card, .self-hand-panel, .group-block, .group-block-list, .seat-head) { background: transparent; border: 0; box-shadow: none; border-radius: 0; }
.board[data-table-layout="classic"] :is(.player-card, .self-groups-card) { padding: 3px; height: auto; min-height: 0; align-self: center; }
.board[data-table-layout="classic"] .player-top { align-self: start; justify-self: center; width: max-content; max-width: 100%; }
.board[data-table-layout="classic"] .flow-card { padding: 2px; }
.board[data-table-layout="classic"] .flow-card > p { display: none; }
.board[data-table-layout="classic"] .flow-empty { visibility: hidden; }
.board[data-table-layout="classic"] .seat-identity { gap: 3px; }
.board[data-table-layout="classic"] .seat-identity-meta { gap: 2px; }
.board[data-table-layout="classic"] :is(.hand-count-badge, .kan-count-badge, .group-score-badge) { border: 0; background: transparent; padding: 0 2px; min-height: 0; }
.board[data-table-layout="classic"] .player-card.active { box-shadow: none; }
.board[data-table-layout="classic"] .player-card.active .seat-head { text-decoration: underline; text-decoration-color: var(--ui-accent); text-underline-offset: 4px; }
.board[data-table-layout="classic"] .self-command-row { background: transparent; border: 0; border-radius: 0; box-shadow: none; }
.board[data-table-layout="classic"] .dynamic-action-track { border: 0; }
.board[data-table-layout="classic"] .self-hand-card { box-shadow: inset 0 2px #0002; }
.board[data-table-layout="classic"] .self-turn-outline { border: 0; box-shadow: none; }
.opponent-card-stack { display: flex; position: relative; width: 3.2rem; height: 2.8rem; margin: 0 auto .25rem; }
.opponent-card-stack :deep(.card-back) { position: absolute; left: calc(var(--stack-index) * 7px); width: 1.4rem; height: 2.1rem; transform: rotate(calc((var(--stack-index) - 1.5) * 3deg)); box-shadow: 0 2px 3px #0004; }
.opponent-card-stack.mode-long :deep(.card-back) { width: .85rem; height: 2.6rem; }
@media (max-width: 960px), (max-height: 500px) {
  .board[data-table-layout="classic"] { padding: 4px; }
  .board[data-table-layout="classic"] .opponent-card-stack { height: 1.65rem; width: 2.7rem; margin-bottom: 1px; }
  .board[data-table-layout="classic"] .opponent-card-stack :deep(.card-back) { height: 1.5rem; width: 1rem; }
  .board[data-table-layout="classic"] .opponent-card-stack.mode-long :deep(.card-back) { height: 1.65rem; width: .65rem; }
  .board[data-table-layout="classic"] .seat-identity-meta :is(.kan-count-badge, .group-score-badge) { font-size: 11px; }
}

.board[data-table-layout="classic"] :is(.player-left, .player-right) .group-block-list { justify-content: center; }
.board[data-table-layout="classic"] .seat-identity { justify-content: center; text-align: center; }
.board[data-table-layout="classic"] .seat-identity > strong { flex: 1 0 100%; }
.board[data-table-layout="classic"] .seat-identity-meta { justify-content: center; flex-wrap: wrap; }

/* Stable controls share one rail; the clock never participates in scrolling. */
.board .self-command-row { border: 0; grid-template-columns: 56px minmax(110px, 25%) minmax(0, 1fr); }
.clock-slot { grid-column: 1; grid-row: 1; display: grid; place-items: center; min-width: 0; }
.board .fixed-clock { position: static; min-width: 0; width: 52px; padding-inline: 1px; }
.board .embedded-actions { padding: 0; }
.board .embedded-actions :deep(.btn) { flex: 0 1 96px; min-width: 44px; max-width: 96px; min-height: 44px; }
.board .embedded-actions :deep(.action-row) { flex-wrap: wrap; }
.board .dynamic-action-track { grid-column: 3; grid-row: 1; overflow: visible; min-width: 0; }
.board .self-info-card { grid-column: 2; grid-row: 1; min-width: 0; padding-block: 0; }
.board .self-info-card .seat-identity { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: 20px 22px; gap: 0 3px; }
.board .self-info-card .seat-identity > h3 { grid-column: 1; grid-row: 1; margin: 0; line-height: 1.1; }
.board .self-info-card .seat-identity-meta { grid-column: 1; grid-row: 2; flex-wrap: nowrap; }
.board .self-info-card .dealer-seat-lockup { grid-column: 2; grid-row: 1 / 3; height: 42px; }
.board .self-info-card .dealer-card-mark :deep(.card) { width: 16px; height: 24px; font-size: 12px; }
.board .self-info-card .dealer-badge { width: 19px; height: 19px; min-width: 19px; min-height: 19px; }
.board .self-head { gap: 1px; padding-block: 0; }
.board .self-hand-panel { padding-block: 1px; }
.board[data-table-layout="classic"] .player-top .seat-identity { flex-wrap: wrap; gap: 2px 5px; }
.board[data-table-layout="classic"] .player-top .seat-identity > strong { flex: 0 1 auto; min-width: 0; }
.board[data-table-layout="classic"] .player-top .seat-identity-meta { flex-wrap: nowrap; }
.board[data-table-layout="classic"] .flow-top-left { justify-self: start; margin-left: 0; }
.board[data-table-layout="classic"] .flow-top-right { justify-self: end; margin-right: 0; }
.declaration-guidance-anchor { grid-area: center; align-self: start; justify-self: center; z-index: 21; width: min(100%, 25rem); pointer-events: none; }
.board.dealer-ceremony-active { grid-template-rows: minmax(0, 1fr) 0 0; gap: 0; }
.board.dealer-ceremony-active > .self-hand-card { visibility: hidden; min-height: 0; padding: 0; border: 0; overflow: hidden; }
@media (max-width: 960px), (max-height: 500px) {
  .board:not(.dealer-ceremony-active) { grid-template-rows: minmax(0, 1fr) 44px 76px; gap: 2px; }
  .board.crowded-action-dock:not(.dealer-ceremony-active) { grid-template-rows: minmax(0, 1fr) minmax(44px, auto) 76px; }
  .board .self-command-row { border: 0; grid-template-columns: 56px minmax(100px, 25%) minmax(0, 1fr); }
  .board .dynamic-action-track { padding-block: 0; }
  .board .self-info-card .group-score-badge { display: none; }
}

/* Content density uses the effective (possibly rotated) viewport. */
.board[data-table-layout="classic"] { padding: clamp(7px, 1.2vw, 18px); }
.board[data-table-layout="classic"] .table { padding: 8px clamp(12px, calc(2 * var(--effective-vw, 1vw)), 26px); row-gap: 2px; }
.board[data-table-layout="classic"] .flow-card { width: 100%; height: 100%; min-width: 0; margin: 0; padding: 0; align-self: stretch; }
.board[data-table-layout="classic"] :is(.flow-top-left, .flow-top-right) { padding-top: 2px; }
.board[data-table-layout="classic"] :is(.flow-top-right, .flow-bottom-right) .discard-strip { justify-content: flex-end; }
.board[data-table-layout="classic"] :is(.flow-bottom-left, .flow-bottom-right) .discard-strip { align-content: safe flex-end; }
.board[data-table-layout="classic"] :is(.flow-bottom-left, .flow-bottom-right) .discard-strip[data-scroll-after="true"],
.board[data-table-layout="classic"] :is(.flow-bottom-left, .flow-bottom-right) .discard-strip[data-scroll-before="true"] { align-content: flex-start; }
.board[data-table-layout="classic"] .self-groups-card { width: 100%; max-height: 100%; align-self: end; padding: 4px; }
.board[data-table-layout="classic"] .self-groups-card .group-block-list { justify-content: center; }
.self-groups-card .mini-card-strip { flex-wrap: nowrap; gap: 2px; }
.self-groups-card .mini-card-strip.mode-long { gap: 0; }
.self-groups-card .group-block { flex-shrink: 0; }
.board[data-table-layout] .kan-count-badge, .board .group-badge { color: var(--mark-text); background: var(--mark-background); border: 0; }
.board[data-table-layout] .kan-count-badge { padding: 1px 4px; border-radius: 4px; }
.board .hand-mark { font-size: 11px; line-height: 12px; font-weight: 800; }
.board .listening-mark { background: #175c50; color: #fff; }

/* Scroll real card boxes; transforms leave unusable overflow and hit targets. */
.board .cards.hand { --hand-width: 36px; --hand-height: 66px; --hand-font: 20px; gap: 2px; padding: 16px 4px 6px; flex-wrap: nowrap; align-items: center; align-content: center; overflow-x: auto; overflow-y: hidden; touch-action: pan-x; }
.board .cards.hand:has(.mode-large) { --hand-width: 48px; --hand-font: 24px; }
.board .cards.hand.single-line { flex: 1 1 auto; width: 100%; transform: none; justify-content: flex-start; }
.board .hand .hand-card { box-sizing: border-box; flex: 0 0 auto; width: calc(var(--hand-width) * var(--hand-scale, 1)); height: calc(var(--hand-height) * var(--hand-scale, 1)); min-width: 28px; min-height: 44px; }
.board .hand.single-line .hand-card { width: calc(var(--hand-width) * var(--hand-scale, 1)); min-width: 0; min-height: 0; }
.board .hand .hand-card:first-child { margin-inline-start: auto; }
.board .hand .hand-card:last-child { margin-inline-end: auto; }
.board .hand .hand-card :deep(.card) { box-sizing: border-box; width: 100%; height: 100%; font-size: calc(var(--hand-font) * var(--hand-scale, 1)); }
.board .hand-viewport { min-height: 0; }
.board .self-hand-panel { gap: 0; }
.board .hand-toolbar { min-height: 20px; }
.board .hand-scroll-tools { gap: 4px; }
.board .hand-scroll-tools button { height: 24px; min-height: 24px; padding: 0 8px; }
.board .hand-visible-range { font-size: 11px; }
.board .flow-card { overflow: hidden; }
.board .discard-strip { min-height: 0; flex: 1 1 auto; gap: 2px; padding: 4px; overflow-x: hidden; overflow-y: auto; align-content: flex-start; overscroll-behavior: contain; }
.board .discard-token { box-sizing: border-box; font-size: calc(12px * var(--flow-scale, 1)); }
.board .discard-token.mode-long { width: calc(24px * var(--flow-scale, 1)); height: calc(32px * var(--flow-scale, 1)); }
.board .discard-token.mode-large { width: calc(30px * var(--flow-scale, 1)); height: calc(30px * var(--flow-scale, 1)); }
.board :is(.discard-strip, .hand, .self-groups-card, .player-card) { scrollbar-width: thin; scrollbar-color: var(--ui-border) transparent; }
.board :is(.discard-strip, .hand, .self-groups-card, .player-card)::-webkit-scrollbar { width: 4px; height: 4px; }
.board :is(.discard-strip, .hand, .self-groups-card, .player-card)::-webkit-scrollbar-thumb { background: var(--ui-border); border-radius: 8px; }
.board .discard-strip[data-scroll-after="true"] { mask-image: linear-gradient(to bottom, #000 calc(100% - 9px), transparent); }
.board .discard-strip[data-scroll-before="true"] { mask-image: linear-gradient(to bottom, transparent, #000 9px); }
.board .discard-strip[data-scroll-before="true"][data-scroll-after="true"] { mask-image: linear-gradient(to bottom, transparent, #000 9px, #000 calc(100% - 9px), transparent); }
@media (max-width: 960px), (max-height: 500px) {
  .board[data-table-layout="classic"] { padding: 6px; }
  .board .cards.hand { --hand-width: 32px; --hand-height: 52px; --hand-font: 16px; }
  .board .cards.hand:has(.mode-large) { --hand-width: 44px; --hand-font: 22px; }
  .board.hand-overflow:not(.dealer-ceremony-active) { grid-template-rows: minmax(0, 1fr) minmax(44px, auto) 92px; }
  .board :is(.discard-strip, .hand, .self-groups-card, .player-card) { scrollbar-width: none; }
  .board :is(.discard-strip, .hand, .self-groups-card, .player-card)::-webkit-scrollbar { display: none; }
}
@media (pointer: coarse) {
  .board :is(.discard-strip, .hand, .self-groups-card, .player-card) { scrollbar-width: none; }
  .board :is(.discard-strip, .hand, .self-groups-card, .player-card)::-webkit-scrollbar { display: none; }
}
.board.rotated-scroll :is(.hand, .discard-strip, .self-groups-card, .player-card) { touch-action: none; }

/* Tiny flow cards retain two distinct glyphs instead of overlapping text padding. */
.board .discard-token { border-width: 1px; }
.board .discard-token.mode-long :deep(.text-top), .board .discard-token.mode-long :deep(.text-bottom) { padding: 0; }
@media (max-width: 960px), (max-height: 500px) {
  .board[data-table-layout="classic"] .table { grid-template-rows: minmax(44px, 1fr) minmax(clamp(64px, calc(20 * var(--effective-vh, 1vh)), 76px), 1.3fr) minmax(40px, .9fr); }
  .board[data-table-layout="classic"].hand-overflow .table { padding-block: 6px 0; row-gap: 0; grid-template-rows: minmax(44px, 1fr) minmax(clamp(64px, calc(20 * var(--effective-vh, 1vh)), 76px), 1.3fr) minmax(clamp(28px, calc(20 * var(--effective-vh, 1vh) - 34px), 40px), .9fr); }
  .board[data-table-layout="classic"] .player-top { gap: 2px; }
  .board[data-table-layout="classic"] .player-top .seat-identity { flex-wrap: nowrap; gap: 2px; }
  .board[data-table-layout="classic"] .player-top .seat-identity > strong { font-size: 12px; max-width: 4em; }
  .board[data-table-layout="classic"] .player-top :is(.group-score-badge, .dealer-card-mark) { display: none; }
  .board[data-table-layout="classic"] .player-top .seat-identity-meta { gap: 1px; }
  .board[data-table-layout="classic"] .player-top .hand-count-badge { font-size: 11px; min-width: 0; }
  .board[data-table-layout="classic"] .player-top .dealer-badge { width: 16px; height: 16px; font-size: 11px; }
  .board[data-table-layout="classic"] .player-top .mini-card.mode-long { width: 18px; height: 22px; font-size: 10px; padding: 0; border-width: 1px; }
  .board[data-table-layout="classic"] .player-top .mini-card.mode-long :deep(.text) { padding: 0; }
  .board[data-table-layout="classic"] .player-top .group-block { min-height: 0; }
}
@media (max-height: 380px), (max-width: 380px) {
  .board .center { padding: 0; }
  .board :is(.deck-slot, .response-slot) { height: 40px; }
  .board .response-card-face { height: 40px; width: 28px; font-size: 14px; }
  .board .response-card-face.mode-long :deep(.text) { padding: 0; }
  .board .deck-stack { height: 34px; }
  .board .deck-layer { width: 8px; }
}
.table-flight .card :deep(.text-top) { padding-top: var(--flight-top-padding, 3px); }
.table-flight .card :deep(.text-bottom) { padding-bottom: var(--flight-bottom-padding, 3px); }

@media (max-width: 960px), (max-height: 500px) {
  .board[data-table-layout="compact"] .table { grid-template-rows: minmax(44px, 1fr) minmax(40px, 1fr) minmax(34px, .9fr); }
  .board[data-table-layout="compact"] .flow-card { padding: 0; }
  .board[data-table-layout="compact"] .flow-card > p { display: none; }
  .board .self-groups-card { padding: 2px; }
  .board .self-groups-card .group-block-list { column-gap: 4px; }
  .board .self-groups-card .group-block { min-height: 0; padding: 0; }
  .board .self-groups-card .mini-card.mode-long { width: 20px; height: clamp(28px, calc(20 * var(--effective-vh, 1vh) - 36px), 40px); font-size: clamp(10px, calc(2 * var(--effective-vh, 1vh) + 3.6px), 12px); padding: 0; border-width: 1px; }
  .board .self-groups-card .mini-card.mode-long :deep(.text) { padding: 0; }
  .board[data-table-layout="classic"] :is(.player-left, .player-right) { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .board[data-table-layout="classic"] :is(.player-left, .player-right) .seat-head { flex: 0 0 auto; width: 100%; gap: 0; }
  .board[data-table-layout="classic"] :is(.player-left, .player-right) .seat-tags:empty { display: none; }
  .board[data-table-layout="classic"] :is(.player-left, .player-right) .player-status-icon { width: 16px; height: 16px; flex-basis: 16px; }
  .board[data-table-layout="classic"] :is(.player-left, .player-right) .group-block { min-height: 0; padding: 0; }
  .board[data-table-layout="classic"] :is(.player-left, .player-right) .group-block-list { flex: 0 0 auto; width: 100%; max-width: 100%; justify-content: center; }
  .board[data-table-layout="classic"] :is(.player-left, .player-right) .group-score-badge { display: none; }
  .board[data-table-layout="classic"] :is(.player-left, .player-right) .mini-card.mode-long { width: 20px; height: clamp(28px, calc(20 * var(--effective-vh, 1vh) - 36px), 40px); font-size: clamp(10px, calc(2 * var(--effective-vh, 1vh) + 3.6px), 12px); padding: 0; border-width: 1px; }
  .board[data-table-layout="classic"] :is(.player-left, .player-right) .mini-card.mode-long :deep(.text) { padding: 0; }
  .board[data-table-layout="classic"] :is(.player-left, .player-right) .seat-identity-meta { gap: 1px; }
  .board[data-table-layout="classic"] :is(.player-left, .player-right) .hand-count-badge { min-width: 0; font-size: 11px; }
  .board[data-table-layout="classic"] :is(.player-left, .player-right) { padding: 0 2px; }
  .board[data-table-layout="classic"] .self-groups-card { padding-block: 0; }
  .board[data-table-layout="classic"] :is(.player-left, .player-right) .seat-identity { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1px; }
  .board[data-table-layout="classic"] :is(.player-left, .player-right) .seat-identity > strong { grid-column: 1; grid-row: 1; min-width: 0; font-size: 12px; line-height: 16px; }
  .board[data-table-layout="classic"] :is(.player-left, .player-right) .seat-identity-meta { grid-column: 1 / -1; grid-row: 2; flex-wrap: nowrap; }
  .board[data-table-layout="classic"] :is(.player-left, .player-right) .dealer-seat-lockup { grid-column: 2; grid-row: 1; }
  .board[data-table-layout="classic"] :is(.player-left, .player-right) .dealer-card-mark { display: none; }
  .board[data-table-layout="classic"] :is(.player-left, .player-right) .dealer-badge { width: 16px; height: 16px; font-size: 11px; }

}

/* Paging sits beside the hand, preserving full touch targets without another row. */
.board .self-hand-panel { --hand-tools-width: 104px; }
.board .self-hand-panel.has-toolbar { grid-template-rows: minmax(0, 1fr); }
.board .has-toolbar .hand-viewport { width: calc(100% - var(--hand-tools-width)); margin-inline: calc(var(--hand-tools-width) / 2); }
.board .has-toolbar .hand { padding-bottom: 16px; }
.board .hand-toolbar { position: absolute; inset: 0; pointer-events: none; }
.board .hand-scroll-tools { position: relative; width: 100%; height: 100%; justify-content: space-between; }
.board .hand-scroll-tools button { pointer-events: auto; width: 48px; min-width: 48px; height: 44px; min-height: 44px; padding: 0; font-size: 13px; }
.board .hand-visible-range { position: absolute; bottom: 1px; left: 50%; transform: translateX(-50%); font-size: 13px; }
/* SE: preserve complete card rows inside the table's finite height. */
@media (max-height: 340px), (max-width: 340px) {
  .board[data-table-layout="classic"] .table,
  .board[data-table-layout="classic"].hand-overflow .table { padding-block: 6px 0; row-gap: 0; grid-template-rows: minmax(38px, 1fr) minmax(64px, 1.5fr) minmax(28px, .8fr); }
  .board[data-table-layout="classic"] .player-top .seat-head { gap: 0; }
  .board[data-table-layout="classic"] .player-top .player-status-icon { width: 16px; height: 16px; flex-basis: 16px; }
  .board[data-table-layout="classic"] .player-top .mini-card.mode-long { height: 20px; }
  .board[data-table-layout="classic"] :is(.player-left, .player-right) { padding-block: 1px; }
  .board[data-table-layout="classic"] :is(.flow-bottom-left, .flow-bottom-right) .discard-strip { padding-block: 0; }
  .board[data-table-layout="classic"] .self-groups-card { padding-block: 0; }
  .board[data-table-layout="classic"].hand-overflow:not(.dealer-ceremony-active) { grid-template-rows: minmax(0, 1fr) minmax(44px, auto) 76px; }
  .board[data-table-layout="classic"] .has-toolbar .hand { padding-top: 6px; padding-bottom: 16px; }
  .board[data-table-layout="classic"] .hand-visible-range { height: 16px; }
}
</style>
