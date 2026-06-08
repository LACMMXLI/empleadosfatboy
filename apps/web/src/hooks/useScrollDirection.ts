import { useEffect, useState } from "react"

export function useScrollDirection() {
  const [scrollDir, setScrollDir] = useState<"up" | "down">("up")
  const [isNearTop, setIsNearTop] = useState(true)

  useEffect(() => {
    let lastScrollY = window.scrollY
    let ticking = false

    const updateScrollDirection = () => {
      const scrollY = window.scrollY
      setIsNearTop(scrollY < 15)

      if (Math.abs(scrollY - lastScrollY) < 5) {
        ticking = false
        return
      }

      if (scrollY > lastScrollY) {
        setScrollDir("down")
      } else {
        setScrollDir("up")
      }
      lastScrollY = scrollY > 0 ? scrollY : 0
      ticking = false
    }

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScrollDirection)
        ticking = true
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return { scrollDir, isNearTop }
}
