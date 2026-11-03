import { useEffect, useState } from "react"
import { modKey } from "./utils"

/** `modKey()` for markup that is also server-rendered: starts as ⌘ and corrects itself after hydration. */
export const useModKey = () => {
  const [key, setKey] = useState("⌘")
  useEffect(() => setKey(modKey()), [])
  return key
}
