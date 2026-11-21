import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"

export type Theme = "light" | "dark" | "system"
const ThemeContext = createContext<{ theme: Theme; resolved: "light" | "dark"; setTheme: (t: Theme) => void }>({
  theme: "system",
  resolved: "light",
  setTheme: () => {}
})

const apply = (theme: Theme) => {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", dark)
  return dark ? "dark" : "light"
}

/** Inline script that runs before paint to avoid a theme flash. */
export const themeScript = `(function(){try{var t=localStorage.getItem('agmx-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})()`

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<Theme>("system")
  const [resolved, setResolved] = useState<"light" | "dark">("light")

  useEffect(() => {
    let stored: Theme = "system"
    try {
      stored = (localStorage.getItem("agmx-theme") as Theme) || "system"
    } catch {}
    setThemeState(stored)
    setResolved(apply(stored))
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      let current: Theme = "system"
      try {
        current = (localStorage.getItem("agmx-theme") as Theme) || "system"
      } catch {}
      setResolved(apply(current))
    }
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  const setTheme = useCallback((t: Theme) => {
    try {
      localStorage.setItem("agmx-theme", t)
    } catch {}
    setThemeState(t)
    setResolved(apply(t))
  }, [])

  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
