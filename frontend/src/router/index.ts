import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { useBbAuthStore } from '../stores/bbAuthStore'
import { useLvAuthStore } from '../stores/lovevarietyAuthStore'
import { usePcAuthStore } from '../stores/pcAuthStore'
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
      { path: 'round/:round/concurrent', name: 'PlayerConcurrent', component: () => import('../views/player/PlayerConcurrentView.vue') },
      { path: 'round/:round/performance-draw', name: 'PlayerPerformanceDraw', component: () => import('../views/player/PlayerPerformanceDrawView.vue') },
      { path: 'round/:round/team', name: 'PlayerTeam', component: () => import('../views/player/PlayerTeamView.vue') },
      { path: 'round/:round/song-group', name: 'PlayerSongGroup', component: () => import('../views/player/PlayerSongGroupView.vue') },
      { path: 'round/:round/captain-choice', name: 'PlayerCaptainChoice', component: () => import('../views/player/PlayerCaptainChoiceView.vue') },
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
      { path: 'round/:round/concurrent', name: 'AdminRoundConcurrent', component: () => import('../views/admin/AdminConcurrentView.vue') },
      { path: 'round/:round/teaming', name: 'AdminRoundTeam', component: () => import('../views/admin/AdminTeamView.vue') },
      { path: 'round/:round/song-group', name: 'AdminRoundSongGroup', component: () => import('../views/admin/AdminSongGroupView.vue') },
      { path: 'round/:round/captain-choice', name: 'AdminRoundCaptainChoice', component: () => import('../views/admin/AdminCaptainChoiceView.vue') },
      { path: 'round/:round/song_select', name: 'AdminRoundSong', component: () => import('../views/admin/AdminSongView.vue') },
      { path: 'round/:round/training', name: 'AdminRoundTraining', component: () => import('../views/admin/AdminTrainingCardView.vue') },
      { path: 'round/:round/performance_draw', name: 'AdminRoundPerformanceDraw', component: () => import('../views/admin/AdminPerformanceDrawView.vue') },
      { path: 'round/:round/performance', name: 'AdminRoundPerformance', component: () => import('../views/admin/AdminPerformanceView.vue') },
      { path: 'round/:round/danger_confirm', name: 'AdminRoundDangerConfirm', component: () => import('../views/admin/AdminDangerConfirmView.vue') },
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
      { path: 'house', name: 'BBPlayerHouse', component: () => import('../views/bigbrother/player/BBHouseView.vue') },
      { path: 'history', name: 'BBPlayerHistory', component: () => import('../views/bigbrother/player/BBHistoryView.vue') },
      { path: 'finale', name: 'BBPlayerFinale', component: () => import('../views/bigbrother/player/BBFinaleView.vue') },
      { path: 'round/:round/hoh', name: 'BBPlayerHoh', component: () => import('../views/bigbrother/player/BBHohView.vue') },
      { path: 'round/:round/nomination', name: 'BBPlayerNomination', component: () => import('../views/bigbrother/player/BBNominationView.vue') },
      { path: 'round/:round/veto-competition', name: 'BBPlayerVetoCompetition', component: () => import('../views/bigbrother/player/BBVetoCompetitionView.vue') },
      { path: 'round/:round/veto-ceremony', name: 'BBPlayerVetoCeremony', component: () => import('../views/bigbrother/player/BBVetoCeremonyView.vue') },
      { path: 'round/:round/replacement-nom', name: 'BBPlayerReplacementNom', component: () => import('../views/bigbrother/player/BBReplacementNomView.vue') },
      { path: 'round/:round/eviction-vote', name: 'BBPlayerEvictionVote', component: () => import('../views/bigbrother/player/BBEvictionVoteView.vue') },
      { path: 'round/:round/eviction', name: 'BBPlayerEviction', component: () => import('../views/bigbrother/player/BBEvictionResultView.vue') }
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
      { path: 'house-admin', name: 'BBAdminHouse', component: () => import('../views/bigbrother/admin/BBHouseAdminView.vue') },
      { path: 'game-library', name: 'BBAdminGameLibrary', component: () => import('../views/bigbrother/admin/BBGameLibraryView.vue') },
      { path: 'power-challenge', name: 'BBAdminPowerChallenge', component: () => import('../views/bigbrother/admin/BBPowerChallengeView.vue') },
      { path: 'stage', name: 'BBAdminStage', component: () => import('../views/bigbrother/admin/BBStageView.vue') },
      { path: 'endgame', name: 'BBAdminEndgame', component: () => import('../views/bigbrother/admin/BBEndgameView.vue') },
      { path: 'season-result', name: 'BBAdminSeasonResult', component: () => import('../views/bigbrother/admin/BBSeasonResultView.vue') },
      { path: 'logs', name: 'BBAdminLogs', component: () => import('../views/bigbrother/admin/BBLogView.vue') },
      { path: 'chat', name: 'BBAdminChat', component: () => import('../views/bigbrother/admin/BBChatView.vue') },
      // 7 个独立阶段页面
      { path: 'round/:round/hoh', name: 'BBAdminRoundHoh', component: () => import('../views/bigbrother/admin/BBHohCompetitionView.vue') },
      { path: 'round/:round/nomination', name: 'BBAdminRoundNomination', component: () => import('../views/bigbrother/admin/BBInitialNominationView.vue') },
      { path: 'round/:round/veto-competition', name: 'BBAdminRoundVetoCompetition', component: () => import('../views/bigbrother/admin/BBVetoDrawView.vue') },
      { path: 'round/:round/veto-ceremony', name: 'BBAdminRoundVetoCeremony', component: () => import('../views/bigbrother/admin/BBVetoCeremonyView.vue') },
      { path: 'round/:round/replacement-nom', name: 'BBAdminRoundReplacementNom', component: () => import('../views/bigbrother/admin/BBReplacementNomView.vue') },
      { path: 'round/:round/eviction-vote', name: 'BBAdminRoundEvictionVote', component: () => import('../views/bigbrother/admin/BBEvictionVoteView.vue') },
      { path: 'round/:round/eviction', name: 'BBAdminRoundEviction', component: () => import('../views/bigbrother/admin/BBEvictionResultView.vue') }
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
      { path: 'letter/send', name: 'LVPlayerLetterSend', component: () => import('../views/lovevariety/player/LVLetterSendView.vue') },
      { path: 'letter/inbox', name: 'LVPlayerInbox', component: () => import('../views/lovevariety/player/LVInboxView.vue') },
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
      { path: 'round/:round/elimination', name: 'LVAdminRoundElimination', component: () => import('../views/lovevariety/admin/LVEliminationView.vue') },
      { path: 'letters', name: 'LVAdminLetters', component: () => import('../views/lovevariety/admin/LVLetterView.vue') }
    ]
  },
  // ===== 实力大挑战 选手端 =====
  {
    path: '/games/powerchallenge/player',
    name: 'PCPlayer',
    redirect: () => '/games/powerchallenge/player/home',
    meta: { requiresPlayer: true, gameId: 'powerchallenge' },
    component: () => import('../layouts/PowerChallengePlayerLayout.vue'),
    children: [
      { path: 'home', name: 'PCPlayerHome', component: () => import('../views/powerchallenge/player/PCHomeView.vue') },
      { path: 'game', name: 'PCPlayerGame', component: () => import('../views/powerchallenge/player/PCGameView.vue') }
    ]
  },
  // ===== 实力大挑战 管理端 =====
  {
    path: '/games/powerchallenge/admin',
    name: 'PCAdmin',
    redirect: () => '/games/powerchallenge/admin/dashboard',
    meta: { requiresAdmin: true, gameId: 'powerchallenge' },
    component: () => import('../layouts/PowerChallengeAdminLayout.vue'),
    children: [
      { path: 'dashboard', name: 'PCAdminDashboard', component: () => import('../views/powerchallenge/admin/PCDashboardView.vue') },
      { path: 'live', name: 'PCAdminLive', component: () => import('../views/powerchallenge/admin/PCLiveControlView.vue') },
      { path: 'players', name: 'PCAdminPlayers', component: () => import('../views/powerchallenge/admin/PCPlayerView.vue') },
      { path: 'question-pools', name: 'PCAdminQuestionPools', component: () => import('../views/powerchallenge/admin/PCPowerChallengeView.vue') }
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
  const pcAuthStore = usePcAuthStore()

  const fullPath = to.path
  const isBB = fullPath.startsWith('/games/bigbrother/')
  const isLV = fullPath.startsWith('/games/lovevariety/')
  const isPC = fullPath.startsWith('/games/powerchallenge/')
  const routeGameId = isBB ? 'bigbrother' : isLV ? 'lovevariety' : isPC ? 'powerchallenge' : (to.params.gameId as string | undefined)

  // 根据游戏选择对应的 authStore
  let store = authStore
  if (isBB) store = bbAuthStore
  else if (isLV) store = lvAuthStore
  else if (isPC) store = pcAuthStore

  // 同步 gameId
  if (routeGameId && routeGameId !== authStore.currentGameId && !isBB && !isLV && !isPC) {
    authStore.setCurrentGameId(routeGameId)
  }

  const currentGameId = routeGameId || authStore.currentGameId || DEFAULT_GAME_ID

  // 登录页直接放行
  if (to.name === 'Login') { return true }

  // 未登录时尝试从 sessionStorage 恢复
  if (!store.isLoggedIn) {
    let tokenKey: string, userKey: string
    if (isBB) { tokenKey = 'bigbrother_token'; userKey = 'bigbrother_user' }
    else if (isLV) { tokenKey = 'lovevariety_token'; userKey = 'lovevariety_user' }
    else if (isPC) { tokenKey = 'powerchallenge_token'; userKey = 'powerchallenge_user' }
    else { tokenKey = store.gameKey('token'); userKey = store.gameKey('user') }
    const token = sessionStorage.getItem(tokenKey)
    const userJson = sessionStorage.getItem(userKey)
    if (token && userJson) {
      try {
        const user = JSON.parse(userJson)
        if (isBB) { (bbAuthStore as any).currentUser = user }
        else if (isLV) { (lvAuthStore as any).currentUser = user }
        else if (isPC) { (pcAuthStore as any).currentUser = user }
        else { (authStore as any).setUser(user) }
      } catch {
        if (isBB || isLV || isPC) sessionStorage.removeItem(tokenKey)
        else sessionStorage.removeItem(tokenKey)
      }
    }
  }

  // 未登录 → 跳游戏对应的登录页
  if (!store.isLoggedIn) {
    return `/games/${currentGameId}/login`
  }

  if (to.meta.requiresAdmin) {
    if (store.isAdmin) { return true }
    return `/games/${currentGameId}/admin/dashboard`
  } else if (to.meta.requiresPlayer) {
    if (store.isPlayer || store.isHouseguest) { return true }
    return `/games/${currentGameId}/player/home`
  }

  return true
})

export default router
