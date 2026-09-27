// 富文本（题目）安全渲染：仅保留少量安全标签/属性
const ALLOWED_TAGS = ['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'IMG', 'A', 'P', 'DIV', 'SPAN', 'UL', 'OL', 'LI']

export function sanitizeRichText(html?: string | null): string {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = String(html)

  const walk = (node: Element) => {
    const children = Array.from(node.children)
    for (const el of children) {
      const tag = el.tagName
      if (!ALLOWED_TAGS.includes(tag)) {
        const frag = document.createDocumentFragment()
        while (el.firstChild) frag.appendChild(el.firstChild)
        el.replaceWith(frag)
        walk(node)
        continue
      }
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase()
        const ok =
          (tag === 'IMG' && name === 'src') ||
          (tag === 'A' && (name === 'href' || name === 'target' || name === 'rel'))
        if (!ok) el.removeAttribute(attr.name)
      }
      if (tag === 'IMG') {
        const src = el.getAttribute('src') || ''
        if (!/^(https?:)?\/\//.test(src) && !src.startsWith('/')) el.removeAttribute('src')
        el.setAttribute('style', 'max-width:100%;border-radius:6px;margin:6px 0;')
      }
      if (tag === 'A') {
        el.setAttribute('target', '_blank')
        el.setAttribute('rel', 'noopener noreferrer')
      }
      walk(el)
    }
  }
  walk(div)
  return div.innerHTML
}

// 判断富文本是否有实际内容（去标签后非空，或有图片）
export function hasRichContent(html?: string | null): boolean {
  if (!html) return false
  if (/<img\b/i.test(html)) return true
  const text = String(html).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
  return text.length > 0
}
