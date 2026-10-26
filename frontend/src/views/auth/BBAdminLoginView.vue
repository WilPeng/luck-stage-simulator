<template>
  <div class="login-page admin">
    <div class="bg-layer" aria-hidden="true">
      <div class="glow glow-a"></div>
      <div class="glow glow-b"></div>
      <div class="glow glow-c"></div>
      <div class="stars"></div>
      <svg class="castle" viewBox="0 0 1400 620" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="castleGradA" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#1a0d2c" />
            <stop offset="100%" stop-color="#0a0616" />
          </linearGradient>
        </defs>
        <g fill="url(#castleGradA)">
          <path d="M40 620 V330 h34 v-52 l18-46 18 46 v52 h34 V300 h34 V620 Z" />
          <path d="M190 620 V250 h40 v-60 l22-70 22 70 v60 h46 V238 h34 v-70 l26-80 26 80 v70 h40 V250 h44 V620 Z" />
          <path d="M520 620 V300 h32 v-46 l20-64 20 64 v46 h36 v70 h30 V270 l22-70 22 70 v120 h34 V620 Z" />
          <path d="M790 620 V320 h30 v-44 l20-58 20 58 v44 h34 V262 h34 v-64 l22-74 22 74 v64 h40 V320 h30 V620 Z" />
          <path d="M1030 620 V340 h30 v-48 l20-58 20 58 v48 h34 v60 h30 V300 l20-60 20 60 v80 h34 V620 Z" />
          <path d="M1240 620 V360 h30 v-42 l18-50 18 50 v42 h34 V620 Z" />
        </g>
        <g fill="#0a0616" opacity="0.95"><path d="M0 620 V560 h1400 v60 Z" /></g>
      </svg>
      <div class="fog"></div>
    </div>

    <div class="login-wrap">
      <section class="hero">
        <div class="hero-emblem">
          <svg viewBox="0 0 80 80" class="emblem-svg">
            <defs>
              <linearGradient id="goldGradA" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#f6e7b0" />
                <stop offset="100%" stop-color="#c9a24f" />
              </linearGradient>
            </defs>
            <path d="M40 5 L70 17 V38 C70 56 56 68 40 75 C24 68 10 56 10 38 V17 Z"
              fill="none" stroke="url(#goldGradA)" stroke-width="2.2" />
            <path d="M26 34 h28 v4 H26 Z M28 40 h24 v3 H28 Z M30 45 h20 v3 H30 Z"
              fill="url(#goldGradA)" />
            <path d="M26 30 l4-6 4 6 6-8 6 8 4-6 4 6" fill="none" stroke="url(#goldGradA)" stroke-width="2" />
          </svg>
        </div>
        <h1 class="hero-title">Administrator</h1>
        <div class="hero-latin"><span class="ln"></span>AUTHORIZED&nbsp;·&nbsp;ACCESS<span class="ln"></span></div>
        <div class="hero-tag">管理 · 监控 · 主持</div>
        <div class="hero-sigils">
          <span class="sigil s-purple"></span>
          <span class="sigil s-blue"></span>
          <span class="sigil s-green"></span>
          <span class="sigil s-red"></span>
          <span class="sigil s-cyan"></span>
        </div>
      </section>

      <section class="panel-wrap">
        <div class="panel">
          <span class="corner tl"></span><span class="corner tr"></span>
          <span class="corner bl"></span><span class="corner br"></span>

          <div class="panel-crest">
            <svg viewBox="0 0 64 64" class="crest-svg">
              <path d="M32 4 L56 14 V34 C56 48 44 56 32 60 C20 56 8 48 8 34 V14 Z"
                fill="none" stroke="#e3b46a" stroke-width="1.8" />
              <path d="M20 26 h24 v3 H20 Z M22 31 h20 v3 H22 Z M24 36 h16 v3 H24 Z" fill="#e3b46a" />
              <path d="M20 22 l3-4 3 4 4-5 4 5 4-5 4 5 3-4 3 4" fill="none" stroke="#e3b46a" stroke-width="1.6" />
            </svg>
          </div>

          <h2 class="panel-title">Big Brother 管理后台</h2>
          <div class="panel-sub"><span class="ln"></span>仅限授权管理人员<span class="ln"></span></div>

          <div v-if="error" class="alert err">{{ error }}</div>
          <div v-if="success" class="alert ok">{{ success }}</div>

          <form class="form" @submit.prevent="handleLogin">
            <div class="field">
              <span class="field-icon">
                <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-7 2.2-7 5v1h14v-1c0-2.8-3-5-7-5Z"/></svg>
              </span>
              <input v-model="username" placeholder="管理员账号" autocomplete="username" :disabled="isLoading" />
            </div>

            <div class="field">
              <span class="field-icon">
                <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 2a4 4 0 0 0-4 4v3H6v13h12V9h-2V6a4 4 0 0 0-4-4Zm-2 7V6a2 2 0 1 1 4 0v3h-4Z"/></svg>
              </span>
              <input :type="showPwd ? 'text' : 'password'" v-model="password" placeholder="登录密码"
                autocomplete="current-password" :disabled="isLoading" />
              <button type="button" class="eye" @click="showPwd = !showPwd" :aria-label="showPwd ? '隐藏密码' : '显示密码'">
                <svg v-if="!showPwd" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/></svg>
                <svg v-else viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3 3 21 21l-1.4 1.4L2 4.4 3.3 3ZM12 5c5 0 9 4.5 10 7a13 13 0 0 1-2.6 3.5l-2.2-2.2A5 5 0 0 0 9.8 7.9L7.5 5.6C8.8 5.2 10.3 5 12 5ZM4.6 8.5 6.8 10.7A5 5 0 0 0 13.3 17l1.9 1.9c-1 .3-2.1.4-3.2.4-5 0-9-4.5-10-7 .5-1.3 1.4-2.6 2.6-3.8Z"/></svg>
              </button>
            </div>

            <div class="remember-row">
              <label class="remember"><input type="checkbox" v-model="rememberAccount" /><span>记住账号</span></label>
              <label class="remember"><input type="checkbox" v-model="rememberPassword" /><span>记住密码（自动填充）</span></label>
            </div>

            <button type="submit" class="submit" :disabled="isLoading">
              <span>{{ isLoading ? '登录中…' : '进入管理后台' }}</span>
              <span class="arrow">→</span>
            </button>
          </form>

          <div class="divider"><span>✦</span></div>

          <button type="button" class="admin-btn" @click="goPlayerLogin">
            <span class="chev left">‹</span>
            <span>返回选手登录</span>
          </button>

          <div class="footer">© BIG BROTHER · 管理控制台</div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useBbAuthStore } from '../../stores/bbAuthStore'
