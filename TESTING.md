# 测试指南

## 快速测试游戏

### 方法1: 端到端测试（推荐）

```bash
cd server
npm run build
node test-e2e.js
```

这将自动测试完整的游戏流程，包括：
- 服务器启动
- 4个客户端连接
- 手牌分发
- 暗坎声明
- 游戏流程

**预期结果**: 所有测试通过，显示 ✅ End-to-End Test PASSED!

### 方法2: 单元测试

```bash
cd server
npx ts-node src/test-game.ts
```

测试核心游戏逻辑：
- 牌库创建（117张）
- 发牌逻辑
- 暗坎计数
- 暗坎违规检测
- 胡牌验证

### 方法3: 手动测试

```bash
# 终端1 - 启动服务器
npm run dev:server

# 终端2 - 启动客户端
npm run dev:client

# 浏览器访问 http://localhost:3000
```

## 测试检查清单

### ✅ 基础功能
- [ ] 能进入游戏
- [ ] 能看到手牌
- [ ] 庄家有21张牌
- [ ] 非庄家有20张牌
- [ ] 能声明暗坎

### ✅ 亮鱼功能
- [ ] 声明面板中有亮鱼选项
- [ ] 能选择4张同色同字的牌
- [ ] 能选择4/5张金条
- [ ] 亮鱼后牌被锁定

### ✅ 游戏流程
- [ ] 声明后进入playing阶段
- [ ] 能打出牌（非将/金条）
- [ ] 其他玩家能响应（胡/开/碰）
- [ ] 能吃牌
- [ ] 能抓牌

### ✅ 暗坎校验
- [ ] 声明暗坎后系统记录
- [ ] 胡牌时检查暗坎数量
- [ ] 违规时显示提示
- [ ] 违规时罚分

### ✅ 游戏结束
- [ ] 胡牌后显示结算界面
- [ ] 得分计算正确
- [ ] 显示牌组详情

## 常见问题

### 问题: 看不到手牌

**检查**:
1. 浏览器控制台是否有错误
2. 服务器是否正常运行 (ws://localhost:2567)
3. 网络连接是否正常

**解决**: 刷新页面或重启服务器

### 问题: 游戏卡在declaring阶段

**检查**:
1. 是否声明了暗坎
2. AI玩家是否正常工作

**解决**: E2E测试已修复此问题，确保使用最新代码

### 问题: TypeScript编译错误

**检查**:
```bash
cd server
npx tsc --noEmit
```

**解决**: 所有类型错误已修复

## 性能测试

### 测试负载
```bash
# 同时运行多个客户端
for i in {1..10}; do
  node test-e2e.js &
done
wait
```

### 监控指标
- 内存使用: `node --inspect server/dist/index.js`
- CPU使用: `top` 或 `htop`
- 网络延迟: 浏览器开发工具 Network tab

## 回归测试

每次修改后运行：
```bash
npm install
npm run build
cd server && node test-e2e.js
```

确保所有测试通过后再提交代码。

## 持续集成

建议添加到CI/CD流程：
```yaml
# .github/workflows/test.yml
- name: Run E2E Tests
  run: |
    npm install
    npm run build
    cd server && timeout 60 node test-e2e.js
```

---

**记住**: 测试是确保游戏质量的关键！
