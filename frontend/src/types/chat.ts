// 聊天消息类型
export interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  senderRole: 'admin' | 'player'
  senderAvatar?: string
  content: string
  createdAt: string
}

// 聊天消息列表响应
export interface ChatMessageListResponse {
  list: ChatMessage[]
  total: number
  page: number
  pageSize: number
}
