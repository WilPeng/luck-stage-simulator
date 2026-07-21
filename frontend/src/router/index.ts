import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { useBbAuthStore } from '../stores/bbAuthStore'
import { useLvAuthStore } from '../stores/lovevarietyAuthStore'
import { DEFAULT_GAME_ID, getGameById } from '../config/games'

const routes: RouteRecordRaw[] = [
  // ===== 登录页（所有游戏共用） =====
  {
    path: '/games/:gameId/login',
    name: 'Login',
    component: () => import('../views/auth/LoginView.vue')
  },
  // ===== 乘风2026 选手端 =====
  {
    path: '/games/shengfeng2026/player',
    name: 'Player',
    redirect: () => '/games/shengfeng2026/player/home',
    meta: { requiresPlayer: true, gameId: 'shengfeng2026' },
    component: () => import('../layouts/PlayerLayout.vue'),
    children: [
      { path: 'home', name: 'PlayerHome', component: () => import('../views/player/PlayerHomeView.vue') },
      { path: 'profile', name: 'PlayerProfile', component: () => import('../views/player/PlayerProfileView.vue') },
      { path: 'chat', name: 'PlayerChat', component: () => import('../views/ChatView.vue') },
      { path: 'history', name: 'PlayerHistory', component: () => import('../views/player/PlayerHistoryView.vue') },
      { path: 'round/:round/preparation', name: 'PlayerPreparation', component: () => import('../views/player/PlayerPlaceholderView.vue') },
      { path: 'round/:round/captain', name: 'PlayerCaptain', component: () => import('../views/player/PlayerCaptainView.vue') },
      { path: 'round/:round/team', name: 'PlayerTeam', component: () => import('../views/player/PlayerTeamView.vue') },
      { path: 'round/:round/song-selection', name: 'PlayerSongSelection', component: () => import('../views/player/PlayerSongSelectionView.vue') },
      { path: 'round/:round/training', name: 'PlayerTraining', component: () => import('../views/player/PlayerTrainingView.vue') },
      { path: 'round/:round/performance', name: 'PlayerPerformance', component: () => import('../views/player/PlayerPerformanceView.vue') },
      { path: 'round/:round/elimination', name: 'PlayerElimination', component: () => import('../views/player/PlayerEliminationView.vue') }
    ]
  },
  // ===== 乘风2026 管理端 =====
  {
    path: '/games/shengfeng2026/admin',
    name: 'Admin',
    redirect: () => '/games/shengfeng2026/admin/dashboard',
    meta: { requiresAdmin: true, gameId: 'shengfeng2026' },
    component: () => import('../layouts/AdminLayout.vue'),
    children: [
      { path: 'dashboard', name: 'AdminDashboard', component: () => import('../views/admin/AdminDashboardView.vue') },
      { path: 'players', name: 'AdminPlayers', component: () => import('../views/admin/AdminPlayerView.vue') },
      { path: 'stage', name: 'AdminStage', component: () => import('../views/admin/AdminStageView.vue') },
      { path: 'performance-rounds', redirect: (to: any) => `/games/${to.params.gameId}/admin/stage` },
      { path: 'teams', name: 'AdminTeams', component: () => import('../views/admin/AdminTeamView.vue') },
      { path: 'songs', name: 'AdminSongs', component: () => import('../views/admin/AdminSongManageView.vue') },
      { path: 'training-cards', name: 'AdminTrainingCards', component: () => import('../views/admin/AdminTrainingCardManageView.vue') },
      { path: 'training-records', name: 'AdminTrainingRecords', component: () => import('../views/admin/AdminTrainingRecordView.vue') },
      { path: 'performance', name: 'AdminPerformance', component: () => import('../views/admin/AdminPerformanceView.vue') },
      { path: 'audience-vote', name: 'AdminAudienceVote', component: () => import('../views/admin/AudienceVoteView.vue') },
      { path: 'elimination', name: 'AdminElimination', component: () => import('../views/admin/AdminEliminationView.vue') },
      { path: 'ranking', name: 'AdminRanking', component: () => import('../views/admin/AdminRankingView.vue') },
      { path: 'logs', name: 'AdminLogs', component: () => import('../views/admin/AdminLogView.vue') },
      { path: 'chat', name: 'AdminChat', component: () => import('../views/ChatView.vue') },
      { path: 'round/:round/preparation', name: 'AdminRoundPreparation', component: () => import('../views/admin/AdminPreparationView.vue') },
      { path: 'round/:round/captain_vote', name: 'AdminRoundCaptain', component: () => import('../views/admin/AdminCaptainView.vue') },
      { path: 'round/:round/teaming', name: 'AdminRoundTeam', component: () => import('../views/admin/AdminTeamView.vue') },
      { path: 'round/:round/song_select', name: 'AdminRoundSong', component: () => import('../views/admin/AdminSongView.vue') },
      { path: 'round/:round/training', name: 'AdminRoundTraining', component: () => import('../views/admin/AdminTrainingCardView.vue') },
      { path: 'round/:round/performance', name: 'AdminRoundPerformance', component: () => import('../views/admin/AdminPerformanceView.vue') },
      { path: 'round/:round/elimination', name: 'AdminRoundElimination', component: () => import('../views/admin/AdminEliminationView.vue') }
    ]
  },
  // ===== Big Brother 选手端 =====
  {
    path: '/games/bigbrother/player',
    name: 'BBPlayer',
    redirect: () => '/games/bigbrother/player/home',
    meta: { requiresPlayer: true, gameId: 'bigbrother' },
    component: () => import('../layouts/BBPlayerLayout.vue'),
    children: [
      { path: 'home', name: 'BBPlayerHome', component: () => import('../views/bigbrother/player/BBHomeView.vue') },
      { path: 'profile', name: 'BBPlayerProfile', component: () => import('../views/bigbrother/player/BBProfileView.vue') },
      { path: 'chat', name: 'BBPlayerChat', component: () => import('../views/bigbrother/player/BBChatView.vue') },
      { path: 'history', name: 'BBPlayerHistory', component: () => import('../views/bigbrother/player/BBHistoryView.vue') },
      { path: 'round/:round/hoh', name: 'BBPlayerHoh', component: () => import('../views/bigbrother/player/BBHohView.vue') },
      { path: 'round/:round/nomination', name: 'BBPlayerNomination', component: () => import('../views/bigbrother/player/BBNominationView.vue') },
      { path: 'round/:round/veto', name: 'BBPlayerVeto', component: () => import('../views/bigbrother/player/BBVetoView.vue') },
      { path: 'round/:round/eviction', name: 'BBPlayerEviction', component: () => import('../views/bigbrother/player/BBEvictionView.vue') }
    ]
  },
  // ===== Big Brother 管理端 =====
  {
    path: '/games/bigbrother/admin',
    name: 'BBAdmin',
    redirect: () => '/games/bigbrother/admin/dashboard',
    meta: { requiresAdmin: true, gameId: 'bigbrother' },
    component: () => import('../layouts/BBAdminLayout.vue'),
    children: [
      { path: 'dashboard', name: 'BBAdminDashboard', component: () => import('../views/bigbrother/admin/BBDashboardView.vue') },
      { path: 'houseguests', name: 'BBAdminHouseguests', component: () => import('../views/bigbrother/admin/BBHouseguestView.vue') },
      { path: 'stage', name: 'BBAdminStage', component: () => import('../views/bigbrother/admin/BBStageView.vue') },
      { path: 'logs', name: 'BBAdminLogs', component: () => import('../views/bigbrother/admin/BBLogView.vue') },
      { path: 'chat', name: 'BBAdminChat', component: () => import('../views/bigbrother/admin/BBChatView.vue') },
      { path: 'round/:round/hoh', name: 'BBAdminRoundHoh', component: () => import('../views/bigbrother/admin/BBHohView.vue') },
      { path: 'round/:round/nomination', name: 'BBAdminRoundNomination', component: () => import('../views/bigbrother/admin/BBNominationView.vue') },
      { path: 'round/:round/veto', name: 'BBAdminRoundVeto', component: () => import('../views/bigbrother/admin/BBVetoView.vue') },
      { path: 'round/:round/eviction', name: 'BBAdminRoundEviction', component: () => import('../views/bigbrother/admin/BBEvictionView.vue') }
    ]
  },
  // ===== 恋综选手端 =====
  {
    path: '/games/lovevariety/player',
    name: 'LVPlayer',
    redirect: () => '/games/lovevariety/player/home',
    meta: { requiresPlayer: true, gameId: 'lovevariety' },
    component: () => import('../layouts/LoveVarietyPlayerLayout.vue'),
    children: [
      { path: 'home', name: 'LVPlayerHome', component: () => import('../views/lovevariety/player/LVHomeView.vue') },
      { path: 'round/:round/vote', name: 'LVPlayerVote', component: () => import('../views/lovevariety/player/LVVoteView.vue') },
      { path: 'round/:round/result', name: 'LVPlayerResult', component: () => import('../views/lovevariety/player/LVResultView.vue') },
    ]
  },
  // ===== 恋综管理端 =====
  {
    path: '/games/lovevariety/admin',
    name: 'LVAdmin',
    redirect: () => '/games/lovevariety/admin/dashboard',
    meta: { requiresAdmin: true, gameId: 'lovevariety' },
    component: () => import('../layouts/LoveVarietyAdminLayout.vue'),
    children: [
      { path: 'dashboard', name: 'LVAdminDashboard', component: () => import('../views/lovevariety/admin/LVDashboardView.vue') },
      { path: 'players', name: 'LVAdminPlayers', component: () => import('../views/lovevariety/admin/LVPlayerView.vue') },
      { path: 'stage', name: 'LVAdminStage', component: () => import('../views/lovevariety/admin/LVStageView.vue') },
      { path: 'round/:round/votes', name: 'LVAdminRoundVotes', component: () => import('../views/lovevariety/admin/LVVotesView.vue') },
      { path: 'round/:round/pairing', name: 'LVAdminRoundPairing', component: () => import('../views/lovevariety/admin/LVPairingView.vue') },
      { path: 'round/:round/elimination', name: 'LVAdminRoundElimination', component: () => import('../views/lovevariety/admin/LVEliminationView.vue') }
    ]
  },
  // ===== 默认重定向 =====
  {
    path: '/',
    redirect: `/games/${DEFAULT_GAME_ID}/login`
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: `/games/${DEFAULT_GAME_ID}/login`
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const authStore = useAuthStore()
  const bbAuthStore = useBbAuthStore()
  const lvAuthStore = useLvAuthStore()

  const fullPath = to.path
  const isBB = fullPath.startsWith('/games/bigbrother/')
  const isLV = fullPath.startsWith('/games/lovevariety/')
  const routeGameId = isBB ? 'bigbrother' : isLV ? 'lovevariety' : (to.params.gameId as string | undefined)

  // 根据游戏选择对应的 authStore
  let store = authStore
  if (isBB) store = bbAuthStore
  else if (isLV) store = lvAuthStore

  // 同步 gameId
  if (routeGameId && routeGameId !== authStore.currentGameId && !isBB && !isLV) {
    authStore.setCurrentGameId(routeGameId)
  }

  const currentGameId = routeGameId || authStore.currentGameId || DEFAULT_GAME_ID

  // 登录页直接放行
  if (to.name === 'Login') {
    return true
  }

  // 未登录时尝试从 sessionStorage 恢复
  if (!store.isLoggedIn) {
    const tokenKey = isBB ? 'bigbrother_token' : isLV ? 'lovevariety_token' : store.gameKey('token')
    const userKey = isBB ? 'bigbrother_user' : isLV ? 'lovevariety_user' : store.gameKey('user')
    const token = sessionStorage.getItem(tokenKey)
    const userJson = sessionStorage.getItem(userKey)
    if (token && userJson) {
      try {
        const user = JSON.parse(userJson)
        if (isBB) {
          (bbAuthStore as any).currentUser = user
        } else if (isLV) {
          (lvAuthStore as any).currentUser = user
        } else {
          (authStore as any).setUser(user)
        }
      } catch {
        sessionStorage.removeItem(tokenKey)
        sessionStorage.removeItem(userKey)
      }
    }
  }

  // 仍未登录 → 跳游戏对应的登录页
  if (!store.isLoggedIn) {
    return `/games/${currentGameId}/login`
  }

  if (to.meta.requiresAdmin) {
    if (store.isAdmin) {
      return true
    }
    return `/games/${currentGameId}/admin/dashboard`
  } else if (to.meta.requiresPlayer) {
    if (store.isPlayer || store.isHouseguest) {
      return true
    }
    return `/games/${currentGameId}/player/home`
  }

  return true
})

export default router
