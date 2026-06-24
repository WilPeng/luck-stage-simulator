import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '../stores/authStore'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/auth/LoginView.vue')
  },
  {
    path: '/player',
    name: 'Player',
    redirect: '/player/home',
    meta: { requiresPlayer: true },
    component: () => import('../layouts/PlayerLayout.vue'),
    children: [
      {
        path: 'home',
        name: 'PlayerHome',
        component: () => import('../views/player/PlayerHomeView.vue')
      },
      {
        path: 'profile',
        name: 'PlayerProfile',
        component: () => import('../views/player/PlayerProfileView.vue')
      },
      {
        path: 'chat',
        name: 'PlayerChat',
        component: () => import('../views/ChatView.vue')
      },
      {
        path: 'history',
        name: 'PlayerHistory',
        component: () => import('../views/player/PlayerHistoryView.vue')
      },
      // 轮次相关路由
      {
        path: 'round/:round/preparation',
        name: 'PlayerPreparation',
        component: () => import('../views/player/PlayerPlaceholderView.vue')
      },
      {
        path: 'round/:round/captain',
        name: 'PlayerCaptain',
        component: () => import('../views/player/PlayerCaptainView.vue')
      },
      {
        path: 'round/:round/team',
        name: 'PlayerTeam',
        component: () => import('../views/player/PlayerTeamView.vue')
      },
      {
        path: 'round/:round/song-selection',
        name: 'PlayerSongSelection',
        component: () => import('../views/player/PlayerSongSelectionView.vue')
      },
      {
        path: 'round/:round/training',
        name: 'PlayerTraining',
        component: () => import('../views/player/PlayerTrainingView.vue')
      },
      {
        path: 'round/:round/performance',
        name: 'PlayerPerformance',
        component: () => import('../views/player/PlayerPerformanceView.vue')
      },
      {
        path: 'round/:round/elimination',
        name: 'PlayerElimination',
        component: () => import('../views/player/PlayerEliminationView.vue')
      }
    ]
  },
  {
    path: '/admin',
    name: 'Admin',
    redirect: '/admin/dashboard',
    meta: { requiresAdmin: true },
    component: () => import('../layouts/AdminLayout.vue'),
    children: [
      {
        path: 'dashboard',
        name: 'AdminDashboard',
        component: () => import('../views/admin/AdminDashboardView.vue')
      },
      {
        path: 'players',
        name: 'AdminPlayers',
        component: () => import('../views/admin/AdminPlayerView.vue')
      },
      {
        path: 'stage',
        name: 'AdminStage',
        component: () => import('../views/admin/AdminStageView.vue')
      },
      {
        path: 'performance-rounds',
        name: 'AdminPerformanceRounds',
        redirect: '/admin/stage'
      },
      {
        path: 'teams',
        name: 'AdminTeams',
        component: () => import('../views/admin/AdminTeamView.vue')
      },
      {
        path: 'songs',
        name: 'AdminSongs',
        component: () => import('../views/admin/AdminSongManageView.vue')
      },
      {
        path: 'training-cards',
        name: 'AdminTrainingCards',
        component: () => import('../views/admin/AdminTrainingCardManageView.vue')
      },
      {
        path: 'training-records',
        name: 'AdminTrainingRecords',
        component: () => import('../views/admin/AdminTrainingRecordView.vue')
      },
      {
        path: 'performance',
        name: 'AdminPerformance',
        component: () => import('../views/admin/AdminPerformanceView.vue')
      },
      {
        path: 'audience-vote',
        name: 'AdminAudienceVote',
        component: () => import('../views/admin/AudienceVoteView.vue')
      },
      {
        path: 'elimination',
        name: 'AdminElimination',
        component: () => import('../views/admin/AdminEliminationView.vue')
      },
      {
        path: 'ranking',
        name: 'AdminRanking',
        component: () => import('../views/admin/AdminRankingView.vue')
      },
      {
        path: 'logs',
        name: 'AdminLogs',
        component: () => import('../views/admin/AdminLogView.vue')
      },
      {
        path: 'chat',
        name: 'AdminChat',
        component: () => import('../views/ChatView.vue')
      },
      {
        path: 'round/:round/preparation',
        name: 'AdminRoundPreparation',
        component: () => import('../views/admin/AdminPreparationView.vue')
      },
      {
        path: 'round/:round/captain_vote',
        name: 'AdminRoundCaptain',
        component: () => import('../views/admin/AdminCaptainView.vue')
      },
      {
        path: 'round/:round/teaming',
        name: 'AdminRoundTeam',
        component: () => import('../views/admin/AdminTeamView.vue')
      },
      {
        path: 'round/:round/song_select',
        name: 'AdminRoundSong',
        component: () => import('../views/admin/AdminSongView.vue')
      },
      {
        path: 'round/:round/training',
        name: 'AdminRoundTraining',
        component: () => import('../views/admin/AdminTrainingCardView.vue')
      },
      {
        path: 'round/:round/performance',
        name: 'AdminRoundPerformance',
        component: () => import('../views/admin/AdminPerformanceView.vue')
      },
      {
        path: 'round/:round/elimination',
        name: 'AdminRoundElimination',
        component: () => import('../views/admin/AdminEliminationView.vue')
      }
    ]
  },
  {
    path: '/',
    redirect: '/login'
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/login'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  // 登录页直接放行，不走认证检查
  if (to.path === '/login') {
    return true
  }

  const authStore = useAuthStore()

  // 未登录时尝试从 sessionStorage 恢复
  if (!authStore.isLoggedIn) {
    const token = sessionStorage.getItem('luck_sim_token')
    const userJson = sessionStorage.getItem('luck_sim_user')
    if (token && userJson) {
      try {
        authStore.setUser(JSON.parse(userJson))
      } catch {
        sessionStorage.removeItem('luck_sim_token')
        sessionStorage.removeItem('luck_sim_user')
      }
    }
  }

  // 仍未登录 → 跳登录页
  if (!authStore.isLoggedIn) {
    return '/login'
  }

  if (to.meta.requiresAdmin) {
    if (authStore.isAdmin) {
      return true
    }
    return '/admin/dashboard'
  } else if (to.meta.requiresPlayer) {
    if (authStore.isPlayer) {
      return true
    }
    return '/player/home'
  }

  return true
})

export default router