import { useRouter, useRoute } from 'vue-router'

const authStore = useBbAuthStore()
const router = useRouter()
const route = useRoute()

const SAVED_KEY = 'bigbrother_saved_admin'

const username = ref('')
const password = ref('')
const rememberAccount = ref(true)
const rememberPassword = ref(false)
const showPwd = ref(false)
const isLoading = ref(false)
const error = ref('')
const success = ref('')

function goPlayerLogin() {
  router.push('/games/bigbrother/login')
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(SAVED_KEY)
    if (!raw) return null
    return JSON.parse(raw) as { username: string; password: string; rememberPassword: boolean }
  } catch { return null }
}

function saveSaved() {
  try {
    if (rememberAccount.value && username.value.trim()) {
      localStorage.setItem(SAVED_KEY, JSON.stringify({
        username: username.value.trim(),
        password: rememberPassword.value ? password.value : '',
        rememberPassword: rememberPassword.value
      }))
    } else {
      localStorage.removeItem(SAVED_KEY)
    }
  } catch {}
}

async function handleLogin() {
  if (!username.value.trim() || !password.value) {
    error.value = '请输入账号和密码'
    success.value = ''
    return
  }
  isLoading.value = true
  error.value = ''
  success.value = ''
  try {
    const result = await authStore.adminLogin(username.value.trim(), password.value)
    if (!result.user || result.user.role !== 'admin') {
      error.value = '该账号不是管理员'
      return
    }
    saveSaved()
    success.value = '登录成功，正在进入...'
    await new Promise((resolve) => setTimeout(resolve, 400))
    await router.replace((route.query.redirect as string) || '/games/bigbrother/admin/dashboard')
  } catch (err: any) {
    error.value = err.message || '登录失败，请稍后重试'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  const saved = loadSaved()
  if (!saved) return
  username.value = saved.username || ''
  rememberPassword.value = !!saved.rememberPassword
  if (saved.rememberPassword && saved.password) {
    password.value = saved.password
  }
})
</script>

