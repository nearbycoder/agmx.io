import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import { nitro } from "nitro/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
  server: { port: 3100, strictPort: true },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "@radix-ui/react-dialog",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-popover",
      "@radix-ui/react-tabs",
      "@radix-ui/react-switch",
      "@radix-ui/react-select",
      "cmdk",
      "sonner",
      "lucide-react",
      "motion/react",
      "clsx",
      "tailwind-merge",
      "class-variance-authority",
      "better-auth/react",
      "better-auth/client/plugins",
      "@tanstack/react-query"
    ]
  },
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart({
      router: { routeFileIgnorePattern: "\\.(test|spec)\\." }
    }),
    nitro({ preset: "node-server" }),
    viteReact()
  ]
})
