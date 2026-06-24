import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '../types/user'
import { 
  getUsers as apiGetUsers, 
  getUserList, 
  getUserById as apiGetUserById,
  createUser as apiCreateUser,
  updateUser as apiUpdateUser, 
  deleteUser as apiDeleteUser,
  updateUserStatus as apiUpdateUserStatus,
  drawTraining,
  getUserStats as apiGetUserStats,
  batchCreateUsers as apiBatchCreateUsers,
  type UserQueryParams,
  type UserListResponse,
  type UserStats,
  type BatchCreateResult
} from '../services/api'

export const usePlayerStore = defineStore('player', () => {
  const users = ref<User[]>([])
  const total = ref(0)
  const currentPage = ref(1)
  const pageSize = ref(20)
  const loading = ref(false)
  const stats = ref<UserStats | null>(null)

  const totalPages = computed(() => Math.ceil(total.value / pageSize.value))

  async function fetchUsers(params?: UserQueryParams): Promise<void> {
    loading.value = true
    try {
      const data = await apiGetUsers(params)
      users.value = data.list
      total.value = data.total
    } catch (e) {
      users.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  async function fetchAllUsers(): Promise<void> {
    loading.value = true
    try {
      const data = await apiGetUsers({ pageSize: 1000 })
      users.value = data.list
      total.value = data.total
    } catch (e) {
      users.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  async function fetchUsersWithPagination(params?: UserQueryParams): Promise<UserListResponse> {
    loading.value = true
    try {
      const result = await getUserList({
        page: currentPage.value,
        pageSize: pageSize.value,
        ...params
      })
      users.value = result.list
      total.value = result.total
      if (result.page) currentPage.value = result.page
      if (result.pageSize) pageSize.value = result.pageSize
      return result
    } catch (e) {
      console.error('[PlayerStore] fetchUsersWithPagination error:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchUserById(id: string): Promise<User> {
    return await apiGetUserById(id)
  }

  async function createUser(userData: Partial<User>): Promise<User> {
    const newUser = await apiCreateUser(userData)
    await fetchUsers()
    return newUser
  }

  async function updateUser(user: Partial<User> & { id: string }): Promise<void> {
    const data = await apiUpdateUser(user)
    const index = users.value.findIndex((u: User) => u.id === user.id)
    if (index !== -1) {
      users.value[index] = data
    }
  }

  async function deleteUser(id: string): Promise<void> {
    await apiDeleteUser(id)
    await fetchUsers()
  }

  async function updateUserStatus(id: string, status: string): Promise<void> {
    const data = await apiUpdateUserStatus(id, status)
    const index = users.value.findIndex((u: User) => u.id === id)
    if (index !== -1) {
      users.value[index] = data
    }
  }

  async function drawCard(userId: string): Promise<{ cardName: string; effect: { vocal?: number; dance?: number; charm?: number } }> {
    const result = await drawTraining(userId)
    await fetchUsers()
    const record = result.record
    return {
      cardName: record?.cardName || '',
      effect: record?.effect || {}
    }
  }

  async function fetchStats(): Promise<UserStats> {
    try {
      const data = await apiGetUserStats()
      stats.value = data
      return data
    } catch (e) {
      return { total: 0, active: 0, eliminated: 0 } as UserStats
    }
  }

  async function batchCreate(usersData: Partial<User>[]): Promise<BatchCreateResult> {
    const result = await apiBatchCreateUsers(usersData)
    await fetchUsers()
    return result
  }

  function getPlayerById(id: string): User | undefined {
    return users.value.find((u: User) => u.id === id)
  }

  function getPlayers(): User[] {
    return users.value.filter((u: User) => u.role !== 'admin')
  }

  // @deprecated 使用 team.memberIds 按轮次查找队伍
  function getTeamMembers(teamId: string): User[] {
    return users.value.filter((u: User) => u.teamId === teamId)
  }

  // @deprecated 使用 team.captainId 按轮次查找队长
  function getCaptain(teamId: string): User | undefined {
    return users.value.find((u: User) => u.role === 'captain' && u.teamId === teamId)
  }

  function setPage(page: number) {
    currentPage.value = page
  }

  function setPageSize(size: number) {
    pageSize.value = size
  }

  return {
    users,
    total,
    currentPage,
    pageSize,
    totalPages,
    loading,
    stats,
    fetchUsers,
    fetchAllUsers,
    fetchUsersWithPagination,
    fetchUserById,
    createUser,
    updateUser,
    deleteUser,
    updateUserStatus,
    fetchStats,
    batchCreate,
    drawCard,
    getPlayerById,
    getPlayers,
    getTeamMembers,
    getCaptain,
    setPage,
    setPageSize
  }
})
