import { useState } from 'react'
import type { Book } from '@/types'

interface CartDeps {
  showToast: (message: string, icon?: string) => void
}

// Cart domain (Phase B). Trivial/acyclic — depends only on showToast.
export function useCart({ showToast }: CartDeps) {
  // Cart (loaded from Firestore user doc)
  const [cart, setCart] = useState<Book[]>([])

  const handleAddToCart = (book: Book) => {
    if (cart.find(item => item.id === book.id)) {
      showToast('Book is already in your cart!', 'info')
      return
    }
    setCart([...cart, book])
    showToast('Book added to cart!', 'shopping_cart')
  }

  return { cart, setCart, handleAddToCart }
}
