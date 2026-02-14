# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```


### Backend API target

The app proxies all `/api/*` requests during development. By default, it forwards to `http://127.0.0.1:5275`.

If your API runs somewhere else (different port, Docker host, remote URL), set one or both env vars before `yarn dev`:

```bash
# Shared API origin used by dev proxies and runtime base URL
export NUXT_API_ORIGIN=http://host.docker.internal:5275

# Optional: override only the runtime API base (defaults to $NUXT_API_ORIGIN/api)
export NUXT_PUBLIC_API_BASE=http://host.docker.internal:5275/api
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.
