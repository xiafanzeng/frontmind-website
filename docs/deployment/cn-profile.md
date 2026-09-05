# FrontMind .cn deployment

The existing .net production profile remains the default. Build the isolated .cn
website with `FRONTMIND_DEPLOYMENT_TARGET=cn`. This selects the canonical website,
search metadata, customer login, and the internal Dashboard service together.
The server bundle fixes the selected profile at build time. Runtime endpoint or
deployment-target mismatches fail startup.

From a clean commit:

```sh
FRONTMIND_DEPLOYMENT_TARGET=cn pnpm build:release
```

For the production image, pass the full committed source SHA:

```sh
docker build --build-arg FRONTMIND_BUILD_SHA=<full-commit-sha> \
  --build-arg FRONTMIND_DEPLOYMENT_TARGET=cn \
  -t frontmind-website:<full-commit-sha>-cn .
```

Required public and internal routing values:

```text
FRONTMIND_DEPLOYMENT_TARGET=cn
FRONTMIND_PUBLIC_BASE_URL=https://www.frontmind.cn
FRONTMIND_PRESALES_AGENT_URL=http://dashboard:3001/api/internal/presales/v2
FRONTMIND_AGENT_PROVISIONING_URL=http://dashboard:3001/api/internal/provisioning
FRONTMIND_AGENT_INTERNAL_HTTP_HOSTS=dashboard
```

Keep production payment, agent authentication, session, persistence, and mail
configuration in server-only runtime secrets. The .cn website and Dashboard
must share the credentials for their existing authenticated internal APIs.
The website's customer entrance is compiled as
`https://dashboard.frontmind.cn/login`. `/healthz` reports `deploymentTarget` so
operators can confirm that the deployed artifact is the .cn build.
