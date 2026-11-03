import { Layer } from "effect"
import { HttpRouter, HttpServer } from "effect/http"
import { HttpApiBuilder, HttpApiScalar } from "effect/http-api"
import { AgmxApi } from "~/shared/api/Api"
import { AppLayer, memoMap } from "../runtime"
import { AuthorizationLive } from "./Authorization"
import { HandlersLive } from "./handlers"

const ApiRoutes = HttpApiBuilder.layer(AgmxApi, { openapiPath: "/api/v1/openapi.json" }).pipe(
  Layer.provide(HandlersLive),
  Layer.provide(AuthorizationLive)
)

const DocsRoute = HttpApiScalar.layer(AgmxApi, { path: "/api/v1/reference" })

const AllRoutes = Layer.mergeAll(ApiRoutes, DocsRoute).pipe(
  Layer.provide(AppLayer),
  Layer.provide(HttpServer.layerServices)
)

type Handler = ReturnType<typeof HttpRouter.toWebHandler<any, any, any, any>>
const globals = globalThis as unknown as { __agmxApiHandler?: Handler }

/** The Effect HttpApi as a fetch-style handler, mounted by TanStack Start at /api/v1/*. */
export const apiHandler: Handler = (globals.__agmxApiHandler ??= HttpRouter.toWebHandler(AllRoutes, { memoMap, disableLogger: true }))
