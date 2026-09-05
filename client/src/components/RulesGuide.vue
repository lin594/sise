<template>
  <div class="guide">
    <details :open="phase !== 'playing'">
      <summary>现在怎么操作</summary>
      <ol>
        <li><strong>开局：</strong>手牌上方会选好建议声明的鱼和坎。检查后点“开始游戏”。</li>
        <li><strong>轮到你：</strong>先看手牌上方的提示。可以吃、碰、开、胡时，相应按钮会亮起。</li>
        <li><strong>选择吃牌：</strong>点手牌选择要组成一组的牌，再点“吃”。</li>
        <li><strong>需要出牌：</strong>点一张手牌，再点“出”。将和金条标有“留”，不能主动打出。</li>
        <li><strong>不吃上家的牌：</strong>选择“抓”；抓出的牌先到桌面中央，其他玩家有机会响应。</li>
      </ol>
      <p>打开说明不会暂停牌局。剩余时间和加时按钮在手牌上方。</p>
    </details>
    <details :open="phase === 'playing'">
      <summary>哪些牌能成组</summary>
      <div v-for="example in examples" :key="example.title" class="example">
        <div class="example-cards"><CardComp v-for="card in example.cards" :key="card.id" :card="card" mode="large" size="md" /></div>
        <div><strong :class="{ invalid: !example.valid }">{{ example.valid ? '✓' : '✕' }} {{ example.title }}</strong><p>{{ example.note }}</p></div>
      </div>
      <p>鱼也可以是 4 或 5 张金条。已有坎接到第 4 张同牌叫“开”；普通的三张同牌明示组叫“碰”。</p>
    </details>
    <details :open="phase === 'playing'">
      <summary>怎样胡牌</summary>
      <p><strong>接到当前牌后，所有手牌都能分进合法牌组，没有落单牌，就能胡。</strong>已声明的坎也必须满足保留要求。</p>
      <div class="example"><div class="example-cards"><CardComp v-for="card in waitExample" :key="card.id" :card="card" mode="large" size="md" /></div><p>例如剩下同色“车、马”，等同色“炮”组成一架；其他手牌也都要能成组。</p></div>
      <p>手牌上的“听”表示打出这张后可以听牌。实际出牌时选中它，会在原尺寸牌面旁直接列出所等牌；它不代表牌堆里一定还有这些牌。</p>
      <p>选择吃牌组合时，系统会直接在“吃后打出即可听牌”的剩余手牌上标“听”，不另占提示区。提示只辅助判断，仍需自己确认操作。</p>
    </details>
    <details>
      <summary>怎样计分</summary>
      <p>小胡：3 + 吃分 + 碰分 + 未开坎分 + 单张将／金条分。</p>
      <p>大胡：在小胡基础上加开分和鱼分后整体翻倍；含至少一个鱼或开即为大胡。</p>
      <p>赢家向另外三家分别收取胡牌分；闲家之间另算开和坎的互付。结算页可查看本人的逐项明细。</p>
    </details>
  </div>
</template>
<script setup lang="ts">
import CardComp from './Card.vue';
import type { Card } from '@/types/game';
defineProps<{ phase?: string }>();
function cards(color: string, types: string[]): Card[] { return types.map((type, i) => ({ id: `${color}-${type}-${i}`, color, type })); }
const examples = [
  { title: '同色车马炮', valid: true, cards: cards('red', ['ju', 'ma', 'pao']), note: '三种字各一张，必须同色。' },
  { title: '同色将士象', valid: true, cards: cards('green', ['jiang', 'shi', 'xiang']), note: '三种字各一张，必须同色。' },
  { title: '不同色的卒', valid: true, cards: ['red', 'green', 'yellow'].map((color) => ({ id: color, color, type: 'zu' })), note: '三种或四种不同颜色的卒可以成组。' },
  { title: '对子、坎、鱼', valid: true, cards: cards('white', ['ma', 'ma', 'ma', 'ma']), note: '同色同字：2 张是对子，3 张可作为坎，4 张可声明鱼。图中是鱼。' },
  { title: '单张将、单张金条', valid: true, cards: [{ id: 'general', color: 'yellow', type: 'jiang' }, { id: 'gold', color: 'gold', type: 'gong' }], note: '每张可单独成组；不能主动弃掉。' },
  { title: '混色车马炮不能成架', valid: false, cards: [{ id: 'r', color: 'red', type: 'ju' }, { id: 'g', color: 'green', type: 'ma' }, { id: 'w', color: 'white', type: 'pao' }], note: '字齐了，颜色不一致也不行。' },
];
const waitExample = cards('red', ['ju', 'ma', 'pao']);
</script>
<style scoped>
.guide { display: grid; gap: 10px; }
details { border: 1px solid #334155; border-radius: 10px; padding: 12px; background: #111e30; }
summary { cursor: pointer; color: #f8fafc; font-weight: 700; font-size: 16px; }
p, li { color: #cbd5e1; font-size: 15px; line-height: 1.65; }
li { margin: 8px 0; }
ol { padding-left: 22px; }
.example { display: flex; align-items: center; gap: 14px; border-top: 1px solid #26354b; padding: 12px 0; }
.example:first-of-type { margin-top: 10px; }
.example-cards { display: flex; gap: 3px; flex-shrink: 0; }
.example strong { color: #6ee7b7; }
.example strong.invalid { color: #fda4af; }
.example p { margin: 3px 0 0; }
@media (max-width: 500px) { .example { flex-wrap: wrap; gap: 6px; } }
</style>