<style scoped>
* { box-sizing: border-box; }

.login-page {
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  overflow: hidden;
  color: #ece7fb;
  background:
    radial-gradient(1200px 620px at 72% 18%, rgba(120, 66, 150, 0.5) 0%, transparent 60%),
    radial-gradient(900px 520px at 18% 82%, rgba(120, 60, 60, 0.35) 0%, transparent 62%),
    linear-gradient(160deg, #1a0e2b 0%, #2a1730 46%, #120a1a 100%);
  font-family: 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif;
}

.bg-layer { position: absolute; inset: 0; pointer-events: none; }
.glow { position: absolute; border-radius: 50%; filter: blur(60px); }
.glow-a { width: 520px; height: 520px; top: -120px; right: 8%; background: radial-gradient(circle, rgba(200, 120, 255, 0.45), transparent 65%); }
.glow-b { width: 480px; height: 480px; bottom: -160px; left: 6%; background: radial-gradient(circle, rgba(230, 140, 90, 0.28), transparent 65%); }
.glow-c { width: 360px; height: 360px; top: 40%; left: 42%; background: radial-gradient(circle, rgba(200, 120, 200, 0.2), transparent 70%); }
.stars {
  position: absolute; inset: 0; opacity: 0.7;
  background-image:
    radial-gradient(1.5px 1.5px at 12% 22%, #fff 99%, transparent),
    radial-gradient(1.5px 1.5px at 28% 68%, #e9dcff 99%, transparent),
    radial-gradient(1px 1px at 46% 12%, #fff 99%, transparent),
    radial-gradient(1.5px 1.5px at 63% 44%, #fff 99%, transparent),
    radial-gradient(1px 1px at 78% 18%, #dcd0ff 99%, transparent),
    radial-gradient(1.5px 1.5px at 88% 62%, #fff 99%, transparent),
    radial-gradient(1px 1px at 36% 38%, #fff 99%, transparent),
    radial-gradient(1px 1px at 71% 78%, #fff 99%, transparent);
  animation: twinkle 6s ease-in-out infinite alternate;
}
@keyframes twinkle { from { opacity: 0.35; } to { opacity: 0.85; } }
.castle { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: 62%; opacity: 0.95; }
.fog { position: absolute; left: 0; right: 0; bottom: 0; height: 34%; background: linear-gradient(to top, rgba(10, 6, 22, 0.95), rgba(20, 12, 40, 0.55) 45%, transparent); }

.login-wrap { position: relative; z-index: 2; width: 100%; max-width: 1120px; display: flex; align-items: center; justify-content: space-between; gap: 48px; }

.hero { flex: 1; min-width: 0; padding-left: 8px; }
.hero-emblem { margin-bottom: 10px; }
.emblem-svg { width: 68px; height: 68px; filter: drop-shadow(0 0 14px rgba(230, 180, 106, 0.5)); }
.hero-title {
  margin: 6px 0 10px;
  font-family: 'Cinzel', 'Trajan Pro', Georgia, 'Times New Roman', serif;
  font-size: clamp(38px, 5.4vw, 74px);
  line-height: 1.02; letter-spacing: 1px;
  background: linear-gradient(180deg, #f4ecd6 0%, #e6c988 45%, #b98a3e 100%);
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 2px 30px rgba(240, 210, 150, 0.15);
}
.hero-latin { display: flex; align-items: center; gap: 12px; font-family: 'Cinzel', Georgia, serif; letter-spacing: 5px; font-size: 14px; color: #d9c8a6; }
.hero-latin .ln { flex: 0 0 50px; height: 1px; background: linear-gradient(90deg, transparent, #d9c8a655, transparent); }
.hero-tag { margin-top: 14px; font-size: 15px; letter-spacing: 8px; color: #cbbfe6; }
.hero-sigils { display: flex; gap: 14px; margin-top: 26px; }
.sigil { width: 30px; height: 30px; transform: rotate(45deg); border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.5); box-shadow: 0 0 18px currentColor, inset 0 0 10px rgba(255, 255, 255, 0.35); animation: floaty 4s ease-in-out infinite; }
.sigil:nth-child(1) { color: #a06bff; background: radial-gradient(circle at 30% 30%, #d9c4ff, #7b3fe4); }
.sigil:nth-child(2) { color: #4aa8ff; background: radial-gradient(circle at 30% 30%, #bfe0ff, #2f7de0); animation-delay: .3s; }
.sigil:nth-child(3) { color: #47e08a; background: radial-gradient(circle at 30% 30%, #c4ffdf, #22b266); animation-delay: .6s; }
.sigil:nth-child(4) { color: #ff6b8a; background: radial-gradient(circle at 30% 30%, #ffd0da, #e2385e); animation-delay: .9s; }
.sigil:nth-child(5) { color: #38d6e0; background: radial-gradient(circle at 30% 30%, #c6fbff, #1aa2ad); animation-delay: 1.2s; }
@keyframes floaty { 0%, 100% { transform: rotate(45deg) translateY(0); } 50% { transform: rotate(45deg) translateY(-6px); } }

.panel-wrap { flex: 0 0 auto; width: 430px; max-width: 100%; }
.panel {
  position: relative; padding: 34px 34px 26px; border-radius: 20px;
  background: linear-gradient(165deg, rgba(82, 50, 110, 0.55), rgba(30, 16, 48, 0.84));
  border: 1px solid rgba(220, 180, 150, 0.35);
  box-shadow:
    inset 0 0 0 1px rgba(180, 120, 200, 0.16),
    inset 0 0 60px rgba(150, 80, 200, 0.12),
    0 30px 90px rgba(0, 0, 0, 0.55),
    0 0 80px rgba(200, 120, 200, 0.2);
  backdrop-filter: blur(18px);
}
.corner { position: absolute; width: 16px; height: 16px; border: 2px solid #e3b46a; opacity: 0.8; }
.corner.tl { top: 10px; left: 10px; border-right: none; border-bottom: none; border-top-left-radius: 6px; }
.corner.tr { top: 10px; right: 10px; border-left: none; border-bottom: none; border-top-right-radius: 6px; }
.corner.bl { bottom: 10px; left: 10px; border-right: none; border-top: none; border-bottom-left-radius: 6px; }
.corner.br { bottom: 10px; right: 10px; border-left: none; border-top: none; border-bottom-right-radius: 6px; }

.panel-crest { display: flex; justify-content: center; margin-bottom: 8px; }
.crest-svg { width: 60px; height: 60px; filter: drop-shadow(0 0 16px rgba(227, 180, 106, 0.45)); }
.panel-title { margin: 4px 0 8px; text-align: center; font-family: 'Cinzel', Georgia, serif; font-size: 22px; font-weight: 700; color: #f2ecff; text-shadow: 0 2px 20px rgba(200, 130, 255, 0.35); }
.panel-sub { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 22px; font-size: 13px; letter-spacing: 2px; color: #b7a9dd; }
.panel-sub .ln { width: 36px; height: 1px; background: linear-gradient(90deg, transparent, #a98fd8, transparent); }

.alert { margin-bottom: 14px; padding: 10px 14px; border-radius: 10px; font-size: 13px; }
.alert.err { color: #ffb3c0; background: rgba(255, 80, 110, 0.12); border: 1px solid rgba(255, 80, 110, 0.35); }
.alert.ok { color: #9df0c0; background: rgba(60, 220, 140, 0.12); border: 1px solid rgba(60, 220, 140, 0.35); }

.form { display: flex; flex-direction: column; gap: 14px; }
.field { display: flex; align-items: center; gap: 10px; height: 54px; padding: 0 16px; border-radius: 12px; background: rgba(16, 10, 34, 0.6); border: 1px solid rgba(180, 140, 200, 0.35); transition: border-color 0.2s, box-shadow 0.2s; }
.field:focus-within { border-color: #e3b46a; box-shadow: 0 0 0 3px rgba(227, 180, 106, 0.18); }
.field-icon { display: inline-flex; color: #a99bd0; }
.field input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: #f1edff; font-size: 15px; }
.field input::placeholder { color: #8f83b8; }
.eye { display: inline-flex; background: none; border: none; color: #a99bd0; cursor: pointer; padding: 4px; }
.eye:hover { color: #d7c8ff; }

.remember-row { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; margin-top: 2px; }
.remember { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: #b7a9dd; cursor: pointer; user-select: none; }
.remember input { width: 15px; height: 15px; accent-color: #d9a45c; cursor: pointer; }

.submit {
  margin-top: 6px; height: 56px; width: 100%;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  border: none; border-radius: 14px; cursor: pointer;
  font-size: 16px; font-weight: 700; color: #fff;
  background: linear-gradient(135deg, #d9a45c 0%, #b565a7 55%, #7b5cff 100%);
  box-shadow: 0 12px 34px rgba(190, 120, 180, 0.45), inset 0 0 22px rgba(255, 255, 255, 0.14);
  transition: transform 0.15s, box-shadow 0.2s, opacity 0.2s;
}
.submit:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 18px 44px rgba(190, 120, 180, 0.6), inset 0 0 22px rgba(255, 255, 255, 0.18); }
.submit:active:not(:disabled) { transform: translateY(0); }
.submit:disabled { opacity: 0.6; cursor: not-allowed; }
.submit .arrow { font-size: 18px; }

.divider { display: flex; align-items: center; justify-content: center; gap: 14px; margin: 20px 0 16px; color: #c8b489; }
.divider::before, .divider::after { content: ''; width: 90px; height: 1px; background: linear-gradient(90deg, transparent, rgba(200, 180, 137, 0.6), transparent); }
.divider span { font-size: 13px; }

.admin-btn { width: 100%; height: 52px; display: flex; align-items: center; justify-content: center; gap: 10px; background: rgba(20, 12, 40, 0.45); color: #e7def8; border: 1px solid rgba(220, 180, 150, 0.45); border-radius: 12px; font-size: 15px; cursor: pointer; transition: all 0.2s; }
.admin-btn:hover { border-color: #d9c07a; color: #fff; background: rgba(217, 192, 122, 0.12); }
.admin-btn .chev { color: #b7a9dd; }

.footer { margin-top: 20px; text-align: center; font-size: 11px; letter-spacing: 1px; color: #8f83b8; }

@media (max-width: 960px) {
  .login-wrap { flex-direction: column; justify-content: center; gap: 22px; max-width: 460px; }
  .hero { text-align: center; padding-left: 0; }
  .hero-emblem { display: flex; justify-content: center; }
  .hero-latin, .hero-tag { justify-content: center; }
  .hero-sigils { justify-content: center; }
  .hero-title { font-size: clamp(32px, 8vw, 52px); }
  .panel-wrap { width: 100%; }
  .castle { height: 42%; opacity: 0.6; }
}
@media (max-width: 480px) {
  .login-page { padding: 18px 14px; align-items: flex-start; }
  .login-wrap { gap: 16px; margin-top: 16px; }
  .hero-title { font-size: 32px; }
  .hero-tag { letter-spacing: 5px; font-size: 13px; }
  .hero-sigils { gap: 10px; margin-top: 14px; }
  .sigil { width: 24px; height: 24px; }
  .panel { padding: 24px 20px 20px; border-radius: 16px; }
  .panel-title { font-size: 19px; }
  .field { height: 50px; }
  .submit { height: 52px; }
}
</style>
