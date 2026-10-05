import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useBbAuthStore } from '../stores/bbAuthStore'

const routes: RouteRecordRaw[] = [
  // ===== 登录入口（选手 / 管理员分离）=====
  {
    path: '/games/bigbrother/login',
    name: 'BBLogin',
    component: () => import('../views/auth/BBLoginView.vue')
  },
  {
    path: '/games/bigbrother/admin/login',
    name: 'BBAdminLogin',
    component: () => import('../views/auth/BBAdminLoginView.vue')
  },
  // ===== Big Brother 选手端 =====
  {
    path: '/games/bigbrother/player',
    name: 'BBPlayer',
    redirect: () => '/games/bigbrother/player/home',
    meta: { requiresPlayer: true },
    component: () => import('../layouts/BBPlayerLayout.vue'),
    children: [
      { path: 'home', name: 'BBPlayerHome', component: () => import('../views/bigbrother/player/BBHomeView.vue') },
      { path: 'profile', name: 'BBPlayerProfile', component: () => import('../views/bigbrother/player/BBProfileView.vue') },
      { path: 'house', name: 'BBPlayerHouse', component: () => import('../views/bigbrother/player/BBHouseView.vue') },
      { path: 'history', name: 'BBPlayerHistory', component: () => import('../views/bigbrother/player/BBHistoryView.vue') },
      { path: 'finale', name: 'BBPlayerFinale', component: () => import('../views/bigbrother/player/BBFinaleView.vue') },
      { path: 'round/:round/hoh', name: 'BBPlayerHoh', component: () => import('../views/bigbrother/player/BBHohView.vue') },
      { path: 'round/:round/nomination', name: 'BBPlayerNomination', component: () => import('../views/bigbrother/player/BBNominationView.vue') },
      { path: 'round/:round/veto-competition', name: 'BBPlayerVetoCompetition', component: () => import('../views/bigbrother/player/BBVetoCompetitionView.vue') },
      { path: 'round/:round/veto-ceremony', name: 'BBPlayerVetoCeremony', component: () => import('../views/bigbrother/player/BBVetoCeremonyView.vue') },
      { path: 'round/:round/replacement-nom', name: 'BBPlayerReplacementNom', component: () => import('../views/bigbrother/player/BBReplacementNomView.vue') },
      { path: 'round/:round/bbbb', name: 'BBPlayerBbbb', component: () => import('../views/bigbrother/player/BBBBView.vue') },
      { path: 'round/:round/eviction-vote', name: 'BBPlayerEvictionVote', component: () => import('../views/bigbrother/player/BBEvictionVoteView.vue') },
      { path: 'round/:round/eviction', name: 'BBPlayerEviction', component: () => import('../views/bigbrother/player/BBEvictionResultView.vue') }
    ]
  },
  // ===== Big Brother 管理端 =====
  {
    path: '/games/bigbrother/admin',
    name: 'BBAdmin',
    redirect: () => '/games/bigbrother/admin/dashboard',
    meta: { requiresAdmin: true },
    component: () => import('../layouts/BBAdminLayout.vue'),
    children: [
      { path: 'dashboard', name: 'BBAdminDashboard', component: () => import('../views/bigbrother/admin/BBDashboardView.vue') },
      { path: 'houseguests', name: 'BBAdminHouseguests', component: () => import('../views/bigbrother/admin/BBHouseguestView.vue') },
      { path: 'house-admin', name: 'BBAdminHouse', component: () => import('../views/bigbrother/admin/BBHouseAdminView.vue') },
      { path: 'house-chat', name: 'BBAdminHouseChat', component: () => import('../views/bigbrother/admin/BBHouseChatLogsView.vue') },
      { path: 'guest-states', name: 'BBAdminGuestStates', component: () => import('../views/bigbrother/admin/BBGuestStateView.vue') },
      { path: 'game-library', name: 'BBAdminGameLibrary', component: () => import('../views/bigbrother/admin/BBGameLibraryView.vue') },
      { path: 'power-challenge', name: 'BBAdminPowerChallenge', component: () => import('../views/bigbrother/admin/BBPowerChallengeView.vue') },
      { path: 'stage', name: 'BBAdminStage', component: () => import('../views/bigbrother/admin/BBStageView.vue') },
      { path: 'endgame', name: 'BBAdminEndgame', component: () => import('../views/bigbrother/admin/BBEndgameView.vue') },
      { path: 'season-result', name: 'BBAdminSeasonResult', component: () => import('../views/bigbrother/admin/BBSeasonResultView.vue') },
      { path: 'minigame-live', name: 'BBAdminMinigameLive', component: () => import('../views/bigbrother/admin/BBMinigameLiveView.vue') },
      { path: 'minigame-replay', name: 'BBAdminMinigameReplay', component: () => import('../views/bigbrother/admin/BBMinigameReplayView.vue') },
      { path: 'logs', name: 'BBAdminLogs', component: () => import('../views/bigbrother/admin/BBLogView.vue') },
      // 7 个独立阶段页面
      { path: 'round/:round/hoh', name: 'BBAdminRoundHoh', component: () => import('../views/bigbrother/admin/BBHohCompetitionView.vue') },
      { path: 'round/:round/nomination', name: 'BBAdminRoundNomination', component: () => import('../views/bigbrother/admin/BBInitialNominationView.vue') },
      { path: 'round/:round/veto-competition', name: 'BBAdminRoundVetoCompetition', component: () => import('../views/bigbrother/admin/BBVetoDrawView.vue') },
      { path: 'round/:round/veto-ceremony', name: 'BBAdminRoundVetoCeremony', component: () => import('../views/bigbrother/admin/BBVetoCeremonyView.vue') },
      { path: 'round/:round/replacement-nom', name: 'BBAdminRoundReplacementNom', component: () => import('../views/bigbrother/admin/BBReplacementNomView.vue') },
      { path: 'round/:round/bbbb', name: 'BBAdminRoundBbbb', component: () => import('../views/bigbrother/admin/BBBBView.vue') },
      { path: 'round/:round/eviction-vote', name: 'BBAdminRoundEvictionVote', component: () => import('../views/bigbrother/admin/BBEvictionVoteView.vue') },
      { path: 'round/:round/eviction', name: 'BBAdminRoundEviction', component: () => import('../views/bigbrother/admin/BBEvictionResultView.vue') }
    ]
  },
  // ===== 默认重定向 =====
  {
    path: '/',
    redirect: '/games/bigbrother/login'
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/games/bigbrother/login'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

const PUBLIC_ROUTES = ['BBLogin', 'BBAdminLogin']

router.beforeEach((to) => {
  const authStore = useBbAuthStore()

  if (PUBLIC_ROUTES.includes(String(to.name))) return true

  if (!authStore.isLoggedIn) {
    authStore.restoreSession()
  }

  if (!authStore.isLoggedIn) {
    const isAdminArea = to.path.startsWith('/games/bigbrother/admin')
    return isAdminArea ? '/games/bigbrother/admin/login' : '/games/bigbrother/login'
  }

  if (to.meta.requiresAdmin && !authStore.isAdmin) {
    return '/games/bigbrother/player/home'
  }
  if (to.meta.requiresPlayer && !authStore.isHouseguest) {
    return '/games/bigbrother/admin/dashboard'
  }

  return true
})

// ===== 浏览器标题与图标 =====
function setFavicon(emoji: string) {
  try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="88">${emoji}</text></svg>`
    const href = 'data:image/svg+xml,' + encodeURIComponent(svg)
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.type = 'image/svg+xml'
    link.href = href
  } catch { /* ignore */ }
}

export function applyGamePageMeta(_gameId: string | undefined, stageName?: string) {
  const base = 'Big Brother'
  document.title = stageName ? `${base} · ${stageName}` : base
  setFavicon('📹')
}

router.afterEach(() => {
  applyGamePageMeta('bigbrother')
})

export default router
