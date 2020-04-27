/* eslint-disable no-console */

const path = require('path');

const set = require('lodash/set');
const render = require('koa-ejs');
const helmet = require('koa-helmet');

const { Provider } = require('../lib'); // require('oidc-provider');

const Account = require('./support/account');
const configuration = require('./support/configuration');
const routes = require('./routes/koa');

const { PORT = 3000, ISSUER = `http://localhost:${PORT}` } = process.env;
configuration.findAccount = Account.findAccount;

let server;

(async () => {
  let adapter;
  if (process.env.MONGODB_URI) {
    adapter = require('./adapters/mongodb'); // eslint-disable-line global-require
    await adapter.connect();
  }

  const provider = new Provider(ISSUER, { adapter, ...configuration });

  provider.registerGrantType('password', async function passwordGrantType(ctx, next) {
    Account.listStores();
    let account;
    if ((account = await Account.findAccount(ctx, ctx.oidc.params.username, ctx.oidc.params.password))) {
      const AccessToken = provider.AccessToken;
      const at = new AccessToken({
        gty: 'password',
        accountId: account.accountId,
        client: ctx.oidc.client,
        grantId: ctx.oidc.uuid,
        scope: ctx.oidc.client.scope,
      });
      console.log(`AccountID: ${at.accountId}`);
      const accessToken = await at.save();

      ctx.body = {
        access_token: accessToken,
        expires_in: at.expiration,
        token_type: 'Bearer',
        scope: ctx.oidc.client.scope,
      };
    } else {
      ctx.body = {
        error: 'invalid_grant',
        error_description: 'invalid credentials provided',
      };
      ctx.status = 400;
    }

    await next();
  }, ['username', 'password'], []);

  provider.use(helmet());

  if (process.env.NODE_ENV === 'production') {
    provider.proxy = true;
    set(configuration, 'cookies.short.secure', true);
    set(configuration, 'cookies.long.secure', true);

    provider.use(async (ctx, next) => {
      if (ctx.secure) {
        await next();
      } else if (ctx.method === 'GET' || ctx.method === 'HEAD') {
        ctx.redirect(ctx.href.replace(/^http:\/\//i, 'https://'));
      } else {
        ctx.body = {
          error: 'invalid_request',
          error_description: 'do yourself a favor and only use https',
        };
        ctx.status = 400;
      }
    });
  }
  render(provider.app, {
    cache: false,
    viewExt: 'ejs',
    layout: '_layout',
    root: path.join(__dirname, 'views'),
  });
  provider.use(routes(provider).routes());
  server = provider.listen(PORT, () => {
    console.log(`application is listening on port ${PORT}, check its /.well-known/openid-configuration`);
  });
})().catch((err) => {
  if (server && server.listening) server.close();
  console.error(err);
  process.exitCode = 1;
});
