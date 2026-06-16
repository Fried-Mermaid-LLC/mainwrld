import React from 'react'

// Render formatted content (markdown-like syntax and HTML tags)
export const renderFormattedContent = (content: string) => {
  if (!content) return null
  // Convert markdown-like syntax to HTML
  let html = content
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') // **bold**
    .replace(/\*(.+?)\*/g, '<em>$1</em>') // *italic*
    .replace(/• /g, '&bull; ') // bullet points
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}
